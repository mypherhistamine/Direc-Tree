export interface LdapNode {
	toggled: boolean;
	hasChildren: boolean;
	dn: string;                   // Distinguished Name (DN)
	attributes: Record<string , string>;         // List of attributes associated with the entry
	children: LdapNode[];         // List of child LdapNode objects (recursive structure)
}
