use std::sync::Mutex;

use ldap3::LdapConn;

pub struct AppState {
    pub ldap_connection: Mutex<Option<LdapConn>>,
}

impl Default for AppState {
    fn default() -> Self {
        tracing::info!("initialising AppState");
        Self {
            ldap_connection: Mutex::new(None),
        }
    }
}
