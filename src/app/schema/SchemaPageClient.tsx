'use client'

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { loggedInvoke } from "../utils/loggedInvoke";
import { useRouter, useSearchParams } from "next/navigation";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
	SchemaBundle,
	ObjectClassDef,
	AttributeTypeDef,
	MatchingRuleDef,
} from "../models/SchemaTypes";

// ═══════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════

type SchemaTab = "objectClasses" | "attributeTypes" | "matchingRules";
type PageMode = "viewer" | "search";
type SelectedItem =
	| { tab: "objectClasses"; item: ObjectClassDef }
	| { tab: "attributeTypes"; item: AttributeTypeDef }
	| { tab: "matchingRules"; item: MatchingRuleDef }
	| null;

const TAB_META: { key: SchemaTab; label: string; icon: string }[] = [
	{ key: "objectClasses", label: "Object Classes", icon: "🔷" },
	{ key: "attributeTypes", label: "Attribute Types", icon: "📝" },
	{ key: "matchingRules", label: "Matching Rules", icon: "⚖️" },
];

const CACHE_KEY = "directree_schema_cache";

// ═══════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════

function primaryName(names: string[]): string {
	return names[0] ?? "(unnamed)";
}

function highlightMatch(text: string, query: string): React.ReactNode {
	if (!query) return text;
	const idx = text.toLowerCase().indexOf(query.toLowerCase());
	if (idx === -1) return text;
	return (
		<>
			{text.slice(0, idx)}
			<mark className="bg-amber-500/30 text-amber-200 rounded-sm px-0.5">{text.slice(idx, idx + query.length)}</mark>
			{text.slice(idx + query.length)}
		</>
	);
}

// ═══════════════════════════════════════════════════════════════
//  Client Component
// ═══════════════════════════════════════════════════════════════

export default function SchemaPageClient() {
	const router = useRouter();
	const searchParams = useSearchParams();

	// Loading / error
	const [schema, setSchema] = useState<SchemaBundle | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// UI state
	const [activeTab, setActiveTab] = useState<SchemaTab>("objectClasses");
	const [mode, setMode] = useState<PageMode>("viewer");
	const [filterText, setFilterText] = useState("");
	const [selected, setSelected] = useState<SelectedItem>(null);
	const [copied, setCopied] = useState(false);

	// Search-mode fields
	const [searchField, setSearchField] = useState<"name" | "oid" | "desc" | "must_may">("name");
	const [searchQuery, setSearchQuery] = useState("");
	const [searchTab, setSearchTab] = useState<SchemaTab>("objectClasses");

	const filterRef = useRef<HTMLInputElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);

	// ─── Profile / cache ───
	const profileId = useMemo(() => {
		try {
			const raw = localStorage.getItem("activeProfile");
			return raw ? JSON.parse(raw).id ?? "__default" : "__default";
		} catch { return "__default"; }
	}, []);

	// ─── Fetch schema ───
	const fetchSchema = useCallback(async (force = false) => {
		setIsLoading(true);
		setError(null);

		// Try cache first (unless forced)
		if (!force) {
			try {
				const cached = localStorage.getItem(`${CACHE_KEY}_${profileId}`);
				if (cached) {
					const parsed = JSON.parse(cached) as SchemaBundle;
					if (parsed.objectClasses?.length > 0) {
						setSchema(parsed);
						setIsLoading(false);
						return;
					}
				}
			} catch { /* cache miss */ }
		}

		try {
			const bundle = await loggedInvoke<SchemaBundle>("fetch_schema");
			setSchema(bundle);
			// Cache locally
			try { localStorage.setItem(`${CACHE_KEY}_${profileId}`, JSON.stringify(bundle)); } catch { /* quota */ }
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			setError(msg);
		} finally {
			setIsLoading(false);
		}
	}, [profileId]);

	useEffect(() => { fetchSchema(); }, [fetchSchema]);

	// ─── URL-driven focus ───
	useEffect(() => {
		if (!schema) return;
		const focusAttr = searchParams.get("attr");
		const focusOc = searchParams.get("oc");
		if (focusAttr) {
			const found = schema.attributeTypes.find(a =>
				a.names.some(n => n.toLowerCase() === focusAttr.toLowerCase())
			);
			if (found) {
				setActiveTab("attributeTypes");
				setSelected({ tab: "attributeTypes", item: found });
				setFilterText(primaryName(found.names));
			}
		} else if (focusOc) {
			const found = schema.objectClasses.find(o =>
				o.names.some(n => n.toLowerCase() === focusOc.toLowerCase())
			);
			if (found) {
				setActiveTab("objectClasses");
				setSelected({ tab: "objectClasses", item: found });
				setFilterText(primaryName(found.names));
			}
		}
	}, [schema, searchParams]);

	// ─── Filtered lists ───
	const filteredObjectClasses = useMemo(() => {
		if (!schema) return [];
		const q = filterText.toLowerCase();
		return schema.objectClasses
			.filter(oc => !q || oc.names.some(n => n.toLowerCase().includes(q)) || oc.oid.includes(q))
			.sort((a, b) => primaryName(a.names).localeCompare(primaryName(b.names)));
	}, [schema, filterText]);

	const filteredAttributeTypes = useMemo(() => {
		if (!schema) return [];
		const q = filterText.toLowerCase();
		return schema.attributeTypes
			.filter(at => !q || at.names.some(n => n.toLowerCase().includes(q)) || at.oid.includes(q))
			.sort((a, b) => primaryName(a.names).localeCompare(primaryName(b.names)));
	}, [schema, filterText]);

	const filteredMatchingRules = useMemo(() => {
		if (!schema) return [];
		const q = filterText.toLowerCase();
		return schema.matchingRules
			.filter(mr => !q || mr.names.some(n => n.toLowerCase().includes(q)) || mr.oid.includes(q))
			.sort((a, b) => primaryName(a.names).localeCompare(primaryName(b.names)));
	}, [schema, filterText]);

	// ─── Search-mode results ───
	const searchResults = useMemo(() => {
		if (!schema || !searchQuery.trim()) return [];
		const q = searchQuery.toLowerCase();
		type SearchResult = { type: SchemaTab; name: string; oid: string; matchText: string; item: ObjectClassDef | AttributeTypeDef | MatchingRuleDef };
		const results: SearchResult[] = [];

		const matchInList = (items: { names: string[]; oid: string; description: string; raw: string }[], type_: SchemaTab) => {
			for (const item of items) {
				let matchText = "";
				switch (searchField) {
					case "name":
						if (item.names.some(n => n.toLowerCase().includes(q))) matchText = item.names.join(", ");
						break;
					case "oid":
						if (item.oid.includes(q)) matchText = item.oid;
						break;
					case "desc":
						if (item.description.toLowerCase().includes(q)) matchText = item.description;
						break;
					case "must_may":
						if (type_ === "objectClasses") {
							const oc = item as unknown as ObjectClassDef;
							const allAttrs = [...oc.must, ...oc.may];
							if (allAttrs.some(a => a.toLowerCase().includes(q))) {
								matchText = `MUST/MAY: ${allAttrs.filter(a => a.toLowerCase().includes(q)).join(", ")}`;
							}
						}
						break;
				}
				if (matchText) {
					results.push({
						type: type_,
						name: primaryName(item.names),
						oid: item.oid,
						matchText,
						item: item as ObjectClassDef | AttributeTypeDef | MatchingRuleDef,
					});
				}
			}
		};

		if (searchTab === "objectClasses" || searchTab === "attributeTypes" || searchTab === "matchingRules") {
			if (searchTab === "objectClasses") matchInList(schema.objectClasses, "objectClasses");
			else if (searchTab === "attributeTypes") matchInList(schema.attributeTypes, "attributeTypes");
			else matchInList(schema.matchingRules, "matchingRules");
		}

		return results.slice(0, 200); // cap at 200
	}, [schema, searchQuery, searchField, searchTab]);

	// ─── Copy raw ───
	const handleCopyRaw = useCallback(async () => {
		if (!selected) return;
		try {
			await writeText(selected.item.raw);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch { /* ignore */ }
	}, [selected]);

	// ─── Navigate to attribute / objectClass in schema ───
	const focusItem = useCallback((tab: SchemaTab, name: string) => {
		if (!schema) return;
		if (tab === "objectClasses") {
			const found = schema.objectClasses.find(o => o.names.some(n => n.toLowerCase() === name.toLowerCase()));
			if (found) { setActiveTab("objectClasses"); setSelected({ tab: "objectClasses", item: found }); setFilterText(primaryName(found.names)); setMode("viewer"); }
		} else if (tab === "attributeTypes") {
			const found = schema.attributeTypes.find(a => a.names.some(n => n.toLowerCase() === name.toLowerCase()));
			if (found) { setActiveTab("attributeTypes"); setSelected({ tab: "attributeTypes", item: found }); setFilterText(primaryName(found.names)); setMode("viewer"); }
		} else {
			const found = schema.matchingRules.find(m => m.names.some(n => n.toLowerCase() === name.toLowerCase()));
			if (found) { setActiveTab("matchingRules"); setSelected({ tab: "matchingRules", item: found }); setFilterText(primaryName(found.names)); setMode("viewer"); }
		}
	}, [schema]);

	// ─── Keyboard ───
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.ctrlKey && e.key === "f") {
				e.preventDefault();
				if (mode === "viewer") filterRef.current?.focus();
				else searchRef.current?.focus();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [mode]);

	// ═══════════════════════════════════════════════════════════════
	//  Render: Loading
	// ═══════════════════════════════════════════════════════════════

	if (isLoading) {
		return (
			<main className="h-screen w-screen overflow-hidden bg-slate-900 flex items-center justify-center">
				<div className="flex flex-col items-center gap-4 text-slate-400">
					<div className="w-10 h-10 border-2 border-slate-600 border-t-purple-400 rounded-full animate-spin" />
					<p className="text-sm">Loading LDAP schema…</p>
				</div>
			</main>
		);
	}

	// ═══════════════════════════════════════════════════════════════
	//  Render: Error
	// ═══════════════════════════════════════════════════════════════

	if (error && !schema) {
		return (
			<main className="h-screen w-screen overflow-hidden bg-slate-900 flex items-center justify-center">
				<div className="flex flex-col items-center gap-4 max-w-md px-6">
					<div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center">
						<svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
						</svg>
					</div>
					<h2 className="text-lg font-semibold text-slate-200">Schema Not Available</h2>
					<p className="text-sm text-red-400 text-center font-mono bg-red-500/10 border border-red-500/20 rounded-lg p-3 w-full break-all">
						{error}
					</p>
					<p className="text-xs text-slate-500 text-center">
						The server may not expose schema information, or your account may lack read access to the subschemaSubentry.
					</p>
					<div className="flex gap-3">
						<button onClick={() => router.push("/tree")}
							className="mt-2 px-5 py-2 rounded-lg text-sm font-medium bg-slate-700 text-slate-200 border border-slate-600 hover:bg-slate-600 transition-colors">
							← Back to Tree
						</button>
						<button onClick={() => fetchSchema(true)}
							className="mt-2 px-5 py-2 rounded-lg text-sm font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition-colors">
							Retry
						</button>
					</div>
				</div>
			</main>
		);
	}

	// Stats
	const stats = schema ? {
		oc: schema.objectClasses.length,
		at: schema.attributeTypes.length,
		mr: schema.matchingRules.length,
	} : { oc: 0, at: 0, mr: 0 };

	// ═══════════════════════════════════════════════════════════════
	//  Render: Main
	// ═══════════════════════════════════════════════════════════════

	return (
		<main className="h-screen w-screen overflow-hidden bg-slate-900 flex flex-col">
			{/* ─── Top bar ─── */}
			<header className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-700/50 bg-slate-800/60 flex-shrink-0">
				<button onClick={() => router.push("/tree")} title="Back to Tree"
					className="p-1.5 rounded-lg text-slate-400 bg-slate-700/40 border border-slate-600/30 hover:bg-slate-600/50 hover:text-slate-200 transition-all">
					<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
					</svg>
				</button>

				<div className="flex items-center gap-2">
					<svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
							d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
					</svg>
					<h1 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Schema Browser</h1>
				</div>

				{schema && (
					<span className="text-[10px] text-slate-500 font-mono">
						{stats.oc} classes · {stats.at} attrs · {stats.mr} rules
						{schema.subschemaDn && <> · <span className="text-slate-600">{schema.subschemaDn}</span></>}
					</span>
				)}

				<div className="flex-1" />

				{/* Mode toggle */}
				<div className="flex gap-0.5 bg-slate-800/80 rounded-md p-0.5 border border-slate-700/40">
					<button onClick={() => setMode("viewer")}
						className={`text-[10px] px-3 py-1 rounded transition-all font-semibold uppercase tracking-wider ${mode === "viewer" ? "bg-purple-500/20 text-purple-300 border border-purple-500/30" : "text-slate-500 hover:text-slate-300 border border-transparent"}`}>
						Viewer
					</button>
					<button onClick={() => setMode("search")}
						className={`text-[10px] px-3 py-1 rounded transition-all font-semibold uppercase tracking-wider ${mode === "search" ? "bg-purple-500/20 text-purple-300 border border-purple-500/30" : "text-slate-500 hover:text-slate-300 border border-transparent"}`}>
						Search
					</button>
				</div>

				<button onClick={() => fetchSchema(true)} title="Refresh schema from server"
					className="p-1.5 rounded-lg text-slate-400 bg-slate-700/40 border border-slate-600/30 hover:bg-slate-600/50 hover:text-slate-200 transition-all">
					<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
							d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
					</svg>
				</button>
			</header>

			{/* Error banner (partial) */}
			{error && schema && (
				<div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-400">
					⚠ Schema refresh failed: {error}
				</div>
			)}

			{/* ─── Body ─── */}
			<div className="flex flex-1 overflow-hidden">
				{/* ─── LEFT SIDEBAR ─── */}
				<aside className="w-80 flex-shrink-0 border-r border-slate-700/50 flex flex-col bg-slate-800/40">
					{mode === "viewer" ? (
						<>
							{/* Tabs */}
							<div className="flex border-b border-slate-700/40 bg-slate-800/60">
								{TAB_META.map(t => (
									<button key={t.key}
										onClick={() => { setActiveTab(t.key); setSelected(null); setFilterText(""); }}
										className={`flex-1 text-[10px] px-2 py-2.5 font-semibold uppercase tracking-wider transition-all border-b-2 ${activeTab === t.key ? "border-purple-400 text-purple-300 bg-purple-500/5" : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-700/30"}`}>
										<span className="mr-1">{t.icon}</span>{t.label}
									</button>
								))}
							</div>

							{/* Filter */}
							<div className="p-2 border-b border-slate-700/30">
								<div className="relative">
									<svg className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
									</svg>
									<input ref={filterRef} type="text" value={filterText} onChange={e => setFilterText(e.target.value)}
										placeholder={`Filter ${activeTab === "objectClasses" ? "classes" : activeTab === "attributeTypes" ? "attributes" : "rules"}… (Ctrl+F)`}
										className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-900/60 border border-slate-700/40 rounded-md text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20" />
									{filterText && (
										<button onClick={() => setFilterText("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
											<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
										</button>
									)}
								</div>
							</div>

							{/* List */}
							<div className="flex-1 overflow-y-auto custom-scrollbar">
								{activeTab === "objectClasses" && filteredObjectClasses.map((oc, i) => (
									<SidebarItem key={`${oc.oid}-${i}`}
										name={primaryName(oc.names)} oid={oc.oid} badge={oc.kind[0]}
										badgeColor={oc.kind === "STRUCTURAL" ? "text-blue-400" : oc.kind === "AUXILIARY" ? "text-amber-400" : "text-slate-500"}
										isActive={selected?.tab === "objectClasses" && (selected.item as ObjectClassDef).oid === oc.oid}
										filterQ={filterText}
										onClick={() => setSelected({ tab: "objectClasses", item: oc })} />
								))}
								{activeTab === "attributeTypes" && filteredAttributeTypes.map((at, i) => (
									<SidebarItem key={`${at.oid}-${i}`}
										name={primaryName(at.names)} oid={at.oid}
										badge={at.singleValue ? "1" : "N"}
										badgeColor={at.singleValue ? "text-emerald-400" : "text-cyan-400"}
										isActive={selected?.tab === "attributeTypes" && (selected.item as AttributeTypeDef).oid === at.oid}
										filterQ={filterText}
										onClick={() => setSelected({ tab: "attributeTypes", item: at })} />
								))}
								{activeTab === "matchingRules" && filteredMatchingRules.map((mr, i) => (
									<SidebarItem key={`${mr.oid}-${i}`}
										name={primaryName(mr.names)} oid={mr.oid}
										isActive={selected?.tab === "matchingRules" && (selected.item as MatchingRuleDef).oid === mr.oid}
										filterQ={filterText}
										onClick={() => setSelected({ tab: "matchingRules", item: mr })} />
								))}
								{((activeTab === "objectClasses" && filteredObjectClasses.length === 0) ||
									(activeTab === "attributeTypes" && filteredAttributeTypes.length === 0) ||
									(activeTab === "matchingRules" && filteredMatchingRules.length === 0)) && (
									<p className="text-xs text-slate-600 text-center py-8">No matches</p>
								)}
							</div>

							{/* Count */}
							<div className="px-3 py-1.5 border-t border-slate-700/30 text-[10px] text-slate-600">
								{activeTab === "objectClasses" && `${filteredObjectClasses.length} / ${stats.oc} classes`}
								{activeTab === "attributeTypes" && `${filteredAttributeTypes.length} / ${stats.at} attributes`}
								{activeTab === "matchingRules" && `${filteredMatchingRules.length} / ${stats.mr} rules`}
							</div>
						</>
					) : (
						/* ─── Search mode sidebar ─── */
						<div className="flex flex-col h-full">
							<div className="p-3 border-b border-slate-700/40 space-y-2">
								<p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Schema Search</p>

								{/* Search scope (tab) */}
								<div className="flex gap-1">
									{TAB_META.map(t => (
										<button key={t.key} onClick={() => setSearchTab(t.key)}
											className={`text-[10px] px-2 py-1 rounded font-medium transition-all ${searchTab === t.key ? "bg-purple-500/20 text-purple-300 border border-purple-500/30" : "text-slate-500 border border-slate-700/30 hover:text-slate-300"}`}>
											{t.icon} {t.label.split(" ")[0]}
										</button>
									))}
								</div>

								{/* Search field */}
								<div className="flex gap-1 flex-wrap">
									{(["name", "oid", "desc", ...(searchTab === "objectClasses" ? ["must_may" as const] : [])] as const).map(f => (
										<button key={f} onClick={() => setSearchField(f as typeof searchField)}
											className={`text-[10px] px-2 py-0.5 rounded transition-all ${searchField === f ? "bg-slate-600/50 text-slate-200" : "text-slate-500 hover:text-slate-300"}`}>
											{f === "must_may" ? "MUST/MAY" : f.charAt(0).toUpperCase() + f.slice(1)}
										</button>
									))}
								</div>

								{/* Query input */}
								<input ref={searchRef} type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
									placeholder="Search…"
									className="w-full px-3 py-1.5 text-xs bg-slate-900/60 border border-slate-700/40 rounded-md text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50" />
							</div>

							{/* Results */}
							<div className="flex-1 overflow-y-auto custom-scrollbar">
								{searchQuery && searchResults.length === 0 && (
									<p className="text-xs text-slate-600 text-center py-8">No results</p>
								)}
								{searchResults.map((r, i) => (
									<button key={`${r.oid}-${i}`}
										onClick={() => {
											setMode("viewer");
											focusItem(r.type, r.name);
										}}
										className="w-full text-left px-3 py-2 border-b border-slate-700/20 hover:bg-slate-700/30 transition-all group">
										<div className="flex items-center gap-1.5">
											<span className="text-[10px] text-slate-600 font-mono">{r.oid.slice(0, 12)}{r.oid.length > 12 ? "…" : ""}</span>
											<span className="text-xs text-slate-200 font-medium">{highlightMatch(r.name, searchQuery)}</span>
										</div>
										<p className="text-[10px] text-slate-500 truncate mt-0.5">{highlightMatch(r.matchText, searchQuery)}</p>
									</button>
								))}
							</div>
							{searchQuery && (
								<div className="px-3 py-1.5 border-t border-slate-700/30 text-[10px] text-slate-600">
									{searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
								</div>
							)}
						</div>
					)}
				</aside>

				{/* ─── RIGHT DETAILS PANEL ─── */}
				<section className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900/80">
					{!selected ? (
						<div className="flex items-center justify-center h-full text-slate-600">
							<div className="flex flex-col items-center gap-3 text-center px-8">
								<svg className="w-16 h-16 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
										d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
								</svg>
								<p className="text-sm font-medium text-slate-500">Select an item from the list</p>
								<p className="text-xs text-slate-600">Browse object classes, attribute types, or matching rules</p>
							</div>
						</div>
					) : selected.tab === "objectClasses" ? (
						<ObjectClassDetails def={selected.item as ObjectClassDef} schema={schema} onNavigate={focusItem} onCopyRaw={handleCopyRaw} copied={copied} />
					) : selected.tab === "attributeTypes" ? (
						<AttributeTypeDetails def={selected.item as AttributeTypeDef} schema={schema} onNavigate={focusItem} onCopyRaw={handleCopyRaw} copied={copied} />
					) : (
						<MatchingRuleDetails def={selected.item as MatchingRuleDef} onCopyRaw={handleCopyRaw} copied={copied} />
					)}
				</section>
			</div>
		</main>
	);
}

// ═══════════════════════════════════════════════════════════════
//  Sidebar Item
// ═══════════════════════════════════════════════════════════════

const SidebarItem: React.FC<{
	name: string; oid: string; badge?: string; badgeColor?: string;
	isActive: boolean; filterQ: string; onClick: () => void;
}> = ({ name, oid, badge, badgeColor, isActive, filterQ, onClick }) => (
	<button onClick={onClick}
		className={`w-full text-left px-3 py-1.5 border-b border-slate-700/20 transition-all group flex items-center gap-2
			${isActive ? "bg-purple-500/10 border-l-2 border-l-purple-400" : "hover:bg-slate-700/30 border-l-2 border-l-transparent"}`}>
		{badge && <span className={`text-[10px] font-bold ${badgeColor ?? "text-slate-500"} w-4 text-center flex-shrink-0`}>{badge}</span>}
		<div className="min-w-0 flex-1">
			<p className={`text-xs font-medium truncate ${isActive ? "text-purple-200" : "text-slate-300 group-hover:text-slate-100"}`}>
				{highlightMatch(name, filterQ)}
			</p>
			<p className="text-[10px] text-slate-600 font-mono truncate">{oid}</p>
		</div>
	</button>
);

// ═══════════════════════════════════════════════════════════════
//  Detail Panels
// ═══════════════════════════════════════════════════════════════

const DetailField: React.FC<{ label: string; children: React.ReactNode; mono?: boolean }> = ({ label, children, mono }) => (
	<div className="flex gap-3 py-1.5">
		<span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold w-28 flex-shrink-0 pt-0.5">{label}</span>
		<div className={`text-xs text-slate-200 min-w-0 flex-1 ${mono ? "font-mono" : ""}`}>{children}</div>
	</div>
);

const ClickableChip: React.FC<{ text: string; tab: SchemaTab; onNavigate: (tab: SchemaTab, name: string) => void; color?: string }> = ({ text, tab, onNavigate, color }) => (
	<button onClick={() => onNavigate(tab, text)}
		className={`text-[10px] px-2 py-0.5 rounded-full border transition-all hover:brightness-125 ${color ?? "bg-slate-700/40 text-slate-300 border-slate-600/30"}`}>
		{text}
	</button>
);

const CopyRawButton: React.FC<{ onCopyRaw: () => void; copied: boolean }> = ({ onCopyRaw, copied }) => (
	<button onClick={onCopyRaw} title="Copy raw schema definition"
		className={`text-[10px] px-2.5 py-1 rounded-md border transition-all ${copied ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-slate-700/40 text-slate-400 border-slate-600/30 hover:bg-slate-600/50 hover:text-slate-200"}`}>
		{copied ? "✓ Copied" : "Copy Raw"}
	</button>
);

// ─── ObjectClass Details ───
const ObjectClassDetails: React.FC<{
	def: ObjectClassDef; schema: SchemaBundle | null;
	onNavigate: (tab: SchemaTab, name: string) => void;
	onCopyRaw: () => void; copied: boolean;
}> = ({ def, schema, onNavigate, onCopyRaw, copied }) => {
	const childClasses = useMemo(() => {
		if (!schema) return [];
		const name = primaryName(def.names).toLowerCase();
		return schema.objectClasses
			.filter(oc => oc.sup.some(s => s.toLowerCase() === name))
			.map(oc => primaryName(oc.names))
			.sort();
	}, [schema, def]);

	return (
		<div className="p-6 space-y-4 max-w-3xl">
			<div className="flex items-start justify-between">
				<div>
					<h2 className="text-lg font-bold text-slate-100">{primaryName(def.names)}</h2>
					{def.names.length > 1 && (
						<p className="text-xs text-slate-500 mt-0.5">Aliases: {def.names.slice(1).join(", ")}</p>
					)}
				</div>
				<div className="flex items-center gap-2">
					<span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border ${
						def.kind === "STRUCTURAL" ? "bg-blue-500/20 text-blue-300 border-blue-500/30" :
						def.kind === "AUXILIARY" ? "bg-amber-500/20 text-amber-300 border-amber-500/30" :
						"bg-slate-500/20 text-slate-300 border-slate-500/30"
					}`}>{def.kind}</span>
					<CopyRawButton onCopyRaw={onCopyRaw} copied={copied} />
				</div>
			</div>

			<div className="border-t border-slate-700/30 pt-3 space-y-1">
				<DetailField label="OID" mono>{def.oid}</DetailField>
				{def.description && <DetailField label="Description">{def.description}</DetailField>}
				{def.sup.length > 0 && (
					<DetailField label="Superior">
						<div className="flex flex-wrap gap-1">
							{def.sup.map(s => <ClickableChip key={s} text={s} tab="objectClasses" onNavigate={onNavigate} color="bg-blue-500/10 text-blue-300 border-blue-500/20" />)}
						</div>
					</DetailField>
				)}
			</div>

			{def.must.length > 0 && (
				<div className="border-t border-slate-700/30 pt-3">
					<p className="text-[10px] text-red-400/80 uppercase tracking-wider font-semibold mb-2">MUST attributes ({def.must.length})</p>
					<div className="flex flex-wrap gap-1">
						{def.must.map(a => <ClickableChip key={a} text={a} tab="attributeTypes" onNavigate={onNavigate} color="bg-red-500/10 text-red-300 border-red-500/20" />)}
					</div>
				</div>
			)}

			{def.may.length > 0 && (
				<div className="border-t border-slate-700/30 pt-3">
					<p className="text-[10px] text-emerald-400/80 uppercase tracking-wider font-semibold mb-2">MAY attributes ({def.may.length})</p>
					<div className="flex flex-wrap gap-1">
						{def.may.map(a => <ClickableChip key={a} text={a} tab="attributeTypes" onNavigate={onNavigate} color="bg-emerald-500/10 text-emerald-300 border-emerald-500/20" />)}
					</div>
				</div>
			)}

			{childClasses.length > 0 && (
				<div className="border-t border-slate-700/30 pt-3">
					<p className="text-[10px] text-cyan-400/80 uppercase tracking-wider font-semibold mb-2">Child classes ({childClasses.length})</p>
					<div className="flex flex-wrap gap-1">
						{childClasses.map(c => <ClickableChip key={c} text={c} tab="objectClasses" onNavigate={onNavigate} color="bg-cyan-500/10 text-cyan-300 border-cyan-500/20" />)}
					</div>
				</div>
			)}

			<details className="border-t border-slate-700/30 pt-3 group">
				<summary className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold cursor-pointer hover:text-slate-300 transition-colors">
					Raw definition
				</summary>
				<pre className="mt-2 text-[10px] text-slate-400 font-mono whitespace-pre-wrap break-all bg-slate-900/50 rounded-lg p-3 border border-slate-700/30">
					{def.raw}
				</pre>
			</details>
		</div>
	);
};

// ─── AttributeType Details ───
const AttributeTypeDetails: React.FC<{
	def: AttributeTypeDef; schema: SchemaBundle | null;
	onNavigate: (tab: SchemaTab, name: string) => void;
	onCopyRaw: () => void; copied: boolean;
}> = ({ def, schema, onNavigate, onCopyRaw, copied }) => {
	const usedInClasses = useMemo(() => {
		if (!schema) return { must: [] as string[], may: [] as string[] };
		const names = new Set(def.names.map(n => n.toLowerCase()));
		const must: string[] = [];
		const may: string[] = [];
		for (const oc of schema.objectClasses) {
			if (oc.must.some(a => names.has(a.toLowerCase()))) must.push(primaryName(oc.names));
			if (oc.may.some(a => names.has(a.toLowerCase()))) may.push(primaryName(oc.names));
		}
		return { must: must.sort(), may: may.sort() };
	}, [schema, def]);

	const syntaxLabel = useMemo(() => {
		if (!schema || !def.syntax) return def.syntax;
		const bare = def.syntax.replace(/\{.*\}$/, "");
		const found = schema.ldapSyntaxes.find(s => s.oid === bare);
		return found ? `${found.description} (${def.syntax})` : def.syntax;
	}, [schema, def.syntax]);

	return (
		<div className="p-6 space-y-4 max-w-3xl">
			<div className="flex items-start justify-between">
				<div>
					<h2 className="text-lg font-bold text-slate-100">{primaryName(def.names)}</h2>
					{def.names.length > 1 && (
						<p className="text-xs text-slate-500 mt-0.5">Aliases: {def.names.slice(1).join(", ")}</p>
					)}
				</div>
				<div className="flex items-center gap-2">
					<span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border ${def.singleValue ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"}`}>
						{def.singleValue ? "Single-Value" : "Multi-Value"}
					</span>
					{def.noUserModification && (
						<span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border bg-red-500/20 text-red-300 border-red-500/30">
							Read-Only
						</span>
					)}
					<CopyRawButton onCopyRaw={onCopyRaw} copied={copied} />
				</div>
			</div>

			<div className="border-t border-slate-700/30 pt-3 space-y-1">
				<DetailField label="OID" mono>{def.oid}</DetailField>
				{def.description && <DetailField label="Description">{def.description}</DetailField>}
				{def.sup && <DetailField label="Superior"><ClickableChip text={def.sup} tab="attributeTypes" onNavigate={onNavigate} /></DetailField>}
				{syntaxLabel && <DetailField label="Syntax" mono>{syntaxLabel}</DetailField>}
				{def.usage && <DetailField label="Usage">{def.usage}</DetailField>}
			</div>

			{(def.equality || def.ordering || def.substr) && (
				<div className="border-t border-slate-700/30 pt-3 space-y-1">
					<p className="text-[10px] text-amber-400/80 uppercase tracking-wider font-semibold mb-2">Matching Rules</p>
					{def.equality && (
						<DetailField label="Equality">
							<ClickableChip text={def.equality} tab="matchingRules" onNavigate={onNavigate} color="bg-amber-500/10 text-amber-300 border-amber-500/20" />
						</DetailField>
					)}
					{def.ordering && (
						<DetailField label="Ordering">
							<ClickableChip text={def.ordering} tab="matchingRules" onNavigate={onNavigate} color="bg-amber-500/10 text-amber-300 border-amber-500/20" />
						</DetailField>
					)}
					{def.substr && (
						<DetailField label="Substring">
							<ClickableChip text={def.substr} tab="matchingRules" onNavigate={onNavigate} color="bg-amber-500/10 text-amber-300 border-amber-500/20" />
						</DetailField>
					)}
				</div>
			)}

			{(usedInClasses.must.length > 0 || usedInClasses.may.length > 0) && (
				<div className="border-t border-slate-700/30 pt-3">
					<p className="text-[10px] text-purple-400/80 uppercase tracking-wider font-semibold mb-2">Used in Object Classes</p>
					{usedInClasses.must.length > 0 && (
						<div className="mb-2">
							<span className="text-[10px] text-red-400/60 mr-2">MUST:</span>
							<span className="inline-flex flex-wrap gap-1">
								{usedInClasses.must.map(c => <ClickableChip key={c} text={c} tab="objectClasses" onNavigate={onNavigate} color="bg-red-500/10 text-red-300 border-red-500/20" />)}
							</span>
						</div>
					)}
					{usedInClasses.may.length > 0 && (
						<div>
							<span className="text-[10px] text-emerald-400/60 mr-2">MAY:</span>
							<span className="inline-flex flex-wrap gap-1">
								{usedInClasses.may.map(c => <ClickableChip key={c} text={c} tab="objectClasses" onNavigate={onNavigate} color="bg-emerald-500/10 text-emerald-300 border-emerald-500/20" />)}
							</span>
						</div>
					)}
				</div>
			)}

			<details className="border-t border-slate-700/30 pt-3 group">
				<summary className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold cursor-pointer hover:text-slate-300 transition-colors">
					Raw definition
				</summary>
				<pre className="mt-2 text-[10px] text-slate-400 font-mono whitespace-pre-wrap break-all bg-slate-900/50 rounded-lg p-3 border border-slate-700/30">
					{def.raw}
				</pre>
			</details>
		</div>
	);
};

// ─── MatchingRule Details ───
const MatchingRuleDetails: React.FC<{
	def: MatchingRuleDef;
	onCopyRaw: () => void; copied: boolean;
}> = ({ def, onCopyRaw, copied }) => (
	<div className="p-6 space-y-4 max-w-3xl">
		<div className="flex items-start justify-between">
			<div>
				<h2 className="text-lg font-bold text-slate-100">{primaryName(def.names)}</h2>
				{def.names.length > 1 && (
					<p className="text-xs text-slate-500 mt-0.5">Aliases: {def.names.slice(1).join(", ")}</p>
				)}
			</div>
			<div className="flex items-center gap-2">
				<span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border bg-amber-500/20 text-amber-300 border-amber-500/30">
					Matching Rule
				</span>
				<CopyRawButton onCopyRaw={onCopyRaw} copied={copied} />
			</div>
		</div>
		<div className="border-t border-slate-700/30 pt-3 space-y-1">
			<DetailField label="OID" mono>{def.oid}</DetailField>
			{def.description && <DetailField label="Description">{def.description}</DetailField>}
			{def.syntax && <DetailField label="Syntax" mono>{def.syntax}</DetailField>}
		</div>
		<details className="border-t border-slate-700/30 pt-3 group">
			<summary className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold cursor-pointer hover:text-slate-300 transition-colors">
				Raw definition
			</summary>
			<pre className="mt-2 text-[10px] text-slate-400 font-mono whitespace-pre-wrap break-all bg-slate-900/50 rounded-lg p-3 border border-slate-700/30">
				{def.raw}
			</pre>
		</details>
	</div>
);
