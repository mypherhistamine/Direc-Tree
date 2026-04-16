use base64::{engine::general_purpose::STANDARD, Engine};
use ldap3::{Scope, SearchEntry};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::State;

use crate::{
    logging::{log_command_end, log_command_error, log_command_start, new_request_id, truncate_preview},
    state_management::app_state::AppState,
};

/// Fetches a single attribute value from LDAP for a given DN.
#[tauri::command]
pub fn fetch_attribute_value(
    state: State<'_, Arc<Mutex<AppState>>>,
    base_dn: &str,
    attribute_key: &str,
) -> Result<Vec<String>, String> {
    let req_id = new_request_id();
    let start = Instant::now();
    log_command_start(
        "fetch_attribute_value",
        &req_id,
        &format!("base_dn={}, attr={}", truncate_preview(base_dn, 200), attribute_key),
    );

    let app_state = state.lock().unwrap();
    let ldap_conn = &mut *app_state.ldap_connection.lock().unwrap();

    if let Some(conn) = ldap_conn {
        let (results, _) = conn
            .search(base_dn, Scope::Base, "(objectClass=*)", vec![attribute_key])
            .map_err(|e| {
                let msg = format!("Failed to search LDAP: {}", e);
                log_command_error("fetch_attribute_value", &req_id, start, &msg);
                msg
            })?
            .success()
            .map_err(|e| {
                let msg = format!("Failed to parse LDAP response: {}", e);
                log_command_error("fetch_attribute_value", &req_id, start, &msg);
                msg
            })?;

        if let Some(entry) = results.into_iter().next() {
            let search_entry = SearchEntry::construct(entry);

            if let Some(values) = search_entry.attrs.get(attribute_key) {
                log_command_end("fetch_attribute_value", &req_id, start);
                return Ok(values.clone());
            }

            if let Some(bin_values) = search_entry.bin_attrs.get(attribute_key) {
                let b64_strings: Vec<String> =
                    bin_values.iter().map(|v| STANDARD.encode(v)).collect();
                log_command_end("fetch_attribute_value", &req_id, start);
                return Ok(b64_strings);
            }

            log_command_end("fetch_attribute_value", &req_id, start);
            return Ok(Vec::new());
        }

        let msg = format!("No entry found for DN: {}", base_dn);
        log_command_error("fetch_attribute_value", &req_id, start, &msg);
        return Err(msg);
    }

    let msg = "No LDAP connection available".to_string();
    log_command_error("fetch_attribute_value", &req_id, start, &msg);
    Err(msg)
}
