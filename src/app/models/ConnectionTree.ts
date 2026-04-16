// ─── Connection Tree Data Model ───
// Hierarchical model for folder-based connection organization (like ADS)

export interface ConnectionNode {
	id: string;
	name: string;
	type: "connection";
	url: string;
	bindDn: string;
	password: string;
	baseDn: string;
	noTlsVerify?: boolean;
}

export interface FolderNode {
	id: string;
	name: string;
	type: "folder";
	children: TreeNode[];
}

export type TreeNode = FolderNode | ConnectionNode;

// Connection status tracking
export type ConnectionState = "connected" | "disconnected" | "error";

export interface ConnectionStatus {
	state: ConnectionState;
	lastError?: string;
	lastUpdated: number;
}

// ─── Storage keys ───
export const CONN_TREE_KEY = "direcTree.connectionTree.v1";
export const OLD_PROFILES_KEY = "directree_profiles";
export const ACTIVE_PROFILE_KEY = "activeProfile";

export function connStatusKey(profileId: string): string {
	return `direcTree.connectionStatus.${profileId}`;
}

// ─── Helpers ───

export function uuid(): string {
	return crypto.randomUUID();
}

/** Load connection tree from localStorage, with migration from flat profiles */
export function loadConnectionTree(): TreeNode[] {
	try {
		const raw = localStorage.getItem(CONN_TREE_KEY);
		if (raw) return JSON.parse(raw);
	} catch { /* */ }

	// Migrate from old flat profile list
	try {
		const oldRaw = localStorage.getItem(OLD_PROFILES_KEY);
		if (oldRaw) {
			const oldProfiles = JSON.parse(oldRaw) as Array<{
				id: string; name: string; url: string;
				bindDn: string; password: string; baseDn: string;
				noTlsVerify?: boolean;
			}>;
			if (oldProfiles.length > 0) {
				const connections: ConnectionNode[] = oldProfiles.map((p) => ({
					id: p.id,
					name: p.name || "Unnamed",
					type: "connection",
					url: p.url,
					bindDn: p.bindDn,
					password: p.password,
					baseDn: p.baseDn || "",
					noTlsVerify: p.noTlsVerify,
				}));
				const root: FolderNode = {
					id: uuid(),
					name: "Connections",
					type: "folder",
					children: connections,
				};
				const tree: TreeNode[] = [root];
				saveConnectionTree(tree);
				return tree;
			}
		}
	} catch { /* */ }

	return [];
}

/** Save connection tree to localStorage */
export function saveConnectionTree(tree: TreeNode[]): void {
	localStorage.setItem(CONN_TREE_KEY, JSON.stringify(tree));
}

/** Get connection status for a profile */
export function getConnectionStatus(profileId: string): ConnectionStatus {
	try {
		const raw = localStorage.getItem(connStatusKey(profileId));
		if (raw) return JSON.parse(raw);
	} catch { /* */ }
	return { state: "disconnected", lastUpdated: Date.now() };
}

/** Update connection status */
export function setConnectionStatus(profileId: string, state: ConnectionState, lastError?: string): void {
	const status: ConnectionStatus = { state, lastUpdated: Date.now(), lastError };
	localStorage.setItem(connStatusKey(profileId), JSON.stringify(status));
}

/** Find a connection node by ID anywhere in the tree */
export function findConnectionById(tree: TreeNode[], id: string): ConnectionNode | null {
	for (const node of tree) {
		if (node.type === "connection" && node.id === id) return node;
		if (node.type === "folder") {
			const found = findConnectionById(node.children, id);
			if (found) return found;
		}
	}
	return null;
}

/** Find a node (folder or connection) by ID */
export function findNodeById(tree: TreeNode[], id: string): TreeNode | null {
	for (const node of tree) {
		if (node.id === id) return node;
		if (node.type === "folder") {
			const found = findNodeById(node.children, id);
			if (found) return found;
		}
	}
	return null;
}

/** Get all connections from the tree (flattened) */
export function getAllConnections(tree: TreeNode[]): ConnectionNode[] {
	const result: ConnectionNode[] = [];
	for (const node of tree) {
		if (node.type === "connection") result.push(node);
		if (node.type === "folder") result.push(...getAllConnections(node.children));
	}
	return result;
}

/** Remove a node by ID from the tree. Returns the updated tree. */
export function removeNodeById(tree: TreeNode[], id: string): TreeNode[] {
	return tree
		.filter((n) => n.id !== id)
		.map((n) => {
			if (n.type === "folder") return { ...n, children: removeNodeById(n.children, id) };
			return n;
		});
}

/** Insert a node under a specific parent folder ID (or root if parentId is null) */
export function insertNode(tree: TreeNode[], parentId: string | null, node: TreeNode): TreeNode[] {
	if (!parentId) return [...tree, node];
	return tree.map((n) => {
		if (n.type === "folder" && n.id === parentId) {
			return { ...n, children: [...n.children, node] };
		}
		if (n.type === "folder") {
			return { ...n, children: insertNode(n.children, parentId, node) };
		}
		return n;
	});
}

/** Update a node in the tree */
export function updateNodeInTree(tree: TreeNode[], id: string, updates: Partial<TreeNode>): TreeNode[] {
	return tree.map((n) => {
		if (n.id === id) return { ...n, ...updates } as TreeNode;
		if (n.type === "folder") return { ...n, children: updateNodeInTree(n.children, id, updates) };
		return n;
	});
}

/** Check if a folder has children */
export function isFolderEmpty(tree: TreeNode[], id: string): boolean {
	const folder = findNodeById(tree, id);
	if (!folder || folder.type !== "folder") return true;
	return folder.children.length === 0;
}

/** Convert a ConnectionNode to the "activeProfile" format for localStorage */
export function connectionToActiveProfile(conn: ConnectionNode): object {
	return {
		id: conn.id,
		name: conn.name,
		url: conn.url,
		bindDn: conn.bindDn,
		password: conn.password,
		baseDn: conn.baseDn,
		noTlsVerify: conn.noTlsVerify ?? false,
	};
}
