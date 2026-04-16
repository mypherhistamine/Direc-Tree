use ldap3::{Scope, SearchEntry};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::State;

use crate::{
    logging::{log_command_end, log_command_start, new_request_id},
    state_management::app_state::AppState,
};

#[tauri::command]
pub fn get_all_ldap_objects<'a>(state: State<'_, Arc<Mutex<AppState>>>) -> Vec<String> {
    let req_id = new_request_id();
    let start = Instant::now();
    log_command_start("get_all_ldap_objects", &req_id, "");

    let app_state = state.lock().unwrap();
    let ldap_conn = &mut *app_state.ldap_connection.lock().unwrap();
    let mut ldap_entries: Vec<String> = Vec::new();
    if let Some(ldap_conn) = ldap_conn {
        let (rs, _res) = ldap_conn
            .search(
                "cn=nids,ou=accessManagerContainer,o=novell",
                Scope::Subtree,
                "(objectClass=*)",
                vec!["*"],
            )
            .unwrap()
            .success()
            .unwrap();

        for entry in rs {
            let search_entry: SearchEntry = SearchEntry::construct(entry);
            ldap_entries.push(search_entry.dn);
        }
    } else {
        tracing::warn!(req_id = req_id, "get_all_ldap_objects: no connection");
    }

    tracing::debug!(req_id = req_id, count = ldap_entries.len(), "get_all_ldap_objects result");
    log_command_end("get_all_ldap_objects", &req_id, start);
    ldap_entries
}
