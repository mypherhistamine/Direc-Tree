import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { loggedInvoke } from "../utils/loggedInvoke";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { LdapNode } from "../models/LdapNode";
import { RichTreeView } from "@mui/x-tree-view";
import { CustomTreeItem } from "../utils";
import { Resizable } from "react-resizable";
import "react-resizable/css/styles.css";
import { useLdapTree } from "../hooks/useLdapTree";
import AttributePanel from "./AttributePanel";
import ContentPreview from "./ContentPreview";
import LdifView from "./LdifView";
import RootDseModal from "./RootDseModal";
import BookmarksPanel from "./BookmarksPanel";
import CompareEntriesModal from "./CompareEntriesModal";
import DnBreadcrumb from "./DnBreadcrumb";
import CommandPalette from "./CommandPalette";
import ConnectionTreeComponent from "./ConnectionTree";
import ConnectionFormModal from "./ConnectionFormModal";
import FolderNameDialog from "./FolderNameDialog";
import ConfirmDialog from "./ConfirmDialog";
import {
	TreeNode, FolderNode, ConnectionNode,
	loadConnectionTree, saveConnectionTree,
	uuid, findConnectionById, removeNodeById, insertNode,
	updateNodeInTree, isFolderEmpty,
	connectionToActiveProfile, setConnectionStatus,
	ACTIVE_PROFILE_KEY,
} from "../models/ConnectionTree";

interface LdapTreeViewProps {
	treeData: LdapNode[];
}

type MiddlePanelTab = "attributes" | "ldif";
type PanelId = 1 | 2 | 3;

interface PanelLayout {
	collapsed: Set<PanelId>;
	maximized: PanelId | null;
}

const COLLAPSED_BAR_W = 36; // px – thin sliver when collapsed

const LdapTreeView: React.FC<LdapTreeViewProps> = ({ treeData }) => {
	const router = useRouter();
	const [treeViewWidth, setTreeViewWidth] = useState(300);
	const [attrPanelWidth, setAttrPanelWidth] = useState(380);

	// Modal visibility
	const [rootDseOpen, setRootDseOpen] = useState(false);
	const [compareOpen, setCompareOpen] = useState(false);
	const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

	// Middle panel tab
	const [middleTab, setMiddleTab] = useState<MiddlePanelTab>("attributes");

	// Profile id for scoped localStorage
	const profileId = useMemo(() => {
		try {
			const raw = localStorage.getItem(ACTIVE_PROFILE_KEY);
			if (raw) return JSON.parse(raw).id as string;
		} catch { /* */ }
		return undefined;
	}, []);

	const profileName = useMemo(() => {
		try {
			const raw = localStorage.getItem(ACTIVE_PROFILE_KEY);
			if (raw) return JSON.parse(raw).name as string;
		} catch { /* */ }
		return "";
	}, []);

	// ─── Connections section state (collapsible + resizable) ───
	const [connSectionCollapsed, setConnSectionCollapsed] = useState<boolean>(() => {
		try {
			const key = `direcTree.sidebar.connectionsCollapsed.${profileId ?? "default"}`;
			return localStorage.getItem(key) === "true";
		} catch { return false; }
	});
	const [connSectionHeight, setConnSectionHeight] = useState<number>(() => {
		try {
			const key = `direcTree.sidebar.connectionsHeight.${profileId ?? "default"}`;
			const val = localStorage.getItem(key);
			if (val) return Math.max(80, Math.min(parseInt(val, 10), 400));
		} catch { /* */ }
		return 180;
	});
	const [connTree, setConnTree] = useState<TreeNode[]>(() => loadConnectionTree());
	const [connSelectedId, setConnSelectedId] = useState<string | null>(null);
	const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);
	const [switchConfirm, setSwitchConfirm] = useState<{ open: boolean; target: ConnectionNode | null }>({ open: false, target: null });
	const [connFolderDialog, setConnFolderDialog] = useState<{ open: boolean; parentId: string | null; editId?: string; initialName?: string }>({ open: false, parentId: null });
	const [connFormDialog, setConnFormDialog] = useState<{ open: boolean; parentId: string | null; editId?: string; initial?: Partial<ConnectionNode> }>({ open: false, parentId: null });
	const [connDeleteConfirm, setConnDeleteConfirm] = useState<{ open: boolean; node: TreeNode | null }>({ open: false, node: null });

	const updateConnTree = useCallback((updater: (prev: TreeNode[]) => TreeNode[]) => {
		setConnTree((prev) => {
			const next = updater(prev);
			saveConnectionTree(next);
			return next;
		});
	}, []);

	// Persist connections section collapse state
	useEffect(() => {
		try {
			const key = `direcTree.sidebar.connectionsCollapsed.${profileId ?? "default"}`;
			localStorage.setItem(key, String(connSectionCollapsed));
		} catch { /* */ }
	}, [connSectionCollapsed, profileId]);

	// Persist connections section height
	useEffect(() => {
		try {
			const key = `direcTree.sidebar.connectionsHeight.${profileId ?? "default"}`;
			localStorage.setItem(key, String(connSectionHeight));
		} catch { /* */ }
	}, [connSectionHeight, profileId]);

	// Connection count for section header
	const connCount = useMemo(() => {
		let count = 0;
		const walk = (nodes: TreeNode[]) => {
			for (const n of nodes) {
				if (n.type === "connection") count++;
				if (n.type === "folder") walk(n.children);
			}
		};
		walk(connTree);
		return count;
	}, [connTree]);

	// Sidebar ref for max-height constraint during drag
	const sidebarRef = useRef<HTMLDivElement>(null);

	// Drag-handle state for connections section resizer
	const connResizeDragRef = useRef<{ startY: number; startH: number } | null>(null);

	const handleConnResizeStart = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		connResizeDragRef.current = { startY: e.clientY, startH: connSectionHeight };

		const onMouseMove = (ev: MouseEvent) => {
			if (!connResizeDragRef.current) return;
			const sidebarH = sidebarRef.current?.clientHeight ?? 600;
			const maxH = Math.min(400, Math.floor(sidebarH * 0.4));
			const deltaY = ev.clientY - connResizeDragRef.current.startY;
			setConnSectionHeight(Math.max(80, Math.min(connResizeDragRef.current.startH + deltaY, maxH)));
		};

		const onMouseUp = () => {
			connResizeDragRef.current = null;
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};

		document.body.style.cursor = "row-resize";
		document.body.style.userSelect = "none";
		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", onMouseUp);
	}, [connSectionHeight]);

	// Disconnect handler
	const handleDisconnect = useCallback(async () => {
		try {
			await loggedInvoke("disconnect_ldap");
			if (profileId) setConnectionStatus(profileId, "disconnected");
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (profileId) setConnectionStatus(profileId, "error", msg);
		}
		localStorage.removeItem(ACTIVE_PROFILE_KEY);
		router.push("/");
	}, [profileId, router]);

	// Switch connection handler
	const doSwitchConnection = useCallback(async (conn: ConnectionNode) => {
		try {
			await loggedInvoke("disconnect_ldap");
			if (profileId) setConnectionStatus(profileId, "disconnected");
		} catch { /* best effort */ }
		localStorage.setItem(ACTIVE_PROFILE_KEY, JSON.stringify(connectionToActiveProfile(conn)));
		setConnectionStatus(conn.id, "connected");
		// Navigate to tree page (reload to reinit connection)
		window.location.href = "/tree";
	}, [profileId]);

	const handleConnTreeConnect = useCallback((conn: ConnectionNode) => {
		if (conn.id === profileId) return; // already connected
		setSwitchConfirm({ open: true, target: conn });
	}, [profileId]);

	const handleConnTreeDisconnect = useCallback(() => {
		setDisconnectConfirmOpen(true);
	}, []);

	const handleConnTreeEdit = useCallback((node: TreeNode) => {
		if (node.type === "folder") {
			setConnFolderDialog({ open: true, parentId: null, editId: node.id, initialName: node.name });
		} else {
			setConnFormDialog({ open: true, parentId: null, editId: node.id, initial: node });
		}
	}, []);

	const handleConnTreeDelete = useCallback((node: TreeNode) => {
		if (node.type === "folder" && !isFolderEmpty(connTree, node.id)) {
			setConnDeleteConfirm({ open: true, node });
			return;
		}
		if (node.type === "connection" && node.id === profileId) {
			// Can't delete active connection
			return;
		}
		updateConnTree((prev) => removeNodeById(prev, node.id));
	}, [connTree, profileId, updateConnTree]);

	const handleConnTreeNewFolder = useCallback((parentId: string | null) => {
		setConnFolderDialog({ open: true, parentId, editId: undefined, initialName: "" });
	}, []);

	const handleConnTreeNewConnection = useCallback((parentId: string | null) => {
		setConnFormDialog({ open: true, parentId, editId: undefined, initial: undefined });
	}, []);

	// Multi-value row expansion toggle (persisted per profile)
	const [multiValueRows, setMultiValueRows] = useState(() => {
		try {
			const key = `directree_multiValueRows_${profileId ?? "default"}`;
			return localStorage.getItem(key) === "true";
		} catch { return false; }
	});

	const toggleMultiValueRows = useCallback(() => {
		setMultiValueRows((prev) => {
			const next = !prev;
			try {
				const key = `directree_multiValueRows_${profileId ?? "default"}`;
				localStorage.setItem(key, String(next));
			} catch { /* */ }
			return next;
		});
	}, [profileId]);

	// ─── Panel collapse / maximize ───
	const [panelLayout, setPanelLayout] = useState<PanelLayout>(() => {
		try {
			const key = `directree_panels_${profileId ?? "default"}`;
			const raw = localStorage.getItem(key);
			if (raw) {
				const parsed = JSON.parse(raw);
				return { collapsed: new Set(parsed.collapsed as PanelId[]), maximized: parsed.maximized ?? null };
			}
		} catch { /* */ }
		return { collapsed: new Set<PanelId>(), maximized: null };
	});

	// Persist panel state
	useEffect(() => {
		const key = `directree_panels_${profileId ?? "default"}`;
		localStorage.setItem(key, JSON.stringify({
			collapsed: Array.from(panelLayout.collapsed),
			maximized: panelLayout.maximized,
		}));
	}, [panelLayout, profileId]);

	const toggleCollapse = useCallback((id: PanelId) => {
		setPanelLayout((prev) => {
			const next = new Set(prev.collapsed);
			if (next.has(id)) next.delete(id); else next.add(id);
			return { collapsed: next, maximized: next.has(id) && prev.maximized === id ? null : prev.maximized };
		});
	}, []);

	const toggleMaximize = useCallback((id: PanelId) => {
		setPanelLayout((prev) => ({
			collapsed: prev.collapsed,
			maximized: prev.maximized === id ? null : id,
		}));
	}, []);

	const isPanelVisible = useCallback((id: PanelId) => {
		if (panelLayout.maximized && panelLayout.maximized !== id) return false;
		return !panelLayout.collapsed.has(id);
	}, [panelLayout]);

	const isPanelCollapsed = useCallback((id: PanelId) => panelLayout.collapsed.has(id), [panelLayout]);
	const isPanelMaximized = useCallback((id: PanelId) => panelLayout.maximized === id, [panelLayout]);

	const {
		nodes,
		expandedNodes,
		selectedNode,
		selectedAttributeContent,
		selectedAttributeKey,
		attributeType,
		isLoadingAttributes,
		isReloading,
		showOperational,
		setShowOperational,
		markedForCompare,
		setMarkedForCompare,
		handleItemClick,
		handleAttributeClick,
		handleExportJson,
		reloadSelectedAttribute,
		navigateToDn,
		revealDnInTree,
		fetchNodeAttributes,
		goBack,
		goForward,
		canGoBack,
		canGoForward,
	} = useLdapTree(treeData);

	// Navigate to /search page with optional context DN
		const handleOpenSearch = useCallback(() => {
		if (selectedNode) {
			localStorage.setItem("searchBaseDn", selectedNode.dn);
		}
		router.push("/search");
	}, [selectedNode, router]);

	const handleOpenSchema = useCallback((attrName?: string) => {
		const url = attrName ? `/schema?attr=${encodeURIComponent(attrName)}` : "/schema";
		router.push(url);
	}, [router]);

	// Handle navigateToDn from localStorage (e.g. from search results "Open in Tree")
	const didNavigateRef = useRef(false);
	useEffect(() => {
		if (didNavigateRef.current) return;
		const targetDn = localStorage.getItem("navigateToDn");
		if (targetDn) {
			didNavigateRef.current = true;
			localStorage.removeItem("navigateToDn");
			setTimeout(() => revealDnInTree(targetDn), 300);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Global keyboard shortcut: Ctrl+K = command palette, Ctrl+F = search, Ctrl+1/2/3 = toggle panels, Ctrl+Shift+1/2/3 = maximize, Alt+Left/Right = history
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === "k") {
				e.preventDefault();
				setCommandPaletteOpen((v) => !v);
			}
			if ((e.ctrlKey || e.metaKey) && e.key === "f") {
				e.preventDefault();
				handleOpenSearch();
			}
			// Panel shortcuts: Ctrl+1/2/3 toggle, Ctrl+Shift+1/2/3 maximize
			if ((e.ctrlKey || e.metaKey) && ["1", "2", "3"].includes(e.key)) {
				e.preventDefault();
				const id = parseInt(e.key) as PanelId;
				if (e.shiftKey) toggleMaximize(id);
				else toggleCollapse(id);
			}
			// History: Alt+Left / Alt+Right
			if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); goBack(); }
			if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); goForward(); }
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [handleOpenSearch, toggleCollapse, toggleMaximize, goBack, goForward]);

	/* ─── Export LDIF ─── */
	const [ldifCopied, setLdifCopied] = useState(false);

	const exportLdif = useCallback(async (mode: "copy" | "file") => {
		if (!selectedNode) return;
		try {
			const ldif = await loggedInvoke<string>("get_entry_ldif", { baseDn: selectedNode.dn, includeOperational: showOperational });
			if (mode === "copy") {
				await writeText(ldif);
				setLdifCopied(true);
				setTimeout(() => setLdifCopied(false), 1500);
			} else {
				const rdn = selectedNode.dn.split(",")[0]?.replace(/[^a-zA-Z0-9_-]/g, "_") ?? "entry";
				const blob = new Blob([ldif], { type: "text/plain" });
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url; a.download = `${rdn}.ldif`;
				document.body.appendChild(a); a.click();
				document.body.removeChild(a); URL.revokeObjectURL(url);
			}
		} catch { /* ignore */ }
	}, [selectedNode, showOperational]);

	// Build command palette items
	const commands = useMemo(
		() => [
			{
				id: "search",
				label: "Advanced Search",
				shortcut: "Ctrl+F",
				action: handleOpenSearch,
			},
			{
				id: "rootdse",
				label: "Show RootDSE Information",
				action: () => setRootDseOpen(true),
			},
			{
				id: "compare",
				label: "Compare Two Entries",
				action: () => setCompareOpen(true),
			},
			{
				id: "toggle-operational",
				label: showOperational ? "Hide Operational Attributes" : "Show Operational Attributes",
				action: () => setShowOperational(!showOperational),
			},
			{
				id: "ldif-view",
				label: middleTab === "ldif" ? "Switch to Attributes View" : "Switch to LDIF View",
				action: () => setMiddleTab(middleTab === "ldif" ? "attributes" : "ldif"),
			},
			{
				id: "export-json",
				label: "Export JSON Tree",
				action: handleExportJson,
			},
			{
				id: "mark-compare",
				label: selectedNode
					? `Mark "${selectedNode.dn.split(",")[0]}" for Compare`
					: "Mark Current Node for Compare",
				action: () => { if (selectedNode) setMarkedForCompare(selectedNode.dn); },
			},
			{ id: "toggle-tree",      label: "Toggle Tree Panel",       shortcut: "Ctrl+1", action: () => toggleCollapse(1) },
			{ id: "toggle-attrs",     label: "Toggle Attributes Panel", shortcut: "Ctrl+2", action: () => toggleCollapse(2) },
			{ id: "toggle-preview",   label: "Toggle Preview Panel",    shortcut: "Ctrl+3", action: () => toggleCollapse(3) },
			{ id: "maximize-tree",    label: "Maximize Tree Panel",     shortcut: "Ctrl+Shift+1", action: () => toggleMaximize(1) },
			{ id: "maximize-attrs",   label: "Maximize Attributes Panel", shortcut: "Ctrl+Shift+2", action: () => toggleMaximize(2) },
			{ id: "maximize-preview", label: "Maximize Preview Panel",  shortcut: "Ctrl+Shift+3", action: () => toggleMaximize(3) },
			{ id: "go-back",          label: "Go Back",                  shortcut: "Alt+Left",  action: goBack },
			{ id: "go-forward",       label: "Go Forward",               shortcut: "Alt+Right", action: goForward },
			{ id: "export-ldif-copy", label: "Copy Entry as LDIF",       action: () => exportLdif("copy") },
			{ id: "export-ldif-file", label: "Download Entry as LDIF",   action: () => exportLdif("file") },
			{ id: "schema-browser",   label: "Open Schema Browser",     action: () => handleOpenSchema() },
			{ id: "disconnect",       label: "Disconnect",               action: () => setDisconnectConfirmOpen(true) },
			{ id: "connections",      label: "Toggle Connections Panel",  action: () => setConnSectionCollapsed((v) => !v) },
			{ id: "view-logs",        label: "View Logs",                 action: () => router.push("/logs") },
		],
		[showOperational, setShowOperational, middleTab, handleExportJson, selectedNode, setMarkedForCompare, handleOpenSearch, toggleCollapse, toggleMaximize, goBack, goForward, exportLdif, handleOpenSchema]
	);

	const handleNavigateToDn = useCallback(
		(dn: string) => {
			revealDnInTree(dn);
		},
		[revealDnInTree]
	);

	/* ─── Collapsed bar renderer ─── */
	const CollapsedBar = ({ id, label, icon }: { id: PanelId; label: string; icon: React.ReactNode }) => (
		<div
			className="h-full flex flex-col items-center bg-slate-800/60 border-r border-slate-700/50 cursor-pointer hover:bg-slate-700/40 transition-all"
			style={{ width: `${COLLAPSED_BAR_W}px` }}
			onClick={() => toggleCollapse(id)}
			title={`Expand ${label} (Ctrl+${id})`}
		>
			<div className="mt-3 mb-2">{icon}</div>
			<span className="text-[10px] text-slate-500 [writing-mode:vertical-lr] rotate-180 tracking-widest uppercase font-semibold select-none">
				{label}
			</span>
		</div>
	);

	/* ─── Panel header button helpers ─── */
	const PanelCollapseBtn = ({ id }: { id: PanelId }) => (
		<button onClick={() => toggleCollapse(id)} title={`Collapse (Ctrl+${id})`}
			className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-all">
			<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
			</svg>
		</button>
	);
	const PanelMaximizeBtn = ({ id }: { id: PanelId }) => (
		<button onClick={() => toggleMaximize(id)}
			title={isPanelMaximized(id) ? `Restore (Ctrl+Shift+${id})` : `Maximize (Ctrl+Shift+${id})`}
			className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-all">
			{isPanelMaximized(id) ? (
				<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
						d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
				</svg>
			) : (
				<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
						d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
				</svg>
			)}
		</button>
	);

	return (
		<div className="flex h-screen w-screen bg-slate-900 text-slate-100">

			{/* ─── Panel 1: LDAP Tree ─── */}
			{isPanelCollapsed(1) && !panelLayout.maximized ? (
				<CollapsedBar id={1} label="Tree"
					icon={<svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>} />
			) : isPanelVisible(1) ? (
				<Resizable
					width={isPanelMaximized(1) ? Infinity : treeViewWidth}
					height={Infinity}
					minConstraints={[220, Infinity]}
					maxConstraints={[500, Infinity]}
					axis="x"
					onResize={(_e, { size }) => setTreeViewWidth(size.width)}
					resizeHandles={isPanelMaximized(1) ? [] : ["e"]}
				>
					<aside
						ref={sidebarRef}
						style={{ width: isPanelMaximized(1) ? "100%" : `${treeViewWidth}px` }}
						className={`h-full flex flex-col border-r border-slate-700/50 bg-slate-900 ${isPanelMaximized(1) ? "flex-1" : ""}`}
					>
						{/* Panel Header */}
						<div className="px-4 py-3 border-b border-slate-700/50 bg-slate-800/60 flex items-center gap-2 flex-shrink-0">
							{/* Connection status badge */}
							<div className="flex items-center gap-1.5 flex-1 min-w-0">
								<span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0 animate-pulse" />
								<span className="text-xs font-medium text-slate-300 truncate" title={profileName}>
									{profileName || "Connected"}
								</span>
							</div>

							<BookmarksPanel profileId={profileId} currentDn={selectedNode?.dn ?? null} onNavigate={handleNavigateToDn} />

							<button onClick={handleOpenSearch} title="Advanced Search (Ctrl+F)"
								className="p-1.5 rounded-lg text-slate-400 bg-slate-700/40 border border-slate-600/30 hover:bg-slate-600/50 hover:text-slate-200 transition-all">
								<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
								</svg>
							</button>

							<button onClick={() => handleOpenSchema()} title="Schema Browser"
								className="p-1.5 rounded-lg text-slate-400 bg-slate-700/40 border border-slate-600/30 hover:bg-slate-600/50 hover:text-purple-300 transition-all">
								<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
										d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
								</svg>
							</button>

							{/* Disconnect button */}
							<button onClick={() => setDisconnectConfirmOpen(true)} title="Disconnect"
								className="p-1.5 rounded-lg text-slate-400 bg-slate-700/40 border border-slate-600/30 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 transition-all">
								<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
										d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
								</svg>
							</button>

							<PanelMaximizeBtn id={1} />
							<PanelCollapseBtn id={1} />
						</div>

						{/* ─── Connections Section (collapsible + resizable) ─── */}
						<div className="flex-shrink-0">
							{/* Section header — click to collapse / expand */}
							<button
								onClick={() => setConnSectionCollapsed((v) => !v)}
								className="w-full flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/40 hover:bg-slate-800/60 transition-all text-left border-b border-slate-700/40"
							>
								<svg className={`w-3 h-3 text-slate-500 transition-transform duration-150 ${!connSectionCollapsed ? "rotate-90" : ""}`}
									fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
								</svg>
								<svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
										d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
								</svg>
								<span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Connections</span>
								<span className="text-[10px] text-slate-600">({connCount})</span>
								{connSectionCollapsed && profileName && (
									<>
										<span className="text-[10px] text-slate-600 ml-0.5">·</span>
										<span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
										<span className="text-[10px] text-emerald-400/70 truncate max-w-[80px]">{profileName}</span>
									</>
								)}
								<span className="flex-1" />
								{!connSectionCollapsed && (
									<>
										<span
											onClick={(e) => { e.stopPropagation(); handleConnTreeNewFolder(null); }}
											className="p-0.5 rounded text-slate-500 hover:text-amber-400 hover:bg-slate-700/50 transition-all cursor-pointer"
											title="New Folder">
											<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
													d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
											</svg>
										</span>
										<span
											onClick={(e) => { e.stopPropagation(); handleConnTreeNewConnection(null); }}
											className="p-0.5 rounded text-slate-500 hover:text-blue-400 hover:bg-slate-700/50 transition-all cursor-pointer"
											title="New Connection">
											<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
											</svg>
										</span>
									</>
								)}
							</button>

							{/* Expanded connections list */}
							{!connSectionCollapsed && (
								<div style={{ height: `${connSectionHeight}px` }} className="overflow-y-auto custom-scrollbar bg-slate-900/80">
									<ConnectionTreeComponent
										tree={connTree}
										activeConnectionId={profileId ?? null}
										selectedId={connSelectedId}
										onSelect={setConnSelectedId}
										onConnect={handleConnTreeConnect}
										onDisconnect={handleConnTreeDisconnect}
										onEdit={handleConnTreeEdit}
										onDelete={handleConnTreeDelete}
										onNewFolder={handleConnTreeNewFolder}
										onNewConnection={handleConnTreeNewConnection}
										compact
									/>
								</div>
							)}
						</div>

						{/* Connections / tree drag-resize handle */}
						{!connSectionCollapsed && (
							<div
								className="h-1.5 flex-shrink-0 cursor-row-resize group flex items-center justify-center hover:bg-blue-500/10 transition-colors border-b border-slate-700/50"
								onMouseDown={handleConnResizeStart}
								title="Drag to resize connections panel"
							>
								<div className="w-8 h-0.5 rounded-full bg-slate-700 group-hover:bg-blue-400/50 transition-colors" />
							</div>
						)}

						{/* Tree Content */}
						<div className="flex-1 overflow-y-auto custom-scrollbar p-1">
							<RichTreeView
								slots={{ item: CustomTreeItem }}
								className="h-full text-slate-300"
								items={nodes}
								expandedItems={expandedNodes}
								onItemClick={(event, itemId) => handleItemClick(event, itemId)}
							/>
						</div>

						{/* Tree Footer */}
						<div className="px-3 py-2 border-t border-slate-700/50 bg-slate-800/40 flex-shrink-0 flex gap-2">
							<button onClick={handleExportJson}
								className="flex-1 text-xs font-medium px-3 py-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 hover:border-blue-500/40 transition-all duration-200 flex items-center justify-center gap-2">
								<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
								</svg>
								Export JSON
							</button>
							<button onClick={() => setCommandPaletteOpen(true)} title="Command Palette (Ctrl+K)"
								className="text-xs font-medium px-3 py-2 rounded-lg bg-slate-700/40 text-slate-400 border border-slate-600/30 hover:bg-slate-600/50 hover:text-slate-200 transition-all duration-200 flex items-center justify-center gap-1.5">
								<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
								</svg>
								<span className="text-[10px] text-slate-500">⌘K</span>
							</button>
						</div>
					</aside>
				</Resizable>
			) : null}

			{/* ─── Panel 2: Attributes / LDIF ─── */}
			{isPanelCollapsed(2) && !panelLayout.maximized ? (
				<CollapsedBar id={2} label="Attrs"
					icon={<svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>} />
			) : isPanelVisible(2) ? (
				<Resizable
					width={isPanelMaximized(2) ? Infinity : attrPanelWidth}
					height={Infinity}
					minConstraints={[240, Infinity]}
					maxConstraints={[600, Infinity]}
					axis="x"
					onResize={(_e, { size }) => setAttrPanelWidth(size.width)}
					resizeHandles={isPanelMaximized(2) ? [] : ["e"]}
				>
					<section
						style={{ width: isPanelMaximized(2) ? "100%" : `${attrPanelWidth}px` }}
						className={`h-full flex flex-col border-r border-slate-700/50 bg-slate-900 ${isPanelMaximized(2) ? "flex-1" : ""}`}
					>
						{/* Panel Header */}
						<div className="px-4 py-3 border-b border-slate-700/50 bg-slate-800/60 flex items-center gap-2 flex-shrink-0">
							<svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
									d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
							</svg>

							<div className="flex gap-0.5 bg-slate-800/80 rounded-md p-0.5 border border-slate-700/40">
								<button onClick={() => setMiddleTab("attributes")}
									className={`text-[10px] px-2 py-0.5 rounded transition-all font-semibold uppercase tracking-wider ${middleTab === "attributes" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "text-slate-500 hover:text-slate-300 border border-transparent"}`}>
									Attrs
								</button>
								<button onClick={() => setMiddleTab("ldif")}
									className={`text-[10px] px-2 py-0.5 rounded transition-all font-semibold uppercase tracking-wider ${middleTab === "ldif" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "text-slate-500 hover:text-slate-300 border border-transparent"}`}>
									LDIF
								</button>
							</div>

							<div className="flex-1" />

							<button onClick={() => setShowOperational(!showOperational)}
								title={showOperational ? "Showing operational attributes" : "Click to show operational attributes"}
								className={`text-[10px] px-2 py-1 rounded-md border transition-all font-medium ${showOperational ? "bg-purple-500/20 text-purple-300 border-purple-500/30" : "bg-slate-700/40 text-slate-500 border-slate-600/30 hover:text-slate-300"}`}>
								{showOperational ? "Op ✓" : "Op"}
							</button>

							<button onClick={toggleMultiValueRows}
								title={multiValueRows ? "Multi-value rows expanded" : "Expand multi-value attributes into separate rows"}
								className={`text-[10px] px-2 py-1 rounded-md border transition-all font-medium ${multiValueRows ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" : "bg-slate-700/40 text-slate-500 border-slate-600/30 hover:text-slate-300"}`}>
								{multiValueRows ? "MV ✓" : "MV"}
							</button>

							<button onClick={() => setRootDseOpen(true)} title="RootDSE Info"
								className="p-1.5 rounded-lg text-slate-400 bg-slate-700/40 border border-slate-600/30 hover:bg-slate-600/50 hover:text-slate-200 transition-all">
								<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
										d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
								</svg>
							</button>

							<button onClick={() => { if (selectedNode && !markedForCompare) setMarkedForCompare(selectedNode.dn); else if (markedForCompare) setCompareOpen(true); }}
								title={markedForCompare ? `Compare with "${markedForCompare.split(",")[0]}"` : "Mark for Compare"}
								className={`p-1.5 rounded-lg border transition-all ${markedForCompare ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/30" : "bg-slate-700/40 text-slate-400 border-slate-600/30 hover:bg-slate-600/50 hover:text-slate-200"}`}>
								<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
										d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
								</svg>
							</button>

							{/* Export LDIF dropdown */}
							<div className="relative group">
								<button title="Export LDIF" disabled={!selectedNode}
									className="p-1.5 rounded-lg text-slate-400 bg-slate-700/40 border border-slate-600/30 hover:bg-slate-600/50 hover:text-slate-200 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
									<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
											d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
									</svg>
								</button>
								{selectedNode && (
									<div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700/60 rounded-lg shadow-xl z-50 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all">
										<button onClick={() => exportLdif("copy")}
											className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700/50 rounded-t-lg whitespace-nowrap">
											{ldifCopied ? "✓ Copied!" : "Copy as LDIF"}
										</button>
										<button onClick={() => exportLdif("file")}
											className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700/50 rounded-b-lg whitespace-nowrap">
											Download .ldif
										</button>
									</div>
								)}
							</div>

							<PanelMaximizeBtn id={2} />
							<PanelCollapseBtn id={2} />
						</div>

						{/* DN Breadcrumb */}
						{selectedNode && (
							<div className="px-3 py-1.5 border-b border-slate-700/30 bg-slate-800/30 flex-shrink-0 flex items-center gap-1">
								{/* Back / Forward */}
								<button onClick={goBack} disabled={!canGoBack} title="Go Back (Alt+Left)"
									className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-all disabled:opacity-25 disabled:cursor-not-allowed">
									<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
									</svg>
								</button>
								<button onClick={goForward} disabled={!canGoForward} title="Go Forward (Alt+Right)"
									className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-all disabled:opacity-25 disabled:cursor-not-allowed mr-1">
									<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
									</svg>
								</button>
								<div className="flex-1 min-w-0">
									<DnBreadcrumb dn={selectedNode.dn} onNavigate={handleNavigateToDn} />
								</div>
							</div>
						)}

						{/* Panel content */}
						<div className="flex-1 overflow-hidden">
							{middleTab === "attributes" ? (
								<AttributePanel
									selectedNode={selectedNode}
									selectedAttributeKey={selectedAttributeKey}
									isLoading={isLoadingAttributes}
									onAttributeClick={handleAttributeClick}
									onAttributeEdited={() => { if (selectedNode) fetchNodeAttributes(selectedNode); }}
									multiValueRows={multiValueRows}
									profileId={profileId ?? undefined}
								/>
							) : (
								<LdifView dn={selectedNode?.dn ?? null} includeOperational={showOperational} />
							)}
						</div>
					</section>
				</Resizable>
			) : null}

			{/* ─── Panel 3: Content Preview ─── */}
			{isPanelCollapsed(3) && !panelLayout.maximized ? (
				<CollapsedBar id={3} label="Preview"
					icon={<svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>} />
			) : isPanelVisible(3) ? (
				<section className="flex-1 flex flex-col min-w-0 bg-slate-900/80">
					{/* Panel Header */}
					<div className="px-4 py-3 border-b border-slate-700/50 bg-slate-800/60 flex items-center gap-2 flex-shrink-0">
						<svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
								d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
								d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
						</svg>
						<h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex-1">
							Content Preview
						</h2>
						<PanelMaximizeBtn id={3} />
						<PanelCollapseBtn id={3} />
					</div>

					{/* Dynamic Content */}
					<div className="flex-1 overflow-hidden">
						<ContentPreview
							attributeType={attributeType}
							content={selectedAttributeContent}
							attributeKey={selectedAttributeKey}
							selectedDn={selectedNode?.dn ?? null}
							onReload={reloadSelectedAttribute}
							isReloading={isReloading}
						/>
					</div>
				</section>
			) : null}

			{/* ─── Modals ─── */}
			<RootDseModal open={rootDseOpen} onClose={() => setRootDseOpen(false)} />
			<CompareEntriesModal
				open={compareOpen}
				onClose={() => { setCompareOpen(false); setMarkedForCompare(null); }}
				dnA={markedForCompare}
				dnB={selectedNode?.dn !== markedForCompare ? selectedNode?.dn : null}
			/>
			<CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} commands={commands} />

			{/* Disconnect confirm */}
			<ConfirmDialog
				open={disconnectConfirmOpen}
				title="Disconnect?"
				message={`Disconnect from "${profileName || "current server"}"? You will return to the connection browser.`}
				confirmLabel="Disconnect"
				onConfirm={() => { setDisconnectConfirmOpen(false); handleDisconnect(); }}
				onCancel={() => setDisconnectConfirmOpen(false)}
			/>

			{/* Switch connection confirm */}
			<ConfirmDialog
				open={switchConfirm.open}
				title="Switch Connection?"
				message={`This will disconnect from "${profileName || "current"}" and connect to "${switchConfirm.target?.name ?? ""}".`}
				confirmLabel="Switch"
				confirmColor="bg-blue-500 hover:bg-blue-400"
				onConfirm={() => { setSwitchConfirm({ open: false, target: null }); if (switchConfirm.target) doSwitchConnection(switchConfirm.target); }}
				onCancel={() => setSwitchConfirm({ open: false, target: null })}
			/>

			{/* Conn tree folder dialog */}
			<FolderNameDialog
				open={connFolderDialog.open}
				title={connFolderDialog.editId ? "Rename Folder" : "New Folder"}
				initialName={connFolderDialog.initialName}
				onSave={(name) => {
					if (connFolderDialog.editId) {
						updateConnTree((prev) => updateNodeInTree(prev, connFolderDialog.editId!, { name } as Partial<FolderNode>));
					} else {
						const folder: FolderNode = { id: uuid(), name, type: "folder", children: [] };
						updateConnTree((prev) => insertNode(prev, connFolderDialog.parentId, folder));
					}
					setConnFolderDialog({ open: false, parentId: null });
				}}
				onCancel={() => setConnFolderDialog({ open: false, parentId: null })}
			/>

			{/* Conn tree connection form */}
			<ConnectionFormModal
				open={connFormDialog.open}
				initial={connFormDialog.initial}
				isEdit={!!connFormDialog.editId}
				onSave={(data) => {
					if (connFormDialog.editId) {
						updateConnTree((prev) => updateNodeInTree(prev, connFormDialog.editId!, { ...data } as Partial<ConnectionNode>));
					} else {
						const conn: ConnectionNode = { id: uuid(), type: "connection", ...data };
						updateConnTree((prev) => insertNode(prev, connFormDialog.parentId, conn));
					}
					setConnFormDialog({ open: false, parentId: null });
				}}
				onCancel={() => setConnFormDialog({ open: false, parentId: null })}
			/>

			{/* Conn tree delete confirm */}
			<ConfirmDialog
				open={connDeleteConfirm.open}
				title="Delete Folder?"
				message={`"${connDeleteConfirm.node?.name ?? ""}" is not empty. All contents will be deleted.`}
				confirmLabel="Delete Anyway"
				onConfirm={() => {
					if (connDeleteConfirm.node) updateConnTree((prev) => removeNodeById(prev, connDeleteConfirm.node!.id));
					setConnDeleteConfirm({ open: false, node: null });
				}}
				onCancel={() => setConnDeleteConfirm({ open: false, node: null })}
			/>
		</div>
	);
};

export default LdapTreeView;
