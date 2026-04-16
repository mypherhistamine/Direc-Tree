import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LdapNode } from "../models/LdapNode";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import EditAttributeModal from "./EditAttributeModal";

interface AttributePanelProps {
	selectedNode: LdapNode | null;
	selectedAttributeKey: string | null;
	isLoading: boolean;
	onAttributeClick: (key: string, value: string) => void;
	/** Called after a successful edit so the caller can reload attributes */
	onAttributeEdited?: () => void;
	/** Whether multi-value rows are expanded */
	multiValueRows?: boolean;
	/** Active connection profile id for per-entry favorites persistence */
	profileId?: string;
}

// ── Favorites persistence helpers ──

function favStorageKey(profileId: string, dn: string): string {
	return `direcTree.favAttrs.${profileId}.${btoa(dn)}`;
}

function loadFavorites(profileId: string | undefined, dn: string | undefined): Set<string> {
	if (!profileId || !dn) return new Set();
	try {
		const raw = localStorage.getItem(favStorageKey(profileId, dn));
		if (raw) return new Set(JSON.parse(raw) as string[]);
	} catch { /* ignore */ }
	return new Set();
}

function saveFavorites(profileId: string | undefined, dn: string | undefined, favs: Set<string>): void {
	if (!profileId || !dn) return;
	try {
		if (favs.size === 0) {
			localStorage.removeItem(favStorageKey(profileId, dn));
		} else {
			localStorage.setItem(favStorageKey(profileId, dn), JSON.stringify([...favs]));
		}
	} catch { /* quota */ }
}

// ── Template persistence helpers ──

function templateStorageKey(profileId: string, objectClass: string): string {
	return `direcTree.favTemplate.${profileId}.${objectClass.toLowerCase()}`;
}

/** Get the primary structural objectClass for a node (last non-"top" class in the list) */
function getPrimaryObjectClass(attrs: Record<string, string[]> | undefined): string | null {
	if (!attrs) return null;
	const ocs = attrs["objectClass"] ?? attrs["objectclass"] ?? [];
	// Prefer the last class in the list (most specific / structural) that isn't "top"
	for (let i = ocs.length - 1; i >= 0; i--) {
		if (ocs[i].toLowerCase() !== "top") return ocs[i];
	}
	return ocs[0] ?? null;
}

function loadTemplate(profileId: string | undefined, objectClass: string | null): Set<string> {
	if (!profileId || !objectClass) return new Set();
	try {
		const raw = localStorage.getItem(templateStorageKey(profileId, objectClass));
		if (raw) return new Set(JSON.parse(raw) as string[]);
	} catch { /* ignore */ }
	return new Set();
}

function saveTemplate(profileId: string | undefined, objectClass: string | null, favs: Set<string>): void {
	if (!profileId || !objectClass) return;
	try {
		if (favs.size === 0) {
			localStorage.removeItem(templateStorageKey(profileId, objectClass));
		} else {
			localStorage.setItem(templateStorageKey(profileId, objectClass), JSON.stringify([...favs]));
		}
	} catch { /* quota */ }
}

interface ContextMenuState {
	visible: boolean;
	x: number;
	y: number;
	key: string;
	values: string[];
}

const AttributePanel: React.FC<AttributePanelProps> = ({
	selectedNode,
	selectedAttributeKey,
	isLoading,
	onAttributeClick,
	onAttributeEdited,
	multiValueRows = false,
	profileId,
}) => {
	const [filter, setFilter] = useState("");
	const [copiedKey, setCopiedKey] = useState<string | null>(null);
	const [contextMenu, setContextMenu] = useState<ContextMenuState>({
		visible: false, x: 0, y: 0, key: "", values: [],
	});
	const router = useRouter();
	const menuRef = useRef<HTMLDivElement>(null);

	// Edit modal state
	const [editOpen, setEditOpen] = useState(false);
	const [editAttrName, setEditAttrName] = useState<string | null>(null);
	const [editAttrValue, setEditAttrValue] = useState<string | null>(null);

	// ── Favorites state ──
	const [favorites, setFavorites] = useState<Set<string>>(new Set());
	const [usingTemplate, setUsingTemplate] = useState(false); // true when auto-applied from template

	// Derive primary objectClass for template features
	const primaryOC = useMemo(() => getPrimaryObjectClass(selectedNode?.attributes), [selectedNode?.attributes]);

	// Reload favorites when selectedNode or profileId changes
	// Auto-apply objectClass template if no per-entry favorites exist
	useEffect(() => {
		const perEntry = loadFavorites(profileId, selectedNode?.dn);
		if (perEntry.size > 0) {
			setFavorites(perEntry);
			setUsingTemplate(false);
		} else {
			// Try template
			const tmpl = loadTemplate(profileId, primaryOC);
			if (tmpl.size > 0) {
				setFavorites(tmpl);
				setUsingTemplate(true);
			} else {
				setFavorites(new Set());
				setUsingTemplate(false);
			}
		}
	}, [profileId, selectedNode?.dn, primaryOC]);

	const toggleFavorite = useCallback((key: string) => {
		setFavorites(prev => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key); else next.add(key);
			saveFavorites(profileId, selectedNode?.dn, next);
			setUsingTemplate(false); // once user edits, it's per-entry
			return next;
		});
	}, [profileId, selectedNode?.dn]);

	const handleSaveTemplate = useCallback(() => {
		saveTemplate(profileId, primaryOC, favorites);
	}, [profileId, primaryOC, favorites]);

	const handleApplyTemplate = useCallback(() => {
		const tmpl = loadTemplate(profileId, primaryOC);
		if (tmpl.size > 0) {
			setFavorites(tmpl);
			saveFavorites(profileId, selectedNode?.dn, tmpl);
			setUsingTemplate(false);
		}
	}, [profileId, primaryOC, selectedNode?.dn]);

	const handleClearTemplate = useCallback(() => {
		saveTemplate(profileId, primaryOC, new Set());
	}, [profileId, primaryOC]);

	const entries = useMemo(() => {
		return selectedNode?.attributes ? Object.entries(selectedNode.attributes) : [];
	}, [selectedNode]);

	const filteredEntries = useMemo(() => {
		if (!filter.trim()) return entries;
		const lower = filter.toLowerCase();
		return entries.filter(([key]) => key.toLowerCase().includes(lower));
	}, [entries, filter]);

	// Split into favorites (pinned to top) and the rest
	const favoriteEntries = useMemo(() => {
		return filteredEntries.filter(([key]) => favorites.has(key));
	}, [filteredEntries, favorites]);

	const regularEntries = useMemo(() => {
		return filteredEntries.filter(([key]) => !favorites.has(key));
	}, [filteredEntries, favorites]);

	const hiddenCount = entries.length - filteredEntries.length;

	const copyToClipboard = useCallback(async (text: string, feedbackKey?: string) => {
		try {
			await writeText(text);
			if (feedbackKey) {
				setCopiedKey(feedbackKey);
				setTimeout(() => setCopiedKey(null), 1500);
			}
		} catch (err) {
			console.error("Failed to copy:", err);
		}
	}, []);

	// ── Context menu handlers ──
	const handleContextMenu = useCallback((e: React.MouseEvent, key: string, values: string[]) => {
		e.preventDefault();
		setContextMenu({ visible: true, x: e.clientX, y: e.clientY, key, values });
	}, []);

	const closeContextMenu = useCallback(() => {
		setContextMenu((prev) => ({ ...prev, visible: false }));
	}, []);

	// Close context menu when clicking outside
	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				closeContextMenu();
			}
		};
		if (contextMenu.visible) {
			document.addEventListener("mousedown", handler);
		}
		return () => document.removeEventListener("mousedown", handler);
	}, [contextMenu.visible, closeContextMenu]);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-full text-slate-400">
				<div className="flex flex-col items-center gap-3">
					<div className="w-6 h-6 border-2 border-slate-500 border-t-blue-400 rounded-full animate-spin" />
					<span className="text-sm">Loading attributes...</span>
				</div>
			</div>
		);
	}

	if (!selectedNode) {
		return (
			<div className="flex items-center justify-center h-full text-slate-500">
				<div className="flex flex-col items-center gap-2 text-center px-6">
					<svg className="w-12 h-12 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
							d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
					</svg>
					<p className="text-sm font-medium">Select a node to view attributes</p>
					<p className="text-xs text-slate-600">Click on any item in the tree</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			{/* Header with DN + copy button */}
			<div className="px-4 py-3 border-b border-slate-700/50 bg-slate-800/50 group">
				<div className="flex items-center justify-between mb-1">
					<p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
						Distinguished Name
					</p>
					<button
						onClick={() => copyToClipboard(selectedNode.dn, "__dn__")}
						title="Copy DN"
						className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-colors"
					>
						{copiedKey === "__dn__" ? (
							<svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
							</svg>
						) : (
							<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
									d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
							</svg>
						)}
					</button>
				</div>
				<p className="text-sm text-slate-200 font-mono break-all leading-relaxed">
					{selectedNode.dn}
				</p>
			</div>

			{/* Quick Actions bar */}
			<div className="px-4 py-1.5 border-b border-slate-700/50 bg-slate-800/30 flex items-center gap-1.5 flex-wrap">
				<span className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold mr-1">Quick</span>
				{/* Copy DN */}
				<button
					onClick={() => copyToClipboard(selectedNode.dn, "__qa_dn__")}
					title="Copy full DN"
					className={`text-[10px] px-2 py-0.5 rounded-md border transition-all ${copiedKey === "__qa_dn__" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" : "bg-slate-700/30 text-slate-400 border-slate-600/25 hover:bg-slate-600/40 hover:text-slate-200"}`}
				>
					{copiedKey === "__qa_dn__" ? "✓ DN" : "Copy DN"}
				</button>
				{/* Copy RDN */}
				<button
					onClick={() => {
						const rdn = selectedNode.dn.split(",")[0] ?? selectedNode.dn;
						copyToClipboard(rdn, "__qa_rdn__");
					}}
					title="Copy RDN (first component)"
					className={`text-[10px] px-2 py-0.5 rounded-md border transition-all ${copiedKey === "__qa_rdn__" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" : "bg-slate-700/30 text-slate-400 border-slate-600/25 hover:bg-slate-600/40 hover:text-slate-200"}`}
				>
					{copiedKey === "__qa_rdn__" ? "✓ RDN" : "Copy RDN"}
				</button>
				{/* Copy canonical path (OU chain) */}
				<button
					onClick={() => {
						const parts = selectedNode.dn.split(",").map(p => p.split("=")[1] ?? p).reverse();
						const path = "/" + parts.join("/");
						copyToClipboard(path, "__qa_path__");
					}}
					title="Copy as path (/domain/ou/.../cn)"
					className={`text-[10px] px-2 py-0.5 rounded-md border transition-all ${copiedKey === "__qa_path__" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" : "bg-slate-700/30 text-slate-400 border-slate-600/25 hover:bg-slate-600/40 hover:text-slate-200"}`}
				>
					{copiedKey === "__qa_path__" ? "✓ Path" : "Copy Path"}
				</button>
				{/* Copy all as LDIF */}
				<button
					onClick={() => {
						const ldif = [`dn: ${selectedNode.dn}`, ...entries.flatMap(([k, vs]) => vs.map(v => `${k}: ${v}`))].join("\n");
						copyToClipboard(ldif, "__qa_ldif__");
					}}
					title="Copy all attributes as LDIF"
					className={`text-[10px] px-2 py-0.5 rounded-md border transition-all ${copiedKey === "__qa_ldif__" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" : "bg-slate-700/30 text-slate-400 border-slate-600/25 hover:bg-slate-600/40 hover:text-slate-200"}`}
				>
					{copiedKey === "__qa_ldif__" ? "✓ LDIF" : "Copy LDIF"}
				</button>
			</div>

			{/* Filter + count */}
			<div className="px-4 py-2 border-b border-slate-700/50 flex flex-col gap-2">
				<div className="relative">
					<svg className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
							d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
					</svg>
					<input
						type="text"
						value={filter}
						onChange={(e) => setFilter(e.target.value)}
						placeholder="Filter attributes..."
						className="w-full text-xs pl-8 pr-2 py-1.5 rounded-md
							bg-slate-800 border border-slate-700/50 text-slate-300
							placeholder-slate-500
							focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20
							transition-all"
					/>
				</div>
				<div className="flex items-center gap-2">
					<span className="text-xs text-slate-400 flex-1">
						{filteredEntries.length} attribute{filteredEntries.length !== 1 ? "s" : ""}
						{hiddenCount > 0 && (
							<span className="text-slate-500"> ({hiddenCount} hidden)</span>
						)}
						{favorites.size > 0 && (
							<span className="text-amber-400/60"> · {favorites.size} ★</span>
						)}
						{usingTemplate && primaryOC && (
							<span className="text-amber-500/50 italic"> (from {primaryOC} template)</span>
						)}
					</span>
					{/* Template actions dropdown */}
					{profileId && primaryOC && favorites.size > 0 && (
						<button
							onClick={handleSaveTemplate}
							title={`Save current favorites as template for ${primaryOC}`}
							className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400/70
								border border-amber-500/15 hover:bg-amber-500/20 hover:text-amber-300 transition-all"
						>
							Save ★ Template
						</button>
					)}
					{profileId && primaryOC && loadTemplate(profileId, primaryOC).size > 0 && (
						<button
							onClick={handleApplyTemplate}
							title={`Apply ${primaryOC} template favorites`}
							className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/40 text-slate-400
								border border-slate-600/30 hover:bg-slate-600/50 hover:text-slate-200 transition-all"
						>
							Apply
						</button>
					)}
				</div>
				{/* Add Attribute button */}
				{selectedNode && (
					<button
						onClick={() => {
							setEditAttrName(null);
							setEditAttrValue(null);
							setEditOpen(true);
						}}
						title="Add new attribute"
						className="ml-auto text-[10px] px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400
							border border-emerald-500/20 hover:bg-emerald-500/20 transition-all font-medium"
					>
						+ Add
					</button>
				)}
			</div>

			{/* Scrollable Table */}
			<div className="flex-1 overflow-y-auto custom-scrollbar relative">
				<table className="w-full text-sm">
					<thead className="sticky top-0 z-10">
						<tr className="bg-slate-800">
							<th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-700/50 w-[40%]">
								Attribute
							</th>
							<th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-700/50">
								Value
							</th>
						</tr>
					</thead>
					<tbody>
						{/* ── Favorite attributes (pinned to top) ── */}
						{favoriteEntries.length > 0 && (
							<tr>
								<td colSpan={2} className="px-4 py-1.5 bg-amber-500/5 border-b border-amber-500/15">
									<span className="text-[10px] text-amber-400/80 uppercase tracking-wider font-semibold flex items-center gap-1.5">
										<svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
											<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
										</svg>
										Favorites ({favoriteEntries.length})
									</span>
								</td>
							</tr>
						)}
						{favoriteEntries.map(([key, values], index) => {
							const isSelected = key === selectedAttributeKey;
							const displayValue = values.join(", ");
							const isMulti = values.length > 1;

							if (multiValueRows && isMulti) {
								return values.map((val, vi) => (
									<tr
										key={`fav_${key}__${vi}`}
										onClick={() => onAttributeClick(key, val)}
										onContextMenu={(e) => handleContextMenu(e, key, values)}
										className={`
											cursor-pointer transition-colors duration-150 group/row
											${isSelected
												? "bg-blue-500/15 border-l-2 border-l-blue-400"
												: "bg-amber-500/[0.03] border-l-2 border-l-amber-500/30"
											}
											hover:bg-slate-700/50
										`}
									>
										<td className="px-4 py-2 font-medium text-slate-300 whitespace-nowrap">
											{vi === 0 ? (
												<span className="flex items-center gap-1.5">
													<button onClick={(e) => { e.stopPropagation(); toggleFavorite(key); }}
														title="Remove from favorites"
														className="flex-shrink-0 p-0 text-amber-400 hover:text-amber-300 transition-colors">
														<svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
															<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
														</svg>
													</button>
													{key}
													<span className="text-[9px] text-blue-400/60 font-normal">({values.length})</span>
												</span>
											) : (
												<span className="text-slate-600 text-[10px] pl-3">└</span>
											)}
										</td>
										<td className="px-4 py-2 text-slate-400 font-mono text-xs">
											<div className="flex items-center gap-1.5">
												<button
													onClick={(e) => { e.stopPropagation(); copyToClipboard(val, `${key}__${vi}`); }}
													title="Copy this value"
													className={`flex-shrink-0 p-0.5 rounded transition-all
														${copiedKey === `${key}__${vi}`
															? "text-emerald-400"
															: "text-slate-600 opacity-0 group-hover/row:opacity-100 hover:text-slate-300"
														}`}
												>
													{copiedKey === `${key}__${vi}` ? (
														<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
														</svg>
													) : (
														<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
																d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
														</svg>
													)}
												</button>
												{vi === 0 && (
													<button
														onClick={(e) => {
															e.stopPropagation();
															setEditAttrName(key);
															setEditAttrValue(displayValue);
															setEditOpen(true);
														}}
														title="Edit attribute"
														className="flex-shrink-0 p-0.5 rounded transition-all
															text-slate-600 opacity-0 group-hover/row:opacity-100 hover:text-amber-400"
													>
														<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
																d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
														</svg>
													</button>
												)}
												<span className="truncate max-w-[220px]" title={val}>
													{val}
												</span>
											</div>
										</td>
									</tr>
								));
							}

							return (
								<tr
									key={`fav_${key}`}
									onClick={() => onAttributeClick(key, displayValue)}
									onContextMenu={(e) => handleContextMenu(e, key, values)}
									className={`
										cursor-pointer transition-colors duration-150 group/row
										${isSelected
											? "bg-blue-500/15 border-l-2 border-l-blue-400"
											: "bg-amber-500/[0.03] border-l-2 border-l-amber-500/30"
										}
										hover:bg-slate-700/50
									`}
								>
									<td className="px-4 py-2 font-medium text-slate-300 whitespace-nowrap">
										<span className="flex items-center gap-1.5">
											<button onClick={(e) => { e.stopPropagation(); toggleFavorite(key); }}
												title="Remove from favorites"
												className="flex-shrink-0 p-0 text-amber-400 hover:text-amber-300 transition-colors">
												<svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
													<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
												</svg>
											</button>
											{key}
											{isMulti && (
												<span className="text-[9px] text-blue-400/60 font-normal">({values.length})</span>
											)}
										</span>
									</td>
									<td className="px-4 py-2 text-slate-400 font-mono text-xs">
										<div className="flex items-center gap-1.5">
											<button
												onClick={(e) => { e.stopPropagation(); copyToClipboard(displayValue, key); }}
												title="Copy all values"
												className={`flex-shrink-0 p-0.5 rounded transition-all
													${copiedKey === key
														? "text-emerald-400"
														: "text-slate-600 opacity-0 group-hover/row:opacity-100 hover:text-slate-300"
													}`}
											>
												{copiedKey === key ? (
													<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
													</svg>
												) : (
													<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
															d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
													</svg>
												)}
											</button>
											<button
												onClick={(e) => {
													e.stopPropagation();
													setEditAttrName(key);
													setEditAttrValue(displayValue);
													setEditOpen(true);
												}}
												title="Edit attribute"
												className="flex-shrink-0 p-0.5 rounded transition-all
													text-slate-600 opacity-0 group-hover/row:opacity-100 hover:text-amber-400"
											>
												<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
														d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
												</svg>
											</button>
											<span className="truncate max-w-[220px]" title={displayValue}>
												{displayValue}
											</span>
										</div>
									</td>
								</tr>
							);
						})}

						{/* ── Divider between favorites and regular ── */}
						{favoriteEntries.length > 0 && regularEntries.length > 0 && (
							<tr>
								<td colSpan={2} className="border-b-2 border-amber-500/15 h-0" />
							</tr>
						)}

						{/* ── Regular (non-favorite) attributes ── */}
						{regularEntries.map(([key, values], index) => {
							const isSelected = key === selectedAttributeKey;
							const displayValue = values.join(", ");
							const isMulti = values.length > 1;

							if (multiValueRows && isMulti) {
								return values.map((val, vi) => (
									<tr
										key={`${key}__${vi}`}
										onClick={() => onAttributeClick(key, val)}
										onContextMenu={(e) => handleContextMenu(e, key, values)}
										className={`
											cursor-pointer transition-colors duration-150 group/row
											${isSelected
												? "bg-blue-500/15 border-l-2 border-l-blue-400"
												: index % 2 === 0
													? "bg-transparent border-l-2 border-l-transparent"
													: "bg-slate-800/30 border-l-2 border-l-transparent"
											}
											hover:bg-slate-700/50
										`}
									>
										<td className="px-4 py-2 font-medium text-slate-300 whitespace-nowrap">
											{vi === 0 ? (
												<span className="flex items-center gap-1.5">
													<button onClick={(e) => { e.stopPropagation(); toggleFavorite(key); }}
														title="Add to favorites"
														className="flex-shrink-0 p-0 text-slate-600 opacity-0 group-hover/row:opacity-100 hover:text-amber-400 transition-all">
														<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
															<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
														</svg>
													</button>
													{key}
													<span className="text-[9px] text-blue-400/60 font-normal">({values.length})</span>
												</span>
											) : (
												<span className="text-slate-600 text-[10px] pl-3">└</span>
											)}
										</td>
										<td className="px-4 py-2 text-slate-400 font-mono text-xs">
											<div className="flex items-center gap-1.5">
												<button
													onClick={(e) => { e.stopPropagation(); copyToClipboard(val, `${key}__${vi}`); }}
													title="Copy this value"
													className={`flex-shrink-0 p-0.5 rounded transition-all
														${copiedKey === `${key}__${vi}`
															? "text-emerald-400"
															: "text-slate-600 opacity-0 group-hover/row:opacity-100 hover:text-slate-300"
														}`}
												>
													{copiedKey === `${key}__${vi}` ? (
														<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
														</svg>
													) : (
														<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
																d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
														</svg>
													)}
												</button>
												{vi === 0 && (
													<button
														onClick={(e) => {
															e.stopPropagation();
															setEditAttrName(key);
															setEditAttrValue(displayValue);
															setEditOpen(true);
														}}
														title="Edit attribute"
														className="flex-shrink-0 p-0.5 rounded transition-all
															text-slate-600 opacity-0 group-hover/row:opacity-100 hover:text-amber-400"
													>
														<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
																d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
														</svg>
													</button>
												)}
												<span className="truncate max-w-[220px]" title={val}>
													{val}
												</span>
											</div>
										</td>
									</tr>
								));
							}

							return (
								<tr
									key={key}
									onClick={() => onAttributeClick(key, displayValue)}
									onContextMenu={(e) => handleContextMenu(e, key, values)}
									className={`
										cursor-pointer transition-colors duration-150 group/row
										${isSelected
											? "bg-blue-500/15 border-l-2 border-l-blue-400"
											: index % 2 === 0
												? "bg-transparent border-l-2 border-l-transparent"
												: "bg-slate-800/30 border-l-2 border-l-transparent"
										}
										hover:bg-slate-700/50
									`}
								>
									<td className="px-4 py-2 font-medium text-slate-300 whitespace-nowrap">
										<span className="flex items-center gap-1.5">
											<button onClick={(e) => { e.stopPropagation(); toggleFavorite(key); }}
												title="Add to favorites"
												className="flex-shrink-0 p-0 text-slate-600 opacity-0 group-hover/row:opacity-100 hover:text-amber-400 transition-all">
												<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
													<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
												</svg>
											</button>
											{key}
											{isMulti && (
												<span className="text-[9px] text-blue-400/60 font-normal">({values.length})</span>
											)}
										</span>
									</td>
									<td className="px-4 py-2 text-slate-400 font-mono text-xs">
										<div className="flex items-center gap-1.5">
											<button
												onClick={(e) => { e.stopPropagation(); copyToClipboard(displayValue, key); }}
												title="Copy all values"
												className={`flex-shrink-0 p-0.5 rounded transition-all
													${copiedKey === key
														? "text-emerald-400"
														: "text-slate-600 opacity-0 group-hover/row:opacity-100 hover:text-slate-300"
													}`}
											>
												{copiedKey === key ? (
													<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
													</svg>
												) : (
													<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
															d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
													</svg>
												)}
											</button>
											<button
												onClick={(e) => {
													e.stopPropagation();
													setEditAttrName(key);
													setEditAttrValue(displayValue);
													setEditOpen(true);
												}}
												title="Edit attribute"
												className="flex-shrink-0 p-0.5 rounded transition-all
													text-slate-600 opacity-0 group-hover/row:opacity-100 hover:text-amber-400"
											>
												<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
														d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
												</svg>
											</button>
											<span className="truncate max-w-[220px]" title={displayValue}>
												{displayValue}
											</span>
										</div>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>

				{/* ── Context Menu ── */}
				{contextMenu.visible && (
					<div
						ref={menuRef}
						style={{ position: "fixed", top: contextMenu.y, left: contextMenu.x }}
						className="z-50 min-w-[200px] py-1 rounded-lg shadow-xl
							bg-slate-800 border border-slate-700/60
							text-sm text-slate-300"
					>
						{/* Copy Key */}
						<button
							className="w-full text-left px-3 py-1.5 hover:bg-slate-700/60 transition-colors flex items-center gap-2"
							onClick={() => { copyToClipboard(contextMenu.key); closeContextMenu(); }}
						>
							<svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
									d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
							</svg>
							Copy Key
						</button>
						{/* Copy Value(s) */}
						<button
							className="w-full text-left px-3 py-1.5 hover:bg-slate-700/60 transition-colors flex items-center gap-2"
							onClick={() => { copyToClipboard(contextMenu.values.join(", ")); closeContextMenu(); }}
						>
							<svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
									d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
							</svg>
							Copy Value{contextMenu.values.length > 1 ? "s" : ""}
						</button>
						{/* Copy "Key: Value" */}
						<button
							className="w-full text-left px-3 py-1.5 hover:bg-slate-700/60 transition-colors flex items-center gap-2"
							onClick={() => { copyToClipboard(`${contextMenu.key}: ${contextMenu.values.join(", ")}`); closeContextMenu(); }}
						>
							<svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
									d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
							</svg>
							Copy &quot;Key: Value&quot;
						</button>
						{/* Copy DN */}
						{selectedNode && (
							<button
								className="w-full text-left px-3 py-1.5 hover:bg-slate-700/60 transition-colors flex items-center gap-2"
								onClick={() => { copyToClipboard(selectedNode.dn); closeContextMenu(); }}
							>
								<svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
										d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
								</svg>
								Copy DN
							</button>
						)}
						{/* Copy as LDIF */}
						<button
							className="w-full text-left px-3 py-1.5 hover:bg-slate-700/60 transition-colors flex items-center gap-2"
							onClick={() => {
								const ldif = contextMenu.values.map(v => `${contextMenu.key}: ${v}`).join("\n");
								copyToClipboard(ldif);
								closeContextMenu();
							}}
						>
							<svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
									d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
							</svg>
							Copy as LDIF
						</button>
						{/* Divider */}
						<div className="my-1 border-t border-slate-700/50" />
						{/* Toggle Favorite */}
						<button
							className="w-full text-left px-3 py-1.5 hover:bg-slate-700/60 transition-colors flex items-center gap-2"
							onClick={() => { toggleFavorite(contextMenu.key); closeContextMenu(); }}
						>
							{favorites.has(contextMenu.key) ? (
								<svg className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
									<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
								</svg>
							) : (
								<svg className="w-3.5 h-3.5 text-amber-400/60" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
									<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
								</svg>
							)}
							{favorites.has(contextMenu.key) ? "Remove from Favorites" : "Add to Favorites"}
						</button>
						{/* Edit attribute */}
						<button
							className="w-full text-left px-3 py-1.5 hover:bg-slate-700/60 transition-colors flex items-center gap-2"
							onClick={() => {
								setEditAttrName(contextMenu.key);
								setEditAttrValue(contextMenu.values.join(", "));
								setEditOpen(true);
								closeContextMenu();
							}}
						>
							<svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
									d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
							</svg>
							Edit Attribute
						</button>
						{/* Delete attribute */}
						<button
							className="w-full text-left px-3 py-1.5 hover:bg-red-500/10 transition-colors flex items-center gap-2 text-red-400"
							onClick={() => {
								setEditAttrName(contextMenu.key);
								setEditAttrValue("");
								setEditOpen(true);
								closeContextMenu();
							}}
						>
							<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
									d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
							</svg>
							Delete Attribute
						</button>
						{/* Divider */}
						<div className="my-1 border-t border-slate-700/50" />
						{/* View in Schema */}
						<button
							className="w-full text-left px-3 py-1.5 hover:bg-slate-700/60 transition-colors flex items-center gap-2"
							onClick={() => { router.push(`/schema?attr=${encodeURIComponent(contextMenu.key)}`); closeContextMenu(); }}
						>
							<svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
									d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
							</svg>
							View in Schema
						</button>
					</div>
				)}
			</div>

			{/* Edit Attribute Modal */}
			{selectedNode && (
				<EditAttributeModal
					open={editOpen}
					onClose={() => setEditOpen(false)}
					dn={selectedNode.dn}
					attributeName={editAttrName}
					currentValue={editAttrValue}
					onSaved={() => onAttributeEdited?.()}
				/>
			)}
		</div>
	);
};

export default AttributePanel;
