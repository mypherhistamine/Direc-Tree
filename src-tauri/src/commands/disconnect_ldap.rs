use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::State;

use crate::{
    logging::{self, log_command_end, log_command_start, new_request_id},
    state_management::app_state::AppState,
};

/// Disconnect from the current LDAP server.
/// Best-effort unbind, then clears the connection from state.
#[tauri::command]
pub fn disconnect_ldap(
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<(), String> {
    let req_id = new_request_id();
    let start = Instant::now();
    log_command_start("disconnect_ldap", &req_id, "");

    logging::log_connection_state("Connected", "Disconnecting", "user requested disconnect");

    let app_state = state.lock().unwrap();
    let mut ldap_conn = app_state.ldap_connection.lock().unwrap();

    if let Some(conn) = ldap_conn.as_mut() {
        let _ = conn.unbind();
    }

    *ldap_conn = None;
    logging::log_connection_state("Disconnecting", "Disconnected", "connection cleared");
    log_command_end("disconnect_ldap", &req_id, start);
    Ok(())
}
