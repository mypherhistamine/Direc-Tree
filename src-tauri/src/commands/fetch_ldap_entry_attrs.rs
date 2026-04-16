use base64::{engine::general_purpose::STANDARD, Engine};
use ldap3::{Scope, SearchEntry};
use regex::Regex;
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

#[tauri::command]
pub fn fetch_node_attributes(
    state: State<'_, Arc<Mutex<AppState>>>,
    base_dn: &str,
) -> Result<HashMap<String, Vec<String>>, String> {
    let req_id = new_request_id();
    let start = Instant::now();
    log_command_start("fetch_node_attributes", &req_id, &format!("base_dn={}", truncate_preview(base_dn, 200)));

    let app_state = state.lock().unwrap();
    let ldap_conn = &mut *app_state.ldap_connection.lock().unwrap();

    if let Some(conn) = ldap_conn {
        let (results, _) = conn
            .search(&base_dn, Scope::Base, "(objectClass=*)", vec!["*"])
            .map_err(|e| {
                let msg = format!("Failed to search LDAP: {}", e);
                log_command_error("fetch_node_attributes", &req_id, start, &msg);
                msg
            })?
            .success()
            .map_err(|e| {
                let msg = format!("Failed to parse LDAP response: {}", e);
                log_command_error("fetch_node_attributes", &req_id, start, &msg);
                msg
            })?;

        let mut attributes = HashMap::new();

        if let Some(entry) = results.into_iter().next() {
            let search_entry = SearchEntry::construct(entry);
            for (key, values) in search_entry.attrs {
                attributes.insert(key, values);
            }
            for (key, bin_values) in search_entry.bin_attrs {
                let b64: Vec<String> = bin_values.iter().map(|v| STANDARD.encode(v)).collect();
                attributes.insert(key, b64);
            }
        }
        tracing::debug!(req_id = req_id, attr_count = attributes.len(), "fetch_node_attributes result");
        log_command_end("fetch_node_attributes", &req_id, start);
        return Ok(attributes);
    }
    log_command_end("fetch_node_attributes", &req_id, start);
    Ok(HashMap::new())
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AttributeType {
    Xml,
    Base64,
    Json,
    String,
}

#[tauri::command]
pub fn determine_attribute_type(value: &str) -> AttributeType {
    tracing::debug!(value_len = value.len(), "determine_attribute_type");

    let json_regex = Regex::new(r"^\{.*\}$|^\[.*\]$").unwrap();
    if json_regex.is_match(value) {
        return AttributeType::Json;
    }

    let base64_regex =
        Regex::new(r"^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$").unwrap();
    if base64_regex.is_match(value) {
        return AttributeType::Base64;
    }

    let xml_regex = Regex::new(r"<.*?>").unwrap();
    if xml_regex.is_match(value) {
        return AttributeType::Xml;
    }

    AttributeType::String
}
