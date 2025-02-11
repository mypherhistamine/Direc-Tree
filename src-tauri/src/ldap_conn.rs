use std::time::Duration;

use ldap3::{LdapConn, LdapConnSettings};
use native_tls::TlsConnector;


pub fn get_ldap_conn() -> LdapConn {
    // Create a TlsConnectorBuilder
    let mut builder = TlsConnector::builder();

    // Disable certificate verification for development purposes (for testing only)
    builder.danger_accept_invalid_certs(true); // Allow invalid certificates (unsafe for production)

    // Build the connector from the builder
    let connector = builder.build().unwrap();

    // Establish secure stream
    // let stream = std::net::TcpStream::connect("10.71.128.222:636").unwrap();

    let conn_url = "ldaps://10.71.128.222:636"; // Port 636 is standard for LDAPS

    println!("Connecting securely to {conn_url} ...");

    // Establish a secure LDAP connection with TLS
    let settings = LdapConnSettings::new()
        .set_conn_timeout(Duration::from_secs(60))
        .set_connector(connector)
        .set_no_tls_verify(true); // Disable certificate validation in LDAP connection as well
    LdapConn::with_settings(settings, conn_url).unwrap()
}
