use base64::{engine::general_purpose::STANDARD, Engine};
use ldap3::{Scope, SearchEntry};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Instant,
};
use tauri::State;

use crate::{
    logging::{log_command_end, log_command_error, log_command_start, new_request_id, truncate_preview},
    state_management::app_state::AppState,
};

// ─── Advanced Search Types ───

/// Parameters accepted by the advanced search command.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchParams {
    pub base_dn: String,
    pub scope: String,
    pub filter: String,
    pub returning_attributes: Vec<String>,
    pub size_limit: u32,
    pub time_limit_seconds: u32,
}

/// A single entry in advanced search results with multi-valued attributes.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultEntry {
    pub dn: String,
    pub attributes: HashMap<String, Vec<String>>,
}

/// Envelope returned by the advanced search command.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub entries: Vec<SearchResultEntry>,
    pub entry_count: usize,
    pub truncated: bool,
    pub warnings: Vec<String>,
}

/// Perform a comprehensive LDAP search with advanced options.
#[tauri::command]
pub fn search_ldap(
    state: State<'_, Arc<Mutex<AppState>>>,
    params: SearchParams,
) -> Result<SearchResponse, String> {
    let req_id = new_request_id();
    let start = Instant::now();
    log_command_start(
        "search_ldap",
        &req_id,
        &format!(
            "base_dn={}, scope={}, filter={}, size_limit={}",
            truncate_preview(&params.base_dn, 200),
            params.scope,
            truncate_preview(&params.filter, 200),
            params.size_limit
        ),
    );

    let app_state = state.lock().unwrap();
    let ldap_conn = &mut *app_state.ldap_connection.lock().unwrap();

    let conn = ldap_conn
        .as_mut()
        .ok_or_else(|| {
            let msg = "No LDAP connection available".to_string();
            log_command_error("search_ldap", &req_id, start, &msg);
            msg
        })?;

    let ldap_scope = match params.scope.to_lowercase().as_str() {
        "base" => Scope::Base,
        "one" | "onelevel" => Scope::OneLevel,
        _ => Scope::Subtree,
    };

    let attr_refs: Vec<&str> = if params.returning_attributes.is_empty()
        || (params.returning_attributes.len() == 1 && params.returning_attributes[0] == "*")
    {
        vec!["*"]
    } else {
        params
            .returning_attributes
            .iter()
            .map(|s| s.as_str())
            .collect()
    };

    let (results, _res) = conn
        .search(&params.base_dn, ldap_scope, &params.filter, attr_refs)
        .map_err(|e| {
            let msg = format!("Search failed: {}", e);
            log_command_error("search_ldap", &req_id, start, &msg);
            msg
        })?
        .success()
        .map_err(|e| {
            let msg = format!("Search result error: {}", e);
            log_command_error("search_ldap", &req_id, start, &msg);
            msg
        })?;

    let total_server_results = results.len();
    let mut entries: Vec<SearchResultEntry> = Vec::new();
    let mut truncated = false;
    let mut warnings: Vec<String> = Vec::new();

    for (i, entry) in results.into_iter().enumerate() {
        if params.size_limit > 0 && i as u32 >= params.size_limit {
            truncated = true;
            break;
        }
        let se = SearchEntry::construct(entry);

        let mut attrs: HashMap<String, Vec<String>> = HashMap::new();
        for (key, values) in se.attrs {
            attrs.insert(key, values);
        }
        for (key, bin_values) in se.bin_attrs {
            let b64: Vec<String> = bin_values.iter().map(|v| STANDARD.encode(v)).collect();
            attrs.insert(key, b64);
        }

        entries.push(SearchResultEntry {
            dn: se.dn,
            attributes: attrs,
        });
    }

    if truncated {
        warnings.push(format!(
            "Results truncated: showing {} of {} entries (limit {})",
            entries.len(),
            total_server_results,
            params.size_limit
        ));
    }

    let entry_count = entries.len();
    tracing::info!(
        req_id = req_id,
        entry_count = entry_count,
        truncated = truncated,
        "search_ldap completed"
    );
    log_command_end("search_ldap", &req_id, start);
    Ok(SearchResponse {
        entries,
        entry_count,
        truncated,
        warnings,
    })
}

/// Lightweight connectivity check.
#[tauri::command]
pub fn is_ldap_connected(
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<bool, String> {
    let req_id = new_request_id();
    let start = Instant::now();
    tracing::debug!(req_id = req_id, "is_ldap_connected check");

    let app_state = state.lock().unwrap();
    let ldap_conn = &mut *app_state.ldap_connection.lock().unwrap();

    let result = match ldap_conn.as_mut() {
        None => Ok(false),
        Some(conn) => {
            match conn.search("", Scope::Base, "(objectClass=*)", vec!["namingContexts"]) {
                Ok(result) => match result.success() {
                    Ok(_) => Ok(true),
                    Err(_) => Ok(false),
                },
                Err(_) => Ok(false),
            }
        }
    };

    tracing::debug!(req_id = req_id, connected = ?result, duration_ms = start.elapsed().as_millis(), "is_ldap_connected result");
    result
}

/// Fetch the RootDSE entry.
#[tauri::command]
pub fn fetch_root_dse(
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<HashMap<String, Vec<String>>, String> {
    let req_id = new_request_id();
    let start = Instant::now();
    log_command_start("fetch_root_dse", &req_id, "");

    let app_state = state.lock().unwrap();
    let ldap_conn = &mut *app_state.ldap_connection.lock().unwrap();

    let conn = ldap_conn
        .as_mut()
        .ok_or_else(|| {
            let msg = "No LDAP connection available".to_string();
            log_command_error("fetch_root_dse", &req_id, start, &msg);
            msg
        })?;

    let (results, _res) = conn
        .search("", Scope::Base, "(objectClass=*)", vec!["*", "+"])
        .map_err(|e| {
            let msg = format!("RootDSE search failed: {}", e);
            log_command_error("fetch_root_dse", &req_id, start, &msg);
            msg
        })?
        .success()
        .map_err(|e| {
            let msg = format!("RootDSE result error: {}", e);
            log_command_error("fetch_root_dse", &req_id, start, &msg);
            msg
        })?;

    let mut attrs: HashMap<String, Vec<String>> = HashMap::new();
    if let Some(entry) = results.into_iter().next() {
        let se = SearchEntry::construct(entry);
        for (key, values) in se.attrs {
            attrs.insert(key, values);
        }
        for (key, bin_values) in se.bin_attrs {
            let b64: Vec<String> = bin_values.iter().map(|v| STANDARD.encode(v)).collect();
            attrs.insert(key, b64);
        }
    }

    log_command_end("fetch_root_dse", &req_id, start);
    Ok(attrs)
}

/// Fetch node attributes including operational attributes.
#[tauri::command]
pub fn fetch_node_attributes_operational(
    state: State<'_, Arc<Mutex<AppState>>>,
    base_dn: &str,
) -> Result<HashMap<String, Vec<String>>, String> {
    let req_id = new_request_id();
    let start = Instant::now();
    log_command_start("fetch_node_attributes_operational", &req_id, &format!("base_dn={}", truncate_preview(base_dn, 200)));

    let app_state = state.lock().unwrap();
    let ldap_conn = &mut *app_state.ldap_connection.lock().unwrap();

    let conn = ldap_conn
        .as_mut()
        .ok_or_else(|| {
            let msg = "No LDAP connection available".to_string();
            log_command_error("fetch_node_attributes_operational", &req_id, start, &msg);
            msg
        })?;

    let (results, _) = conn
        .search(base_dn, Scope::Base, "(objectClass=*)", vec!["*", "+"])
        .map_err(|e| {
            let msg = format!("Failed to search LDAP: {}", e);
            log_command_error("fetch_node_attributes_operational", &req_id, start, &msg);
            msg
        })?
        .success()
        .map_err(|e| {
            let msg = format!("Failed to parse LDAP response: {}", e);
            log_command_error("fetch_node_attributes_operational", &req_id, start, &msg);
            msg
        })?;

    let mut attributes = HashMap::new();
    if let Some(entry) = results.into_iter().next() {
        let se = SearchEntry::construct(entry);
        for (key, values) in se.attrs {
            attributes.insert(key, values);
        }
        for (key, bin_values) in se.bin_attrs {
            let b64: Vec<String> = bin_values.iter().map(|v| STANDARD.encode(v)).collect();
            attributes.insert(key, b64);
        }
    }

    log_command_end("fetch_node_attributes_operational", &req_id, start);
    Ok(attributes)
}

/// Return LDIF representation of a single entry.
#[tauri::command]
pub fn get_entry_ldif(
    state: State<'_, Arc<Mutex<AppState>>>,
    base_dn: &str,
    include_operational: bool,
) -> Result<String, String> {
    let req_id = new_request_id();
    let start = Instant::now();
    log_command_start("get_entry_ldif", &req_id, &format!("base_dn={}", truncate_preview(base_dn, 200)));

    let app_state = state.lock().unwrap();
    let ldap_conn = &mut *app_state.ldap_connection.lock().unwrap();

    let conn = ldap_conn
        .as_mut()
        .ok_or_else(|| {
            let msg = "No LDAP connection available".to_string();
            log_command_error("get_entry_ldif", &req_id, start, &msg);
            msg
        })?;

    let requested_attrs = if include_operational {
        vec!["*", "+"]
    } else {
        vec!["*"]
    };

    let (results, _) = conn
        .search(base_dn, Scope::Base, "(objectClass=*)", requested_attrs)
        .map_err(|e| format!("Failed to search LDAP: {}", e))?
        .success()
        .map_err(|e| format!("Failed to parse LDAP response: {}", e))?;

    if let Some(entry) = results.into_iter().next() {
        let se = SearchEntry::construct(entry);
        log_command_end("get_entry_ldif", &req_id, start);
        Ok(format_ldif_entry(&se))
    } else {
        let msg = format!("No entry found for DN: {}", base_dn);
        log_command_error("get_entry_ldif", &req_id, start, &msg);
        Err(msg)
    }
}

/// Export LDIF for a subtree.
#[tauri::command]
pub fn export_ldif(
    state: State<'_, Arc<Mutex<AppState>>>,
    base_dn: &str,
    scope: &str,
    include_operational: bool,
) -> Result<String, String> {
    let req_id = new_request_id();
    let start = Instant::now();
    log_command_start("export_ldif", &req_id, &format!("base_dn={}, scope={}", truncate_preview(base_dn, 200), scope));

    let app_state = state.lock().unwrap();
    let ldap_conn = &mut *app_state.ldap_connection.lock().unwrap();

    let conn = ldap_conn
        .as_mut()
        .ok_or_else(|| {
            let msg = "No LDAP connection available".to_string();
            log_command_error("export_ldif", &req_id, start, &msg);
            msg
        })?;

    let ldap_scope = match scope.to_lowercase().as_str() {
        "base" => Scope::Base,
        "one" | "onelevel" => Scope::OneLevel,
        _ => Scope::Subtree,
    };

    let requested_attrs = if include_operational {
        vec!["*", "+"]
    } else {
        vec!["*"]
    };

    let (results, _) = conn
        .search(base_dn, ldap_scope, "(objectClass=*)", requested_attrs)
        .map_err(|e| {
            let msg = format!("LDIF export search failed: {}", e);
            log_command_error("export_ldif", &req_id, start, &msg);
            msg
        })?
        .success()
        .map_err(|e| {
            let msg = format!("LDIF export result error: {}", e);
            log_command_error("export_ldif", &req_id, start, &msg);
            msg
        })?;

    let mut ldif = String::new();
    for (i, entry) in results.into_iter().enumerate() {
        if i > 0 {
            ldif.push('\n');
        }
        let se = SearchEntry::construct(entry);
        ldif.push_str(&format_ldif_entry(&se));
    }

    log_command_end("export_ldif", &req_id, start);
    Ok(ldif)
}

/// Format a single SearchEntry into LDIF text.
fn format_ldif_entry(se: &SearchEntry) -> String {
    let mut lines = Vec::new();
    lines.push(format!("dn: {}", se.dn));

    // Sort attribute keys for consistent output
    let mut attr_keys: Vec<&String> = se.attrs.keys().collect();
    attr_keys.sort();
    for key in attr_keys {
        if let Some(values) = se.attrs.get(key) {
            for val in values {
                if needs_base64_encoding(val) {
                    lines.push(format!("{}:: {}", key, STANDARD.encode(val.as_bytes())));
                } else {
                    lines.push(format!("{}: {}", key, val));
                }
            }
        }
    }

    // Binary attributes always get base64-encoded
    let mut bin_keys: Vec<&String> = se.bin_attrs.keys().collect();
    bin_keys.sort();
    for key in bin_keys {
        if let Some(values) = se.bin_attrs.get(key) {
            for val in values {
                lines.push(format!("{}:: {}", key, STANDARD.encode(val)));
            }
        }
    }

    lines.push(String::new()); // trailing blank line per LDIF spec
    lines.join("\n")
}

/// Check whether a string value requires base64 encoding in LDIF.
/// Rules: starts with space/colon/<, contains non-ASCII, or contains \0 or \n.
fn needs_base64_encoding(val: &str) -> bool {
    if val.is_empty() {
        return false;
    }
    let first = val.chars().next().unwrap();
    if first == ' ' || first == ':' || first == '<' {
        return true;
    }
    val.chars()
        .any(|c| c == '\0' || c == '\n' || c == '\r' || !c.is_ascii())
}
