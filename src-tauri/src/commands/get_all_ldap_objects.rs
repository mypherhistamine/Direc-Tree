use ldap3::{Scope, SearchEntry};
use std::sync::{Arc, Mutex};
use tauri::State;

use crate::state_management::app_state::AppState;


/// This function gets the
#[tauri::command]
pub fn get_all_ldap_objects<'a>(state: State<'_, Arc<Mutex<AppState>>>) -> Vec<String> {
    println!("Binding to LDAP server with credentials...");
    let app_state = state.lock().unwrap();
    let ldap_conn = &mut *app_state.ldap_connection.lock().unwrap();
    let mut ldap_entries: Vec<String> = Vec::new();
    if let Some(ldap_conn) = ldap_conn {
        let (rs, _res) = ldap_conn
            .search(
                "cn=nids,ou=accessManagerContainer,o=novell",
                Scope::Subtree,
                "(objectClass=*)",
                vec!["*"], // Specify which attributes you want to retrieve, e.g., "l" (location)
            )
            .unwrap()
            .success()
            .unwrap();

        for entry in rs {
            let search_entry: SearchEntry = SearchEntry::construct(entry);

            println!("Entry DN: {}", search_entry.dn);
            ldap_entries.push(search_entry.dn);

            // Print the attributes for the entry
            for (attr_name, attr_values) in search_entry.attrs {
                println!("Attribute: {}", attr_name);
                for value in attr_values {
                    println!("  Value: {}", value);
                }
            }

            // If you want to see the binary attributes, you can use the `bin_attrs` field:
            for (bin_attr_name, bin_attr_values) in search_entry.bin_attrs {
                println!("Binary Attribute: {}", bin_attr_name);
                for bin_value in bin_attr_values {
                    // Printing binary data as a hex string (you can adjust depending on the use case)
                    println!("  Binary Value (hex): {:?}", bin_value);
                }
            }
        }

        // let mut output_file = File::create(Path::new("output.txt")).unwrap();
        // match output_file.write(result.as_bytes()) {
        //     Ok(res) => print!("File write success -> {res}"),
        //     Err(err) => println!("Failed to write the file -> {err}"),
        // }
    } else {
        println!("The ldap connection was not found");
    }

    println!("LDAP connection and authentication successful!");
    ldap_entries
}
