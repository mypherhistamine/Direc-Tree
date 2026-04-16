// TypeScript models matching the Rust SchemaBundle types

export interface ObjectClassDef {
	oid: string;
	names: string[];
	description: string;
	sup: string[];
	kind: string; // STRUCTURAL | AUXILIARY | ABSTRACT
	must: string[];
	may: string[];
	raw: string;
}

export interface AttributeTypeDef {
	oid: string;
	names: string[];
	description: string;
	syntax: string;
	singleValue: boolean;
	equality: string;
	ordering: string;
	substr: string;
	sup: string;
	usage: string;
	noUserModification: boolean;
	raw: string;
}

export interface MatchingRuleDef {
	oid: string;
	names: string[];
	description: string;
	syntax: string;
	raw: string;
}

export interface LdapSyntaxDef {
	oid: string;
	description: string;
	raw: string;
}

export interface SchemaBundle {
	objectClasses: ObjectClassDef[];
	attributeTypes: AttributeTypeDef[];
	matchingRules: MatchingRuleDef[];
	ldapSyntaxes: LdapSyntaxDef[];
	subschemaDn: string;
}
