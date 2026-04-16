'use client'

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { loggedInvoke } from "../utils/loggedInvoke";
import { useRouter } from "next/navigation";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
	SearchParams,
	SearchResponse,
	SearchResultEntry,
	SavedSearch,
} from "../models/SearchModels";

// ═══════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════

const FILTER_PRESETS = [
	{ label: "All Objects", filter: "(objectClass=*)" },
	{ label: "Users (AD)", filter: "(&(objectClass=user)(!(objectClass=computer)))" },
	{ label: "Groups", filter: "(objectClass=group)" },
	{ label: "Computers", filter: "(objectClass=computer)" },
	{ label: "OUs", filter: "(objectClass=organizationalUnit)" },
	{ label: "Persons", filter: "(objectClass=person)" },
	{ label: "inetOrgPerson", filter: "(objectClass=inetOrgPerson)" },
	{ label: "Disabled Accts", filter: "(userAccountControl:1.2.840.113556.1.4.803:=2)" },
	{ label: "Locked Out", filter: "(&(objectClass=user)(lockoutTime>=1))" },
];

const ATTR_PRESETS = [
	{ label: "All (*)", attrs: ["*"] },
	{ label: "User attrs", attrs: ["cn", "sAMAccountName", "displayName", "mail", "memberOf", "userAccountControl", "whenCreated"] },
	{ label: "inetOrgPerson", attrs: ["cn", "sn", "givenName", "mail", "uid", "telephoneNumber", "title", "ou"] },
	{ label: "Group attrs", attrs: ["cn", "member", "description", "groupType", "managedBy"] },
	{ label: "Minimal", attrs: ["cn", "objectClass"] },
];

const SCOPE_OPTIONS = [
	{ value: "base", label: "Base Object", desc: "Only the base entry itself" },
	{ value: "one", label: "One Level", desc: "Direct children of base DN" },
	{ value: "sub", label: "Whole Subtree", desc: "Base DN and all descendants" },
];

const STORAGE_KEY = "directree_saved_searches_v2";

// ═══════════════════════════════════════════════════════════════
//  Local-storage helpers
// ═══════════════════════════════════════════════════════════════

function loadSavedSearches(profileId?: string): SavedSearch[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const all: Record<string, SavedSearch[]> = JSON.parse(raw);
		return all[profileId ?? "__default"] ?? [];
	} catch {
		return [];
	}
}

function persistSavedSearches(searches: SavedSearch[], profileId?: string) {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		const all: Record<string, SavedSearch[]> = raw ? JSON.parse(raw) : {};
		all[profileId ?? "__default"] = searches;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
	} catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════════
//  SearchPage Component
// ═══════════════════════════════════════════════════════════════

export default function SearchPage() {
	const router = useRouter();

	// ─── Connection state ───
	const [connecting, setConnecting] = useState(true);
	const [connError, setConnError] = useState<string | null>(null);
	const [profileName, setProfileName] = useState("");
	const [profileBaseDn, setProfileBaseDn] = useState("");
	const [profileId, setProfileId] = useState<string | undefined>();

	// ─── Form fields ───
	const [searchName, setSearchName] = useState("");
	const [baseDn, setBaseDn] = useState("");
	const [scope, setScope] = useState("sub");
	const [filter, setFilter] = useState("(objectClass=*)");
	const [attrsInput, setAttrsInput] = useState("*");
	const [sizeLimit, setSizeLimit] = useState(1000);
	const [timeLimitSeconds, setTimeLimitSeconds] = useState(0);
	const [includeOperational, setIncludeOperational] = useState(false);

	// ─── Search execution state ───
	const [isSearching, setIsSearching] = useState(false);
	const [searchError, setSearchError] = useState<string | null>(null);
	const [response, setResponse] = useState<SearchResponse | null>(null);

	// ─── Results UI state ───
	const [selectedEntryIdx, setSelectedEntryIdx] = useState<number | null>(null);
	const [resultFilter, setResultFilter] = useState("");
	const [sortColumn, setSortColumn] = useState<string | null>(null);
	const [sortAsc, setSortAsc] = useState(true);
	const [formCollapsed, setFormCollapsed] = useState(false);

	// ─── Saved searches ───
	const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);

	// ─── Copy feedback ───
	const [copiedText, setCopiedText] = useState<string | null>(null);

	// ─── Column chooser ───
	const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());
	const [columnPickerOpen, setColumnPickerOpen] = useState(false);
	const columnPickerRef = useRef<HTMLDivElement>(null);

	// ─── Export feedback ───
	const [exportFeedback, setExportFeedback] = useState<string | null>(null);

	const filterInputRef = useRef<HTMLTextAreaElement>(null);

	// ═══════════════════════════════════════════════════════
	//  Connect on mount
	// ═══════════════════════════════════════════════════════

	useEffect(() => {
		const init = async () => {
			try {
				const raw = localStorage.getItem("activeProfile");
				if (!raw) {
					router.push("/");
					return;
				}
				const profile = JSON.parse(raw);
				setProfileName(profile.name ?? "");
				setProfileBaseDn(profile.baseDn ?? "");
				setProfileId(profile.id);

				// Pre-fill base DN from tree context or profile
				const contextDn = localStorage.getItem("searchContextDn");
				if (contextDn) {
					setBaseDn(contextDn);
					localStorage.removeItem("searchContextDn");
				} else {
					setBaseDn(profile.baseDn ?? "");
				}

				// Reuse existing connection if still alive
				const alreadyConnected = await loggedInvoke<boolean>("is_ldap_connected");
				if (!alreadyConnected) {
					await loggedInvoke("connect_ldap", {
						url: profile.url,
						bindDn: profile.bindDn,
						password: profile.password,
						noTlsVerify: profile.noTlsVerify ?? false,
					});
				}
			} catch (err: unknown) {
				setConnError(err instanceof Error ? err.message : String(err));
			} finally {
				setConnecting(false);
			}
		};
		init();
	}, [router]);

	// Load saved searches when profile is known
	useEffect(() => {
		if (profileId) setSavedSearches(loadSavedSearches(profileId));
	}, [profileId]);

	// ═══════════════════════════════════════════════════════
	//  Build the returning-attributes array
	// ═══════════════════════════════════════════════════════

	const returningAttributes = useMemo(() => {
		const trimmed = attrsInput.trim();
		if (!trimmed || trimmed === "*") {
			return includeOperational ? ["*", "+"] : ["*"];
		}
		const parts = trimmed.split(/[,\s]+/).filter(Boolean);
		if (includeOperational && !parts.includes("+")) parts.push("+");
		return parts;
	}, [attrsInput, includeOperational]);

	// ═══════════════════════════════════════════════════════
	//  Search handler
	// ═══════════════════════════════════════════════════════

	const handleSearch = useCallback(async () => {
		setIsSearching(true);
		setSearchError(null);
		setSelectedEntryIdx(null);
		try {
			const params: SearchParams = {
				baseDn,
				scope,
				filter,
				returningAttributes,
				sizeLimit,
				timeLimitSeconds,
			};
			const res = await loggedInvoke<SearchResponse>("search_ldap", { params });
			setResponse(res);
			if (res.entries.length > 0) setFormCollapsed(true);
		} catch (err: unknown) {
			setSearchError(err instanceof Error ? err.message : String(err));
			setResponse(null);
		} finally {
			setIsSearching(false);
		}
	}, [baseDn, scope, filter, returningAttributes, sizeLimit, timeLimitSeconds]);

	// ═══════════════════════════════════════════════════════
	//  Save / Load / Delete searches
	// ═══════════════════════════════════════════════════════

	const handleSaveSearch = useCallback(() => {
		if (!searchName.trim()) return;
		const newSearch: SavedSearch = {
			id: Date.now().toString(),
			name: searchName.trim(),
			baseDn,
			scope,
			filter,
			returningAttributes: attrsInput.split(/[,\s]+/).filter(Boolean),
			sizeLimit,
			timeLimitSeconds,
		};
		const updated = [...savedSearches, newSearch];
		setSavedSearches(updated);
		persistSavedSearches(updated, profileId);
		setSearchName("");
	}, [searchName, baseDn, scope, filter, attrsInput, sizeLimit, timeLimitSeconds, savedSearches, profileId]);

	const handleLoadSaved = useCallback((s: SavedSearch) => {
		setSearchName(s.name);
		setBaseDn(s.baseDn);
		setScope(s.scope);
		setFilter(s.filter);
		setAttrsInput(s.returningAttributes.join(", "));
		setSizeLimit(s.sizeLimit);
		setTimeLimitSeconds(s.timeLimitSeconds);
		setFormCollapsed(false);
	}, []);

	const handleDeleteSaved = useCallback(
		(id: string) => {
			const updated = savedSearches.filter((s) => s.id !== id);
			setSavedSearches(updated);
			persistSavedSearches(updated, profileId);
		},
		[savedSearches, profileId]
	);

	const handleReset = useCallback(() => {
		setSearchName("");
		setBaseDn(profileBaseDn);
		setScope("sub");
		setFilter("(objectClass=*)");
		setAttrsInput("*");
		setSizeLimit(1000);
		setTimeLimitSeconds(0);
		setIncludeOperational(false);
		setResponse(null);
		setSearchError(null);
		setSelectedEntryIdx(null);
		setFormCollapsed(false);
	}, [profileBaseDn]);

	// ═══════════════════════════════════════════════════════
	//  Filtered + sorted results
	// ═══════════════════════════════════════════════════════

	const filteredEntries = useMemo(() => {
		if (!response) return [];
		let entries = response.entries;
		if (resultFilter.trim()) {
			const lower = resultFilter.toLowerCase();
			entries = entries.filter(
				(e) =>
					e.dn.toLowerCase().includes(lower) ||
					Object.values(e.attributes).some((vals) =>
						vals.some((v) => v.toLowerCase().includes(lower))
					)
			);
		}
		if (sortColumn) {
			entries = [...entries].sort((a, b) => {
				const aVal =
					sortColumn === "__dn"
						? a.dn
						: (a.attributes[sortColumn]?.[0] ?? "");
				const bVal =
					sortColumn === "__dn"
						? b.dn
						: (b.attributes[sortColumn]?.[0] ?? "");
				const cmp = aVal.localeCompare(bVal);
				return sortAsc ? cmp : -cmp;
			});
		}
		return entries;
	}, [response, resultFilter, sortColumn, sortAsc]);

	// Dynamic columns from results
	const attrColumns = useMemo(() => {
		if (!response || response.entries.length === 0) return [];
		const keys = new Set<string>();
		response.entries.forEach((e) =>
			Object.keys(e.attributes).forEach((k) => keys.add(k))
		);
		const priority = [
			"cn", "sAMAccountName", "uid", "objectClass", "description",
			"mail", "displayName", "memberOf", "ou", "sn", "givenName",
		];
		return [...keys].sort((a, b) => {
			const ai = priority.indexOf(a);
			const bi = priority.indexOf(b);
			if (ai >= 0 && bi >= 0) return ai - bi;
			if (ai >= 0) return -1;
			if (bi >= 0) return 1;
			return a.localeCompare(b);
		});
	}, [response]);

	// Auto-select first 8 columns when results change
	useEffect(() => {
		if (attrColumns.length > 0) {
			setVisibleColumns(new Set(attrColumns.slice(0, 8)));
		} else {
			setVisibleColumns(new Set());
		}
	}, [attrColumns]);

	// Displayed columns — intersection of attrColumns with visibleColumns, preserving order
	const displayedColumns = useMemo(
		() => attrColumns.filter((c) => visibleColumns.has(c)),
		[attrColumns, visibleColumns]
	);

	// Close column picker on outside click
	useEffect(() => {
		if (!columnPickerOpen) return;
		const handler = (e: MouseEvent) => {
			if (columnPickerRef.current && !columnPickerRef.current.contains(e.target as Node)) {
				setColumnPickerOpen(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [columnPickerOpen]);

	const selectedEntry: SearchResultEntry | null = useMemo(() => {
		if (selectedEntryIdx === null || !filteredEntries[selectedEntryIdx])
			return null;
		return filteredEntries[selectedEntryIdx];
	}, [selectedEntryIdx, filteredEntries]);

	// ═══════════════════════════════════════════════════════
	//  Clipboard helper
	// ═══════════════════════════════════════════════════════

	const copyToClipboard = useCallback(async (text: string) => {
		try {
			await writeText(text);
			setCopiedText(text);
			setTimeout(() => setCopiedText(null), 1500);
		} catch { /* ignore */ }
	}, []);

	// ═══════════════════════════════════════════════════════
	//  Navigate to tree with DN
	// ═══════════════════════════════════════════════════════

	const openInTree = useCallback(
		(dn: string) => {
			localStorage.setItem("navigateToDn", dn);
			router.push("/tree");
		},
		[router]
	);

	// Column sort handler
	const handleSort = useCallback(
		(col: string) => {
			if (sortColumn === col) {
				setSortAsc(!sortAsc);
			} else {
				setSortColumn(col);
				setSortAsc(true);
			}
		},
		[sortColumn, sortAsc]
	);

	// ═══════════════════════════════════════════════════════
	//  Export helpers
	// ═══════════════════════════════════════════════════════

	const triggerDownload = useCallback((content: string, filename: string, mime: string) => {
		const blob = new Blob([content], { type: mime });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}, []);

	const handleExportCSV = useCallback(() => {
		if (!filteredEntries.length) return;
		const cols = displayedColumns;
		const escapeCSV = (v: string) => {
			if (v.includes(",") || v.includes('"') || v.includes("\n")) {
				return '"' + v.replace(/"/g, '""') + '"';
			}
			return v;
		};
		const header = ["DN", ...cols].map(escapeCSV).join(",");
		const rows = filteredEntries.map((e) =>
			[e.dn, ...cols.map((c) => e.attributes[c]?.join("; ") ?? "")]
				.map(escapeCSV)
				.join(",")
		);
		const csv = [header, ...rows].join("\n");
		triggerDownload(csv, `ldap-search-${Date.now()}.csv`, "text/csv;charset=utf-8");
		setExportFeedback("csv");
		setTimeout(() => setExportFeedback(null), 1500);
	}, [filteredEntries, displayedColumns, triggerDownload]);

	const handleExportJSON = useCallback(() => {
		if (!filteredEntries.length) return;
		const data = filteredEntries.map((e) => ({
			dn: e.dn,
			attributes: e.attributes,
		}));
		const json = JSON.stringify(data, null, 2);
		triggerDownload(json, `ldap-search-${Date.now()}.json`, "application/json");
		setExportFeedback("json");
		setTimeout(() => setExportFeedback(null), 1500);
	}, [filteredEntries, triggerDownload]);

	// ═══════════════════════════════════════════════════════
	//  Column chooser toggle
	// ═══════════════════════════════════════════════════════

	const toggleColumn = useCallback((col: string) => {
		setVisibleColumns((prev) => {
			const next = new Set(prev);
			if (next.has(col)) next.delete(col);
			else next.add(col);
			return next;
		});
	}, []);

	const selectAllColumns = useCallback(() => {
		setVisibleColumns(new Set(attrColumns));
	}, [attrColumns]);

	const selectNoneColumns = useCallback(() => {
		setVisibleColumns(new Set());
	}, []);

	// ═══════════════════════════════════════════════════════
	//  Keyboard shortcut: Ctrl+Enter to search
	// ═══════════════════════════════════════════════════════

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (
				e.key === "Enter" &&
				(e.ctrlKey || e.metaKey) &&
				!isSearching &&
				baseDn.trim()
			) {
				e.preventDefault();
				handleSearch();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [handleSearch, isSearching, baseDn]);

	// ═══════════════════════════════════════════════════════
	//  Loading / Error guards
	// ═══════════════════════════════════════════════════════

	if (connecting) {
		return (
			<main className="h-screen w-screen bg-slate-900 flex items-center justify-center">
				<div className="flex flex-col items-center gap-4 text-slate-400">
					<div className="w-10 h-10 border-2 border-slate-600 border-t-blue-400 rounded-full animate-spin" />
					<p className="text-sm">Connecting…</p>
				</div>
			</main>
		);
	}

	if (connError) {
		return (
			<main className="h-screen w-screen bg-slate-900 flex items-center justify-center">
				<div className="flex flex-col items-center gap-4 max-w-md px-6">
					<div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center">
						<svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
						</svg>
					</div>
					<h2 className="text-lg font-semibold text-slate-200">Connection Failed</h2>
					<p className="text-sm text-red-400 text-center font-mono bg-red-500/10 border border-red-500/20 rounded-lg p-3 w-full break-all">
						{connError}
					</p>
					<button
						onClick={() => router.push("/")}
						className="mt-2 px-6 py-2.5 rounded-lg text-sm font-medium bg-slate-700 text-slate-200 border border-slate-600 hover:bg-slate-600 transition-colors"
					>
						&larr; Back to Profiles
					</button>
				</div>
			</main>
		);
	}

	// ═══════════════════════════════════════════════════════
	//  Main Render
	// ═══════════════════════════════════════════════════════

	return (
		<div className="flex flex-col h-screen w-screen bg-slate-900 text-slate-100">

			{/* ─── Top Header ─── */}
			<header className="px-4 py-2.5 border-b border-slate-700/50 bg-slate-800/60 flex items-center gap-3 flex-shrink-0">
				<button
					onClick={() => router.push("/tree")}
					className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-700/40 text-slate-400 border border-slate-600/30
						hover:bg-slate-600/50 hover:text-slate-200 transition-all flex items-center gap-1.5"
				>
					<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
					</svg>
					Tree
				</button>

				<div className="flex items-center gap-2">
					<svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
							d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
					</svg>
					<h1 className="text-sm font-semibold text-slate-200">LDAP Search</h1>
				</div>

				<div className="flex-1" />

				<span className="text-[10px] text-slate-600">Ctrl+Enter to search</span>

				{profileName && (
					<span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-1 rounded-md border border-slate-700/40">
						{profileName}
					</span>
				)}
			</header>

			{/* ─── Body ─── */}
			<div className="flex flex-1 min-h-0">

				{/* ─── Left Sidebar: Saved Searches ─── */}
				<aside className="w-56 h-full flex flex-col border-r border-slate-700/50 bg-slate-900 flex-shrink-0">
					<div className="px-3 py-2.5 border-b border-slate-700/50 bg-slate-800/40 flex items-center gap-2">
						<svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
								d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
						</svg>
						<span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex-1">
							Saved Searches
						</span>
						<span className="text-[10px] text-slate-600">{savedSearches.length}</span>
					</div>

					<div className="flex-1 overflow-y-auto custom-scrollbar">
						{savedSearches.length === 0 ? (
							<div className="px-3 py-8 text-center">
								<svg className="w-8 h-8 mx-auto text-slate-700 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
										d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
								</svg>
								<p className="text-[10px] text-slate-600">No saved searches yet</p>
								<p className="text-[10px] text-slate-700 mt-1">Name a search &amp; click Save</p>
							</div>
						) : (
							<div className="py-1">
								{savedSearches.map((s) => (
									<div
										key={s.id}
										className="group flex items-center gap-1 px-2 py-1.5 mx-1 rounded-md
											hover:bg-slate-800/60 transition-colors cursor-pointer"
										onClick={() => handleLoadSaved(s)}
									>
										<div className="flex-1 min-w-0">
											<p className="text-xs text-slate-300 truncate font-medium">{s.name}</p>
											<p className="text-[10px] text-slate-600 truncate font-mono">{s.filter}</p>
										</div>
										<button
											onClick={(e) => {
												e.stopPropagation();
												handleDeleteSaved(s.id);
											}}
											className="p-0.5 text-slate-700 hover:text-red-400
												opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
										>
											<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
											</svg>
										</button>
									</div>
								))}
							</div>
						)}
					</div>
				</aside>

				{/* ─── Main Content ─── */}
				<main className="flex-1 flex flex-col min-w-0 min-h-0">

					{/* ─── Search Form ─── */}
					<div
						className={`border-b border-slate-700/50 flex-shrink-0 transition-all duration-300 overflow-hidden
							${formCollapsed ? "max-h-0" : "max-h-[600px]"}`}
					>
						<div className="px-5 py-4 space-y-3">

							{/* Row 1: Search Name + Base DN */}
							<div className="flex gap-3">
								<div className="w-48 flex-shrink-0">
									<label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1 block">
										Search Name
									</label>
									<input
										value={searchName}
										onChange={(e) => setSearchName(e.target.value)}
										placeholder="My search…"
										className="w-full text-xs px-3 py-1.5 rounded-md bg-slate-800 border border-slate-700/50
											text-slate-200 placeholder-slate-600
											focus:border-blue-500/50 focus:outline-none transition-all"
									/>
								</div>
								<div className="flex-1 min-w-0">
									<label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1 block">
										Base DN
									</label>
									<div className="flex gap-1.5">
										<input
											value={baseDn}
											onChange={(e) => setBaseDn(e.target.value)}
											placeholder="dc=example,dc=com"
											className="flex-1 text-xs px-3 py-1.5 rounded-md bg-slate-800 border border-slate-700/50
												text-slate-200 placeholder-slate-500 font-mono
												focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20
												focus:outline-none transition-all"
										/>
										<button
											onClick={() => setBaseDn(profileBaseDn)}
											title="Use profile base DN"
											className="text-[10px] px-2 py-1 rounded-md bg-blue-500/10 text-blue-400
												border border-blue-500/20 hover:bg-blue-500/20 transition-all whitespace-nowrap"
										>
											Profile DN
										</button>
									</div>
								</div>
							</div>

							{/* Row 2: Filter with presets */}
							<div>
								<div className="flex items-center justify-between mb-1">
									<label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
										LDAP Filter
									</label>
									<div className="flex gap-1 flex-wrap">
										{FILTER_PRESETS.map((p) => (
											<button
												key={p.label}
												onClick={() => setFilter(p.filter)}
												className={`text-[10px] px-1.5 py-0.5 rounded border transition-all
													${filter === p.filter
														? "bg-blue-500/20 text-blue-300 border-blue-500/40"
														: "bg-slate-800/60 text-slate-500 border-slate-700/40 hover:text-slate-300 hover:border-slate-600/60"
													}`}
											>
												{p.label}
											</button>
										))}
									</div>
								</div>
								<textarea
									ref={filterInputRef}
									value={filter}
									onChange={(e) => setFilter(e.target.value)}
									placeholder="(objectClass=*)"
									rows={2}
									className="w-full text-xs px-3 py-1.5 rounded-md bg-slate-800 border border-slate-700/50
										text-slate-200 placeholder-slate-500 font-mono
										focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20
										focus:outline-none transition-all resize-y min-h-[32px]"
								/>
							</div>

							{/* Row 3: Returning Attributes with presets */}
							<div>
								<div className="flex items-center justify-between mb-1">
									<label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
										Returning Attributes
									</label>
									<div className="flex gap-1 flex-wrap">
										{ATTR_PRESETS.map((p) => (
											<button
												key={p.label}
												onClick={() => setAttrsInput(p.attrs.join(", "))}
												className={`text-[10px] px-1.5 py-0.5 rounded border transition-all
													${attrsInput === p.attrs.join(", ")
														? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
														: "bg-slate-800/60 text-slate-500 border-slate-700/40 hover:text-slate-300 hover:border-slate-600/60"
													}`}
											>
												{p.label}
											</button>
										))}
									</div>
								</div>
								<input
									value={attrsInput}
									onChange={(e) => setAttrsInput(e.target.value)}
									placeholder="* (all user attributes)"
									className="w-full text-xs px-3 py-1.5 rounded-md bg-slate-800 border border-slate-700/50
										text-slate-200 placeholder-slate-500 font-mono
										focus:border-blue-500/50 focus:outline-none transition-all"
								/>
							</div>

							{/* Row 4: Scope · Limits · Options · Actions */}
							<div className="flex gap-4 items-end flex-wrap">
								{/* Scope selector */}
								<div>
									<label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5 block">
										Scope
									</label>
									<div className="flex gap-0.5 bg-slate-800/80 rounded-lg p-0.5 border border-slate-700/40">
										{SCOPE_OPTIONS.map((o) => (
											<button
												key={o.value}
												onClick={() => setScope(o.value)}
												title={o.desc}
												className={`text-[10px] px-2.5 py-1 rounded-md transition-all font-medium
													${scope === o.value
														? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
														: "text-slate-500 hover:text-slate-300 border border-transparent"
													}`}
											>
												{o.label}
											</button>
										))}
									</div>
								</div>

								{/* Count Limit */}
								<div className="w-24">
									<label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1 block">
										Count Limit
									</label>
									<input
										type="number"
										value={sizeLimit}
										onChange={(e) => setSizeLimit(Math.max(0, parseInt(e.target.value) || 0))}
										className="w-full text-xs px-2.5 py-1.5 rounded-md bg-slate-800 border border-slate-700/50
											text-slate-200 focus:border-blue-500/50 focus:outline-none transition-all"
									/>
								</div>

								{/* Time Limit */}
								<div className="w-24">
									<label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1 block">
										Time (sec)
									</label>
									<input
										type="number"
										value={timeLimitSeconds}
										onChange={(e) =>
											setTimeLimitSeconds(Math.max(0, parseInt(e.target.value) || 0))
										}
										className="w-full text-xs px-2.5 py-1.5 rounded-md bg-slate-800 border border-slate-700/50
											text-slate-200 focus:border-blue-500/50 focus:outline-none transition-all"
									/>
								</div>

								{/* Operational attributes toggle */}
								<label className="flex items-center gap-1.5 cursor-pointer select-none pb-1">
									<input
										type="checkbox"
										checked={includeOperational}
										onChange={(e) => setIncludeOperational(e.target.checked)}
										className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800
											text-blue-500 focus:ring-blue-500/20 accent-blue-500"
									/>
									<span className="text-[10px] text-slate-400 font-medium">
										Include operational attrs
									</span>
								</label>

								<div className="flex-1" />

								{/* Action buttons */}
								<div className="flex gap-2">
									<button
										onClick={handleSaveSearch}
										disabled={!searchName.trim()}
										className="text-[10px] px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400
											border border-emerald-500/20 hover:bg-emerald-500/20
											disabled:opacity-30 transition-all font-medium"
									>
										Save
									</button>
									<button
										onClick={handleReset}
										className="text-[10px] px-3 py-1.5 rounded-lg bg-slate-700/40 text-slate-400
											border border-slate-600/30 hover:bg-slate-600/50 hover:text-slate-200
											transition-all font-medium"
									>
										Reset
									</button>
									<button
										onClick={handleSearch}
										disabled={isSearching || !baseDn.trim()}
										className="px-4 py-1.5 text-xs font-semibold rounded-lg
											bg-blue-500/20 text-blue-300 border border-blue-500/30
											hover:bg-blue-500/30 hover:border-blue-500/50
											disabled:opacity-40 disabled:cursor-not-allowed
											transition-all flex items-center gap-1.5"
									>
										{isSearching ? (
											<>
												<div className="w-3 h-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
												Searching…
											</>
										) : (
											<>
												<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
														d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
												</svg>
												Search
											</>
										)}
									</button>
								</div>
							</div>
						</div>
					</div>

					{/* ─── Collapse toggle ─── */}
					{response && (
						<button
							onClick={() => setFormCollapsed(!formCollapsed)}
							className="px-4 py-1 border-b border-slate-700/50 bg-slate-800/30
								text-[10px] text-slate-500 hover:text-slate-300
								transition-all flex items-center gap-1 flex-shrink-0"
						>
							<svg
								className={`w-3 h-3 transition-transform ${formCollapsed ? "" : "rotate-180"}`}
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
							</svg>
							{formCollapsed ? "Show Search Form" : "Collapse Search Form"}
						</button>
					)}

					{/* ─── Results Area ─── */}
					<div className="flex-1 flex flex-col min-h-0">

						{/* Results header bar */}
						<div className="px-4 py-2 border-b border-slate-700/50 bg-slate-800/40 flex items-center gap-2 flex-shrink-0">
							<span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
								{response
									? `${filteredEntries.length}${filteredEntries.length !== response.entryCount ? ` / ${response.entryCount}` : ""} result${response.entryCount !== 1 ? "s" : ""}`
									: "Results"}
							</span>
							{response?.truncated && (
								<span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1"
									title={`Size limit (${sizeLimit}) reached — results may be incomplete`}
								>
									<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
											d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
									</svg>
									Truncated — limit {sizeLimit}
								</span>
							)}
							{response?.warnings.map((w, i) => (
								<span key={i} className="text-[10px] text-amber-400 truncate">
									{w}
								</span>
							))}
							<div className="flex-1" />

							{/* Export + Column chooser controls */}
							{response && response.entries.length > 0 && (
								<div className="flex items-center gap-1.5">
									{/* Column chooser */}
									<div className="relative" ref={columnPickerRef}>
										<button
											onClick={() => setColumnPickerOpen(!columnPickerOpen)}
											className={`text-[10px] px-2 py-1 rounded-md border transition-all flex items-center gap-1
												${columnPickerOpen
													? "bg-blue-500/20 text-blue-300 border-blue-500/40"
													: "bg-slate-700/40 text-slate-400 border-slate-600/30 hover:bg-slate-600/50 hover:text-slate-200"
												}`}
											title="Choose visible columns"
										>
											<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
													d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
											</svg>
											Columns ({visibleColumns.size}/{attrColumns.length})
										</button>

										{/* Column picker dropdown */}
										{columnPickerOpen && attrColumns.length > 0 && (
											<div className="absolute right-0 top-full mt-1 z-50 w-56 max-h-64 overflow-auto custom-scrollbar
												bg-slate-800 border border-slate-700/60 rounded-lg shadow-xl shadow-black/40 py-1">
												{/* All / None buttons */}
												<div className="px-2 py-1 flex gap-1 border-b border-slate-700/50">
													<button onClick={selectAllColumns}
														className="text-[10px] px-2 py-0.5 rounded bg-slate-700/60 text-slate-300 hover:bg-slate-600 transition-colors">
														All
													</button>
													<button onClick={selectNoneColumns}
														className="text-[10px] px-2 py-0.5 rounded bg-slate-700/60 text-slate-300 hover:bg-slate-600 transition-colors">
														None
													</button>
												</div>
												{attrColumns.map((col) => (
													<label key={col}
														className="flex items-center gap-2 px-2 py-1 hover:bg-slate-700/50 cursor-pointer transition-colors"
													>
														<input
															type="checkbox"
															checked={visibleColumns.has(col)}
															onChange={() => toggleColumn(col)}
															className="w-3 h-3 rounded border-slate-600 bg-slate-900
																text-blue-500 accent-blue-500"
														/>
														<span className="text-[10px] text-slate-300 truncate font-mono">{col}</span>
													</label>
												))}
											</div>
										)}
									</div>

									{/* Export CSV */}
									<button
										onClick={handleExportCSV}
										className={`text-[10px] px-2 py-1 rounded-md border transition-all flex items-center gap-1
											${exportFeedback === "csv"
												? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
												: "bg-slate-700/40 text-slate-400 border-slate-600/30 hover:bg-slate-600/50 hover:text-slate-200"
											}`}
										title="Download results as CSV"
									>
										<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
												d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
										</svg>
										{exportFeedback === "csv" ? "Saved!" : "CSV"}
									</button>

									{/* Export JSON */}
									<button
										onClick={handleExportJSON}
										className={`text-[10px] px-2 py-1 rounded-md border transition-all flex items-center gap-1
											${exportFeedback === "json"
												? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
												: "bg-slate-700/40 text-slate-400 border-slate-600/30 hover:bg-slate-600/50 hover:text-slate-200"
											}`}
										title="Download results as JSON"
									>
										<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
												d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
										</svg>
										{exportFeedback === "json" ? "Saved!" : "JSON"}
									</button>

									{/* Divider */}
									<div className="w-px h-4 bg-slate-700/60" />

									{/* Result filter */}
									<div className="relative">
										<svg
											className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
												d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
										</svg>
										<input
											value={resultFilter}
											onChange={(e) => setResultFilter(e.target.value)}
											placeholder="Filter results…"
											className="text-[10px] pl-6 pr-2 py-1 rounded-md bg-slate-800 border border-slate-700/50
												text-slate-300 placeholder-slate-600
												focus:border-blue-500/50 focus:outline-none transition-all w-44"
										/>
									</div>
								</div>
							)}
						</div>

						{/* Error banner */}
						{searchError && (
							<div className="px-4 py-3 flex-shrink-0">
								<div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 font-mono break-all">
									{searchError}
								</div>
							</div>
						)}

						{/* Results table + details — horizontal split */}
						<div className="flex-1 flex min-h-0">

							{/* Left: Results table */}
							<div className="flex-1 overflow-auto custom-scrollbar min-h-0 min-w-0">
							{filteredEntries.length > 0 ? (
								<table className="w-full text-xs">
									<thead className="sticky top-0 z-10">
										<tr>
											<th
												onClick={() => handleSort("__dn")}
												className="text-left px-3 py-2 text-[10px] font-semibold text-slate-400
													uppercase tracking-wider border-b border-slate-700/50 whitespace-nowrap
													cursor-pointer hover:text-slate-200 transition-colors select-none bg-slate-800"
											>
												DN {sortColumn === "__dn" && (sortAsc ? "↑" : "↓")}
											</th>
											{displayedColumns.map((col) => (
												<th
													key={col}
													onClick={() => handleSort(col)}
													className="text-left px-3 py-2 text-[10px] font-semibold text-slate-400
														uppercase tracking-wider border-b border-slate-700/50 whitespace-nowrap
														cursor-pointer hover:text-slate-200 transition-colors select-none bg-slate-800"
												>
													{col} {sortColumn === col && (sortAsc ? "↑" : "↓")}
												</th>
											))}
										</tr>
									</thead>
									<tbody>
										{filteredEntries.map((entry, idx) => (
											<tr
												key={entry.dn}
												className={`cursor-pointer transition-colors
													${selectedEntryIdx === idx
														? "bg-blue-500/15 border-l-2 border-l-blue-400"
														: idx % 2 === 0
															? "bg-transparent border-l-2 border-l-transparent"
															: "bg-slate-800/30 border-l-2 border-l-transparent"
													}
													hover:bg-slate-700/50`}
												onClick={() => setSelectedEntryIdx(idx)}
												onDoubleClick={() => openInTree(entry.dn)}
											>
												<td
													className="px-3 py-1.5 font-mono text-slate-300 whitespace-nowrap max-w-[350px] truncate"
													title={entry.dn}
												>
													{entry.dn}
												</td>
												{displayedColumns.map((col) => (
													<td
														key={col}
														className="px-3 py-1.5 text-slate-400 whitespace-nowrap max-w-[200px] truncate"
														title={entry.attributes[col]?.join(", ") ?? ""}
													>
														{entry.attributes[col]?.join(", ") ?? ""}
													</td>
												))}
											</tr>
										))}
									</tbody>
								</table>
							) : !searchError && !isSearching && !response ? (
								<div className="flex items-center justify-center h-full text-slate-500">
									<div className="flex flex-col items-center gap-3 text-center px-6">
										<svg className="w-14 h-14 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
												d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
										</svg>
										<p className="text-xs font-medium">Configure search parameters above</p>
										<p className="text-[10px] text-slate-600">
											Press <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 text-[9px]">Ctrl+Enter</kbd> to search
										</p>
									</div>
								</div>
							) : response && response.entries.length === 0 ? (
								<div className="flex items-center justify-center h-full text-slate-500">
									<div className="flex flex-col items-center gap-2 text-center">
										<svg className="w-10 h-10 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
												d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
										</svg>
										<p className="text-xs font-medium">No matching entries found</p>
										<p className="text-[10px] text-slate-600">Try adjusting your filter or base DN</p>
									</div>
								</div>
							) : null}
							</div>

							{/* ─── Details Panel (right side) ─── */}
							{selectedEntry && (
								<div className="border-l border-slate-700/50 flex-shrink-0 bg-slate-800/30 overflow-hidden"
									style={{ width: 370 }}
								>
									<div className="h-full flex flex-col">
										{/* Details header */}
										<div className="px-3 py-2 border-b border-slate-700/30 flex items-center gap-2 flex-shrink-0">
											<svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
													d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
											</svg>
											<span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
												Entry Details
											</span>
											<div className="flex-1" />

											<button
												onClick={() => copyToClipboard(selectedEntry.dn)}
												className={`text-[10px] px-2 py-0.5 rounded border transition-all
													${copiedText === selectedEntry.dn
														? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
														: "bg-slate-700/40 text-slate-400 border-slate-600/30 hover:bg-slate-600/50 hover:text-slate-200"
													}`}
											>
												{copiedText === selectedEntry.dn ? "Copied!" : "Copy DN"}
											</button>
											<button
												onClick={() => openInTree(selectedEntry.dn)}
												className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400
													border border-blue-500/20 hover:bg-blue-500/20 transition-all"
											>
												Open in Tree
											</button>
										</div>

										{/* Details content */}
										<div className="flex-1 overflow-auto custom-scrollbar px-3 py-2">
											<p className="text-[10px] text-slate-500 mb-2 font-mono break-all select-all">
												{selectedEntry.dn}
											</p>
											<div className="space-y-0.5">
												{Object.entries(selectedEntry.attributes)
													.sort(([a], [b]) => a.localeCompare(b))
													.map(([key, values]) => (
														<div
															key={key}
															className="flex gap-2 text-xs py-0.5 hover:bg-slate-700/30 rounded px-1 -mx-1 group"
														>
															<span
																className="text-blue-400 font-medium w-32 flex-shrink-0 truncate"
																title={key}
															>
																{key}
															</span>
															<span className="text-slate-300 font-mono break-all flex-1 min-w-0 text-[10px]">
																{values.length === 1
																	? values[0]
																	: values.map((v, i) => (
																		<span key={i}>
																			{i > 0 && <span className="text-slate-600"> | </span>}
																			{v}
																		</span>
																	))}
															</span>
															<button
																onClick={() => copyToClipboard(values.join(", "))}
																className="p-0.5 text-slate-700 hover:text-slate-300
																	opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
															>
																<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																	<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
																		d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
																</svg>
															</button>
														</div>
													))}
											</div>
										</div>
									</div>
								</div>
							)}
						</div>
					</div>
				</main>
			</div>
		</div>
	);
}
