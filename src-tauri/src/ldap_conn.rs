use std::time::Duration;

use ldap3::{LdapConn, LdapConnSettings};
use native_tls::TlsConnector;

use crate::constants::{PASSWORD, USERNAME_DN};

/// Legacy helper — uses hardcoded constants (kept for dev convenience)
pub fn get_ldap_conn() -> LdapConn {
    let connector = get_tls_connector(true);
    let conn_url = "ldaps://10.71.129.131:636";
    tracing::debug!(url = conn_url, "legacy get_ldap_conn");
    let settings = LdapConnSettings::new()
        .set_conn_timeout(Duration::from_secs(60))
        .set_connector(connector)
        .set_no_tls_verify(true);
    LdapConn::with_settings(settings, conn_url).unwrap()
}

/// Parameterized connection — used by the updated connect_ldap command
pub fn get_ldap_conn_with_params(url: &str, no_tls_verify: bool) -> Result<LdapConn, String> {
    let connector = get_tls_connector(no_tls_verify);
    tracing::debug!(url = url, no_tls_verify = no_tls_verify, "get_ldap_conn_with_params");
    let settings = LdapConnSettings::new()
        .set_conn_timeout(Duration::from_secs(60))
        .set_connector(connector)
        .set_no_tls_verify(no_tls_verify);
    LdapConn::with_settings(settings, url)
        .map_err(|e| format!("Connection failed: {}", e))
}

/// Legacy bind — uses hardcoded constants
pub fn simple_user_pwd_bind(ldap_connection: &mut LdapConn) {
    match ldap_connection.simple_bind(USERNAME_DN, PASSWORD) {
        Ok(res) => tracing::debug!(rc = res.rc, "legacy simple_bind ok"),
        Err(err) => tracing::error!(error = %err, "legacy simple_bind failed"),
    }
}

/// Parameterized bind
pub fn simple_user_pwd_bind_with_params(
    ldap_connection: &mut LdapConn,
    bind_dn: &str,
    password: &str,
) -> Result<(), String> {
    ldap_connection
        .simple_bind(bind_dn, password)
        .map_err(|e| format!("Bind error: {}", e))
        .and_then(|res| {
            if res.rc == 0 {
                tracing::debug!("bind successful");
                Ok(())
            } else {
                Err(format!("Bind failed with rc={}: {}", res.rc, res.text))
            }
        })
}

fn get_tls_connector(accept_invalid_certs: bool) -> TlsConnector {
    let mut builder = TlsConnector::builder();
    if accept_invalid_certs {
        builder.danger_accept_invalid_certs(true);
    }
    builder.build().unwrap()
}
