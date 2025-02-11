use std::sync::Mutex;

use ldap3::LdapConn;

pub struct AppState{
    pub ldap_connection : Mutex<Option<LdapConn>>
}

impl Default for AppState{
    fn default() -> Self {
        println!("Inititng the state");
        Self{ldap_connection : Mutex::new(None)}
    }
}
