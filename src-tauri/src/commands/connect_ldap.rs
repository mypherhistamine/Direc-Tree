use std::sync::{Arc, Mutex};
use std::time::Instant;

use tauri::State;

use crate::{
    ldap_conn::{get_ldap_conn_with_params, simple_user_pwd_bind_with_params},
    logging::{self, log_command_end, log_command_error, log_command_start, new_request_id, redact_dn},
    state_management::app_state::AppState,
};

/// Connects to an LDAP server using the provided profile parameters.
/// Stores the connection in the app state for subsequent operations.
#[tauri::command]
pub fn connect_ldap(
    state: State<'_, Arc<Mutex<AppState>>>,
    url: String,
    bind_dn: String,
    password: String,
    no_tls_verify: bool,
) -> Result<String, String> {
    let req_id = new_request_id();
    let start = Instant::now();
    log_command_start(
        "connect_ldap",
        &req_id,
        &format!("url={}, bind_dn={}, no_tls_verify={}", url, redact_dn(&bind_dn), no_tls_verify),
    );
    logging::log_connection_state("Disconnected", "Connecting", &format!("url={}", url));

    let mut ldap_connection = match get_ldap_conn_with_params(&url, no_tls_verify) {
        Ok(c) => c,
        Err(e) => {
            logging::log_connection_state("Connecting", "Disconnected", &format!("error={}", e));
            log_command_error("connect_ldap", &req_id, start, &e);
            return Err(format!("Failed to connect: {}", e));
        }
    };

    if let Err(e) = simple_user_pwd_bind_with_params(&mut ldap_connection, &bind_dn, &password) {
        logging::log_connection_state("Connecting", "Disconnected", &format!("bind_error={}", e));
        log_command_error("connect_ldap", &req_id, start, &e);
        return Err(format!("Bind failed: {}", e));
    }

    let app_state = state.lock().unwrap();
    *app_state.ldap_connection.lock().unwrap() = Some(ldap_connection);

    logging::log_connection_state("Connecting", "Connected", &format!("url={}, bind_dn={}", url, redact_dn(&bind_dn)));
    log_command_end("connect_ldap", &req_id, start);
    Ok("The connection has been established".to_string())
}
