// ─── Advanced Search Types ───

export interface SearchParams {
	baseDn: string;
	scope: string;
	filter: string;
	returningAttributes: string[];
	sizeLimit: number;
	timeLimitSeconds: number;
}

export interface SearchResultEntry {
	dn: string;
	attributes: Record<string, string[]>;
}

export interface SearchResponse {
	entries: SearchResultEntry[];
	entryCount: number;
	truncated: boolean;
	warnings: string[];
}

export interface SavedSearch {
	id: string;
	name: string;
	baseDn: string;
	scope: string;
	filter: string;
	returningAttributes: string[];
	sizeLimit: number;
	timeLimitSeconds: number;
}

// Legacy (kept for compatibility)
export interface SearchResultRow {
	dn: string;
	attributes: Record<string, string>;
}
