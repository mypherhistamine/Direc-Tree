export interface LdapNode {
	id : string;
	label : string;
	toggled: boolean;
	hasChildren: boolean;
	dn: string;                   // Distinguished Name (DN)
	attributes?: Record<string, string[]>;         // List of attributes associated with the entry (multi-valued)
	children?: LdapNode[];         // List of child LdapNode objects (recursive structure)
}
