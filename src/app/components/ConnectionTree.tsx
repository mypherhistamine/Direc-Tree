import React, { useState, useCallback, useRef, useEffect } from "react";
import {
	TreeNode, FolderNode, ConnectionNode, ConnectionStatus,
	getConnectionStatus, uuid,
} from "../models/ConnectionTree";

// ─── Icons (inline SVGs) ───
const FolderOpenIcon = () => (
	<svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
			d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
	</svg>
);
const FolderClosedIcon = () => (
	<svg className="w-4 h-4 text-amber-400/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
			d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
	</svg>
);
const ServerIcon = () => (
	<svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
			d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
	</svg>
);
const ChevronIcon = ({ open }: { open: boolean }) => (
	<svg className={`w-3 h-3 text-slate-500 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
		fill="none" stroke="currentColor" viewBox="0 0 24 24">
		<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
	</svg>
);

// ─── Status pill ───
function StatusPill({ status }: { status: ConnectionStatus }) {
	if (status.state === "connected") {
		return (
			<span className="ml-auto flex-shrink-0 px-1.5 py-0.5 text-[9px] font-semibold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 uppercase tracking-wider">
				Connected
			</span>
		);
	}
	if (status.state === "error") {
		return (
			<span className="ml-auto flex-shrink-0 px-1.5 py-0.5 text-[9px] font-semibold rounded-full bg-red-500/15 text-red-400 border border-red-500/25 uppercase tracking-wider cursor-help"
				title={status.lastError || "Connection error"}>
				Error
			</span>
		);
	}
	return (
		<span className="ml-auto flex-shrink-0 px-1.5 py-0.5 text-[9px] font-semibold rounded-full bg-slate-600/30 text-slate-500 border border-slate-600/30 uppercase tracking-wider">
			Offline
		</span>
	);
}

// ─── Context menu ───
interface ContextMenuState {
	x: number;
	y: number;
	node: TreeNode;
}

// ─── Component Props ───
export interface ConnectionTreeProps {
	tree: TreeNode[];
	activeConnectionId: string | null;
	selectedId: string | null;
	onSelect: (id: string) => void;
	onConnect: (conn: ConnectionNode) => void;
	onDisconnect: () => void;
	onEdit: (node: TreeNode) => void;
	onDelete: (node: TreeNode) => void;
	onNewFolder: (parentId: string | null) => void;
	onNewConnection: (parentId: string | null) => void;
	/** Compact mode for side drawer (smaller padding, no toolbar) */
	compact?: boolean;
}

const ConnectionTreeComponent: React.FC<ConnectionTreeProps> = ({
	tree,
	activeConnectionId,
	selectedId,
	onSelect,
	onConnect,
	onDisconnect,
	onEdit,
	onDelete,
	onNewFolder,
	onNewConnection,
	compact = false,
}) => {
	const [expanded, setExpanded] = useState<Set<string>>(() => {
		// Auto-expand all folders
		const ids = new Set<string>();
		const walk = (nodes: TreeNode[]) => {
			for (const n of nodes) {
				if (n.type === "folder") { ids.add(n.id); walk(n.children); }
			}
		};
		walk(tree);
		return ids;
	});

	// Auto-expand new folders
	useEffect(() => {
		const ids = new Set<string>();
		const walk = (nodes: TreeNode[]) => {
			for (const n of nodes) {
				if (n.type === "folder") { ids.add(n.id); walk(n.children); }
			}
		};
		walk(tree);
		setExpanded((prev) => {
			const next = new Set(prev);
			ids.forEach((id) => next.add(id));
			return next;
		});
	}, [tree]);

	const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
	const ctxRef = useRef<HTMLDivElement>(null);

	// Close context menu on outside click
	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setContextMenu(null);
		};
		if (contextMenu) document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [contextMenu]);

	// Close on Escape
	useEffect(() => {
		const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setContextMenu(null); };
		if (contextMenu) document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [contextMenu]);

	const toggleExpand = useCallback((id: string) => {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id); else next.add(id);
			return next;
		});
	}, []);

	const handleContextMenu = useCallback((e: React.MouseEvent, node: TreeNode) => {
		e.preventDefault();
		e.stopPropagation();
		setContextMenu({ x: e.clientX, y: e.clientY, node });
	}, []);

	const handleDoubleClick = useCallback((node: TreeNode) => {
		if (node.type === "connection") onConnect(node);
	}, [onConnect]);

	// ─── Render tree node ───
	const renderNode = (node: TreeNode, depth: number) => {
		const isSelected = selectedId === node.id;
		const isActive = node.type === "connection" && node.id === activeConnectionId;

		if (node.type === "folder") {
			const isOpen = expanded.has(node.id);
			return (
				<div key={node.id}>
					<div
						className={`flex items-center gap-1.5 cursor-pointer select-none group
							${compact ? "px-2 py-1" : "px-3 py-1.5"}
							${isSelected ? "bg-slate-700/50 border-l-2 border-blue-400" : "border-l-2 border-transparent hover:bg-slate-800/60"}
							transition-all`}
						style={{ paddingLeft: `${depth * 16 + (compact ? 8 : 12)}px` }}
						onClick={() => { onSelect(node.id); toggleExpand(node.id); }}
						onContextMenu={(e) => handleContextMenu(e, node)}
					>
						<ChevronIcon open={isOpen} />
						{isOpen ? <FolderOpenIcon /> : <FolderClosedIcon />}
						<span className={`text-xs font-medium truncate ${isSelected ? "text-slate-200" : "text-slate-400"}`}>
							{node.name}
						</span>
						<span className="ml-auto text-[10px] text-slate-600">{node.children.length}</span>
					</div>
					{isOpen && node.children.map((child) => renderNode(child, depth + 1))}
				</div>
			);
		}

		// Connection node
		const status = getConnectionStatus(node.id);
		return (
			<div
				key={node.id}
				className={`flex items-center gap-1.5 cursor-pointer select-none group
					${compact ? "px-2 py-1" : "px-3 py-1.5"}
					${isActive ? "bg-emerald-500/10 border-l-2 border-emerald-400" : isSelected ? "bg-slate-700/50 border-l-2 border-blue-400" : "border-l-2 border-transparent hover:bg-slate-800/60"}
					transition-all`}
				style={{ paddingLeft: `${depth * 16 + (compact ? 8 : 12)}px` }}
				onClick={() => onSelect(node.id)}
				onDoubleClick={() => handleDoubleClick(node)}
				onContextMenu={(e) => handleContextMenu(e, node)}
			>
				<div className="w-3 h-3" /> {/* spacer matching chevron */}
				<ServerIcon />
				<div className="flex-1 min-w-0">
					<span className={`text-xs font-medium truncate block ${isActive ? "text-emerald-300" : isSelected ? "text-slate-200" : "text-slate-300"}`}>
						{node.name}
					</span>
					<span className="text-[10px] text-slate-600 font-mono truncate block">{node.url}</span>
				</div>
				<StatusPill status={status} />
			</div>
		);
	};

	// Find selected node's parent folder id
	const findParentFolderId = useCallback((nodeId: string | null): string | null => {
		if (!nodeId) return null;
		const walk = (nodes: TreeNode[], parentId: string | null): string | null => {
			for (const n of nodes) {
				if (n.id === nodeId) return parentId;
				if (n.type === "folder") {
					const found = walk(n.children, n.id);
					if (found !== undefined && found !== null) return found;
				}
			}
			return null;
		};
		return walk(tree, null);
	}, [tree]);

	const getTargetParentId = useCallback((): string | null => {
		if (!selectedId) return null;
		const node = findNodeById(tree, selectedId);
		if (!node) return null;
		if (node.type === "folder") return node.id;
		return findParentFolderId(selectedId);
	}, [selectedId, tree, findParentFolderId]);

	const isConnectionSelected = selectedId ? findNodeById(tree, selectedId)?.type === "connection" : false;
	const isFolderSelected = selectedId ? findNodeById(tree, selectedId)?.type === "folder" : false;
	const selectedNode = selectedId ? findNodeById(tree, selectedId) : null;
	const isSelectedActive = isConnectionSelected && selectedId === activeConnectionId;

	return (
		<div className="flex flex-col h-full">
			{/* ADS-style Toolbar */}
			{!compact && (
				<div className="flex items-center gap-1 px-3 py-2 border-b border-slate-700/50 bg-slate-800/40 flex-shrink-0">
					{/* New Folder */}
					<button onClick={() => onNewFolder(getTargetParentId())}
						title="New Folder"
						className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-700/50 transition-all">
						<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
								d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
						</svg>
					</button>
					{/* New Connection */}
					<button onClick={() => onNewConnection(getTargetParentId())}
						title="New Connection"
						className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-700/50 transition-all">
						<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
						</svg>
					</button>
					<div className="w-px h-5 bg-slate-700/50 mx-0.5" />
					{/* Edit */}
					<button onClick={() => { if (selectedNode) onEdit(selectedNode); }}
						disabled={!selectedId}
						title="Edit"
						className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
						<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
								d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
						</svg>
					</button>
					{/* Delete */}
					<button onClick={() => { if (selectedNode) onDelete(selectedNode); }}
						disabled={!selectedId}
						title="Delete"
						className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
						<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
								d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
						</svg>
					</button>
					<div className="w-px h-5 bg-slate-700/50 mx-0.5" />
					{/* Connect */}
					<button
						onClick={() => { if (isConnectionSelected && selectedNode) onConnect(selectedNode as ConnectionNode); }}
						disabled={!isConnectionSelected || isSelectedActive}
						title="Connect"
						className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
						<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
						</svg>
					</button>
					{/* Disconnect */}
					<button
						onClick={onDisconnect}
						disabled={!activeConnectionId}
						title="Disconnect"
						className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
						<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
								d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
						</svg>
					</button>
				</div>
			)}

			{/* Tree list */}
			<div className="flex-1 overflow-y-auto custom-scrollbar py-1">
				{tree.length === 0 ? (
					<div className="text-center py-10">
						<div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-800 flex items-center justify-center">
							<ServerIcon />
						</div>
						<p className="text-xs text-slate-500">No connections yet</p>
						<p className="text-[10px] text-slate-600 mt-1">Create a folder or connection to get started</p>
					</div>
				) : (
					tree.map((node) => renderNode(node, 0))
				)}
			</div>

			{/* Context menu */}
			{contextMenu && (
				<div
					ref={ctxRef}
					className="fixed z-[9999] min-w-[160px] bg-slate-800 border border-slate-700/60 rounded-lg shadow-2xl py-1"
					style={{ left: contextMenu.x, top: contextMenu.y }}
				>
					{contextMenu.node.type === "connection" && (
						<>
							{contextMenu.node.id !== activeConnectionId ? (
								<CtxBtn label="Connect" icon="⚡" onClick={() => { onConnect(contextMenu.node as ConnectionNode); setContextMenu(null); }} />
							) : (
								<CtxBtn label="Disconnect" icon="⊘" onClick={() => { onDisconnect(); setContextMenu(null); }} />
							)}
							<div className="h-px bg-slate-700/50 my-1" />
						</>
					)}
					{contextMenu.node.type === "folder" && (
						<>
							<CtxBtn label="New Folder" icon="📁" onClick={() => { onNewFolder(contextMenu.node.id); setContextMenu(null); }} />
							<CtxBtn label="New Connection" icon="➕" onClick={() => { onNewConnection(contextMenu.node.id); setContextMenu(null); }} />
							<div className="h-px bg-slate-700/50 my-1" />
						</>
					)}
					<CtxBtn label="Edit" icon="✏️" onClick={() => { onEdit(contextMenu.node); setContextMenu(null); }} />
					<CtxBtn label="Delete" icon="🗑️" className="text-red-400 hover:bg-red-500/10" onClick={() => { onDelete(contextMenu.node); setContextMenu(null); }} />
				</div>
			)}
		</div>
	);
};

// Context menu button
function CtxBtn({ label, icon, onClick, className }: { label: string; icon: string; onClick: () => void; className?: string }) {
	return (
		<button
			onClick={onClick}
			className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700/50 transition-all ${className ?? ""}`}
		>
			<span className="w-4 text-center text-[10px]">{icon}</span>
			{label}
		</button>
	);
}

// Helper to find node by ID (inlined)
function findNodeById(tree: TreeNode[], id: string): TreeNode | null {
	for (const n of tree) {
		if (n.id === id) return n;
		if (n.type === "folder") {
			const found = findNodeById(n.children, id);
			if (found) return found;
		}
	}
	return null;
}

export default ConnectionTreeComponent;
