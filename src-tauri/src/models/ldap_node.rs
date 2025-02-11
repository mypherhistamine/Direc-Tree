use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LdapNode {
    pub dn: String,                // Distinguished Name
    pub attributes: Vec<String>,   // Attributes of the entry
    pub children: Vec<LdapNode>,   // Children of the entry
}
