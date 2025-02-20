use std::time::Duration;

use ldap3::{Ldap, LdapConn, LdapConnAsync, LdapConnSettings};
use native_tls::TlsConnector;

use crate::constants::{PASSWORD, USERNAME_DN};

pub fn get_ldap_conn() -> LdapConn {
    let connector = get_tls_connector();
    let conn_url = "ldaps://10.71.144.135:636"; // Port 636 is standard for LDAPS
    println!("Connecting securely to {conn_url} ...");
    // Establish a secure LDAP connection with TLS
    let settings = LdapConnSettings::new()
        .set_conn_timeout(Duration::from_secs(60))
        .set_connector(connector)
        .set_no_tls_verify(true); // Disable certificate validation in LDAP connection as well
    LdapConn::with_settings(settings, conn_url).unwrap()
}

pub fn simple_user_pwd_bind(ldap_connection : &mut LdapConn) {
    match ldap_connection.simple_bind(USERNAME_DN, PASSWORD) {
        Ok(res) => println!("Simple bind was successfull -> {res}"),
        Err(err) => println!("Some error occured while simple bind -> {err}"),
    }
}

// pub async fn get_ldap_async_conn() -> Ldap {
//     let connector = get_tls_connector();
//     let conn_url = "ldaps://10.71.129.8:636"; // Port 636 is standard for LDAPS
//
//     let settings = LdapConnSettings::new()
//         .set_conn_timeout(Duration::from_secs(60))
//         .set_connector(connector)
//         .set_no_tls_verify(true); // Disable certificate validation in LDAP connection as well
//     LdapConnAsync::with_settings(settings, conn_url)
//         .await
//         .unwrap()
//         .1
// }

fn get_tls_connector() -> TlsConnector {
    // Create a TlsConnectorBuilder
    let mut builder = TlsConnector::builder();

    // Disable certificate verification for development purposes (for testing only)
    builder.danger_accept_invalid_certs(true); // Allow invalid certificates (unsafe for production)

    // Build the connector from the builder
    builder.build().unwrap()
}
