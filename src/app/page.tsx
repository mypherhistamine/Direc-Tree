'use client'
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { loggedInvoke } from "./utils/loggedInvoke";
import {
	TreeNode, FolderNode, ConnectionNode,
	loadConnectionTree, saveConnectionTree,
	uuid, findConnectionById, findNodeById,
	removeNodeById, insertNode, updateNodeInTree, isFolderEmpty,
	connectionToActiveProfile, setConnectionStatus, ACTIVE_PROFILE_KEY,
} from "./models/ConnectionTree";
import ConnectionTreeComponent from "./components/ConnectionTree";
import ConnectionFormModal from "./components/ConnectionFormModal";
import FolderNameDialog from "./components/FolderNameDialog";
import ConfirmDialog from "./components/ConfirmDialog";

export default function Home() {
	const router = useRouter();
	const [tree, setTree] = useState<TreeNode[]>([]);
	const [loading, setLoading] = useState(true);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);

	// Dialog state
	const [folderDialog, setFolderDialog] = useState<{ open: boolean; parentId: string | null; editId?: string; initialName?: string }>({ open: false, parentId: null });
	const [connFormDialog, setConnFormDialog] = useState<{ open: boolean; parentId: string | null; editId?: string; initial?: Partial<ConnectionNode> }>({ open: false, parentId: null });
	const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; confirmLabel?: string; onConfirm: () => void }>({ open: false, title: "", message: "", onConfirm: () => {} });
	const [switchTarget, setSwitchTarget] = useState<ConnectionNode | null>(null);

	// Load on mount
	useEffect(() => {
		const t = loadConnectionTree();
		setTree(t);
		// Detect currently active connection
		try {
			const raw = localStorage.getItem(ACTIVE_PROFILE_KEY);
			if (raw) {
				const profile = JSON.parse(raw);
				setActiveConnectionId(profile.id ?? null);
			}
		} catch { /* */ }
		setLoading(false);
	}, []);

	// Persist tree changes
	const updateTree = useCallback((updater: (prev: TreeNode[]) => TreeNode[]) => {
		setTree((prev) => {
			const next = updater(prev);
			saveConnectionTree(next);
			return next;
		});
	}, []);

	// ─── Handlers ───

	const handleConnect = useCallback(async (conn: ConnectionNode) => {
		// If currently connected to something else, confirm switch
		if (activeConnectionId && activeConnectionId !== conn.id) {
			setSwitchTarget(conn);
			const currentConn = findConnectionById(tree, activeConnectionId);
			setConfirmDialog({
				open: true,
				title: "Switch Connection?",
				message: `This will disconnect from "${currentConn?.name ?? "current"}" and connect to "${conn.name}".`,
				confirmLabel: "Switch",
				onConfirm: () => {
					doConnect(conn);
					setConfirmDialog((p) => ({ ...p, open: false }));
				},
			});
			return;
		}
		doConnect(conn);
	}, [activeConnectionId, tree]);

	const doConnect = useCallback(async (conn: ConnectionNode) => {
		// Disconnect first if we have an active connection
		if (activeConnectionId) {
			try { await loggedInvoke("disconnect_ldap"); } catch { /* best effort */ }
			setConnectionStatus(activeConnectionId, "disconnected");
		}

		// Set active profile and navigate
		localStorage.setItem(ACTIVE_PROFILE_KEY, JSON.stringify(connectionToActiveProfile(conn)));
		setActiveConnectionId(conn.id);
		setConnectionStatus(conn.id, "connected");
		router.push("/tree");
	}, [activeConnectionId, router]);

	const handleDisconnect = useCallback(async () => {
		if (!activeConnectionId) return;
		try {
			await loggedInvoke("disconnect_ldap");
			setConnectionStatus(activeConnectionId, "disconnected");
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			setConnectionStatus(activeConnectionId, "error", msg);
		}
		setActiveConnectionId(null);
		localStorage.removeItem(ACTIVE_PROFILE_KEY);
		setTree((prev) => [...prev]); // force re-render for status pills
	}, [activeConnectionId]);

	const handleEdit = useCallback((node: TreeNode) => {
		if (node.type === "folder") {
			setFolderDialog({ open: true, parentId: null, editId: node.id, initialName: node.name });
		} else {
			setConnFormDialog({ open: true, parentId: null, editId: node.id, initial: node });
		}
	}, []);

	const handleDelete = useCallback((node: TreeNode) => {
		if (node.type === "folder" && !isFolderEmpty(tree, node.id)) {
			setConfirmDialog({
				open: true,
				title: "Delete Folder?",
				message: `"${node.name}" is not empty. All connections and sub-folders inside will be deleted.`,
				confirmLabel: "Delete Anyway",
				onConfirm: () => {
					updateTree((prev) => removeNodeById(prev, node.id));
					if (selectedId === node.id) setSelectedId(null);
					setConfirmDialog((p) => ({ ...p, open: false }));
				},
			});
			return;
		}
		// If deleting the active connection, disconnect first
		if (node.type === "connection" && node.id === activeConnectionId) {
			handleDisconnect().then(() => {
				updateTree((prev) => removeNodeById(prev, node.id));
				if (selectedId === node.id) setSelectedId(null);
			});
			return;
		}
		updateTree((prev) => removeNodeById(prev, node.id));
		if (selectedId === node.id) setSelectedId(null);
	}, [tree, selectedId, activeConnectionId, handleDisconnect, updateTree]);

	const handleNewFolder = useCallback((parentId: string | null) => {
		setFolderDialog({ open: true, parentId, editId: undefined, initialName: "" });
	}, []);

	const handleNewConnection = useCallback((parentId: string | null) => {
		setConnFormDialog({ open: true, parentId, editId: undefined, initial: undefined });
	}, []);

	const handleSaveFolder = useCallback((name: string) => {
		if (folderDialog.editId) {
			updateTree((prev) => updateNodeInTree(prev, folderDialog.editId!, { name } as Partial<FolderNode>));
		} else {
			const folder: FolderNode = { id: uuid(), name, type: "folder", children: [] };
			updateTree((prev) => insertNode(prev, folderDialog.parentId, folder));
		}
		setFolderDialog({ open: false, parentId: null });
	}, [folderDialog, updateTree]);

	const handleSaveConnection = useCallback((data: Omit<ConnectionNode, "id" | "type">) => {
		if (connFormDialog.editId) {
			updateTree((prev) => updateNodeInTree(prev, connFormDialog.editId!, { ...data } as Partial<ConnectionNode>));
			// If editing the active conn, update activeProfile too
			if (connFormDialog.editId === activeConnectionId) {
				const updated: ConnectionNode = { id: connFormDialog.editId, type: "connection", ...data };
				localStorage.setItem(ACTIVE_PROFILE_KEY, JSON.stringify(connectionToActiveProfile(updated)));
			}
		} else {
			const conn: ConnectionNode = { id: uuid(), type: "connection", ...data };
			updateTree((prev) => insertNode(prev, connFormDialog.parentId, conn));
		}
		setConnFormDialog({ open: false, parentId: null });
	}, [connFormDialog, updateTree, activeConnectionId]);

	// Selected connection details
	const selectedConn = selectedId ? findConnectionById(tree, selectedId) : null;

	if (loading) {
		return (
			<main className="h-screen w-screen bg-slate-900 flex items-center justify-center">
				<div className="w-8 h-8 border-2 border-slate-600 border-t-blue-400 rounded-full animate-spin" />
			</main>
		);
	}

	return (
		<main className="h-screen w-screen bg-slate-900 flex flex-col overflow-hidden">
			{/* Header */}
			<div className="flex items-center gap-3 px-6 py-4 border-b border-slate-700/50 bg-slate-800/60 flex-shrink-0">
				<div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center">
					<svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
							d="M4 6h16M4 12h16M4 18h7" />
					</svg>
				</div>
				<div>
					<h1 className="text-lg font-bold text-slate-100">DirecTree</h1>
					<p className="text-[10px] text-slate-500">LDAP Connection Manager</p>
				</div>
			</div>

			{/* Body: two-column layout */}
			<div className="flex flex-1 min-h-0 overflow-hidden">
				{/* Left: Connection Tree */}
				<div className="w-[340px] flex-shrink-0 border-r border-slate-700/50 flex flex-col bg-slate-900">
					<ConnectionTreeComponent
						tree={tree}
						activeConnectionId={activeConnectionId}
						selectedId={selectedId}
						onSelect={setSelectedId}
						onConnect={handleConnect}
						onDisconnect={handleDisconnect}
						onEdit={handleEdit}
						onDelete={handleDelete}
						onNewFolder={handleNewFolder}
						onNewConnection={handleNewConnection}
					/>
				</div>

				{/* Right: Details pane */}
				<div className="flex-1 flex items-center justify-center bg-slate-900/50 overflow-y-auto custom-scrollbar">
					{selectedConn ? (
						<div className="max-w-md w-full px-8 py-10">
							<div className="flex items-center gap-3 mb-6">
								<div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
									<svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
											d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
									</svg>
								</div>
								<div>
									<h2 className="text-lg font-semibold text-slate-200">{selectedConn.name}</h2>
									<p className="text-xs text-slate-500 font-mono">{selectedConn.url}</p>
								</div>
							</div>

							<div className="space-y-3">
								<DetailRow label="Bind DN" value={selectedConn.bindDn} />
								<DetailRow label="Base DN" value={selectedConn.baseDn || "(not set)"} muted={!selectedConn.baseDn} />
								<DetailRow label="TLS Verify" value={selectedConn.noTlsVerify ? "Disabled" : "Enabled"} />
							</div>

							<div className="flex gap-2 mt-8">
								{activeConnectionId === selectedConn.id ? (
									<button onClick={handleDisconnect}
										className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium
											bg-red-500/15 text-red-400 border border-red-500/25
											hover:bg-red-500/25 hover:border-red-500/40 transition-all">
										<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
												d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
										</svg>
										Disconnect
									</button>
								) : (
									<button onClick={() => handleConnect(selectedConn)}
										className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium
											bg-emerald-500/15 text-emerald-400 border border-emerald-500/25
											hover:bg-emerald-500/25 hover:border-emerald-500/40 transition-all">
										<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
										</svg>
										Connect
									</button>
								)}
								<button onClick={() => handleEdit(selectedConn)}
									className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
										bg-slate-700/40 text-slate-300 border border-slate-600/30
										hover:bg-slate-600/50 transition-all">
									Edit
								</button>
							</div>
						</div>
					) : (
						<div className="text-center px-8">
							<div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
								<svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
										d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
								</svg>
							</div>
							<p className="text-slate-400 font-medium">Select a connection</p>
							<p className="text-sm text-slate-500 mt-1">Choose a connection from the tree or create a new one</p>
						</div>
					)}
				</div>
			</div>

			{/* Dialogs */}
			<FolderNameDialog
				open={folderDialog.open}
				title={folderDialog.editId ? "Rename Folder" : "New Folder"}
				initialName={folderDialog.initialName}
				onSave={handleSaveFolder}
				onCancel={() => setFolderDialog({ open: false, parentId: null })}
			/>
			<ConnectionFormModal
				open={connFormDialog.open}
				initial={connFormDialog.initial}
				isEdit={!!connFormDialog.editId}
				onSave={handleSaveConnection}
				onCancel={() => setConnFormDialog({ open: false, parentId: null })}
			/>
			<ConfirmDialog
				open={confirmDialog.open}
				title={confirmDialog.title}
				message={confirmDialog.message}
				confirmLabel={confirmDialog.confirmLabel}
				onConfirm={confirmDialog.onConfirm}
				onCancel={() => setConfirmDialog((p) => ({ ...p, open: false }))}
			/>
		</main>
	);
}

function DetailRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
	return (
		<div className="flex items-baseline gap-3">
			<span className="text-[11px] text-slate-500 font-medium w-20 flex-shrink-0">{label}</span>
			<span className={`text-sm font-mono truncate ${muted ? "text-slate-600" : "text-slate-300"}`}>{value}</span>
		</div>
	);
}
