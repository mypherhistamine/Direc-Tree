use std::sync::{Arc, Mutex};

use tauri::State;

use crate::{
    constants::{PASSWORD, USERNAME_DN},
    ldap_conn,
    state_management::app_state::AppState,
};

///This tauri command connects to the ldap server and then it creates an ldap connection which is
///stored in the state managed by the tauri implementation
#[tauri::command]
pub fn connect_ldap(state: State<'_, Arc<Mutex<AppState>>>) -> &str {
    // fn connect_ldap() -> () {
    println!("Connecting");
    let mut ldap_connection = ldap_conn::get_ldap_conn();
    //do a simple bind on the connection
    match ldap_connection.simple_bind(USERNAME_DN, PASSWORD) {
        Ok(res) => println!("Simple bind was successfull -> {res}"),
        Err(err) => println!("Some error occured while simple bind -> {err}"),
    }


    let state = state.lock().unwrap();
    *state.ldap_connection.lock().unwrap() = Some(ldap_connection);
    println!("Connection has been set now");
    "The connection has been established"
}
