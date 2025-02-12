export interface LdapNode {
	toggled: any;
	hasChildren: boolean;
	dn: string;                   // Distinguished Name (DN)
	attributes: string[];         // List of attributes associated with the entry
	children: LdapNode[];         // List of child LdapNode objects (recursive structure)
}
