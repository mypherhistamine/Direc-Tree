'use client'

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { log, LogEntry, LogLevel } from "../utils/logger";
import { loggedInvoke } from "../utils/loggedInvoke";

// ═══════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════

type ActiveTab = "frontend" | "backend";

const LEVEL_COLORS: Record<LogLevel | string, string> = {
	debug: "text-slate-400 bg-slate-700/40 border-slate-600/30",
	info: "text-blue-300  bg-blue-500/15  border-blue-500/25",
	warn: "text-amber-300 bg-amber-500/15 border-amber-500/25",
	error: "text-red-300   bg-red-500/15   border-red-500/25",
	TRACE: "text-slate-500 bg-slate-700/30 border-slate-600/20",
	DEBUG: "text-slate-400 bg-slate-700/40 border-slate-600/30",
	INFO: "text-blue-300  bg-blue-500/15  border-blue-500/25",
	WARN: "text-amber-300 bg-amber-500/15 border-amber-500/25",
	ERROR: "text-red-300   bg-red-500/15   border-red-500/25",
};

function levelBadge(level: string) {
	const cls = LEVEL_COLORS[level] ?? LEVEL_COLORS["info"];
	return (
		<span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold uppercase ${cls}`}>
			{level}
		</span>
	);
}

// ═══════════════════════════════════════════════════════════════
//  Parse a backend log line
// ═══════════════════════════════════════════════════════════════

interface BackendLogLine {
	ts: string;
	level: string;
	message: string;
	raw: string;
}

function parseBackendLine(line: string): BackendLogLine {
	// Expected format: "2025-01-15T10:30:00.123456Z  INFO command: message field=value"
	const match = line.match(/^(\S+)\s+(TRACE|DEBUG|INFO|WARN|ERROR)\s+(.*)$/);
	if (match) {
		return { ts: match[1], level: match[2], message: match[3], raw: line };
	}
	return { ts: "", level: "INFO", message: line, raw: line };
}

// ═══════════════════════════════════════════════════════════════
//  Component
// ═══════════════════════════════════════════════════════════════

export default function LogsPage() {
	const router = useRouter();

	// Tab
	const [activeTab, setActiveTab] = useState<ActiveTab>("frontend");

	// Frontend state
	const [frontendEntries, setFrontendEntries] = useState<LogEntry[]>([]);
	const [feSearch, setFeSearch] = useState("");
	const [feLevelFilter, setFeLevelFilter] = useState<LogLevel | "all">("all");

	// Backend state
	const [backendLines, setBackendLines] = useState<BackendLogLine[]>([]);
	const [beSearch, setBeSearch] = useState("");
	const [beLevelFilter, setBeLevelFilter] = useState<string>("all");
	const [beLoading, setBeLoading] = useState(false);
	const [beTailLines, setBeTailLines] = useState(500);
	const [beAutoRefresh, setBeAutoRefresh] = useState(false);
	const [logDir, setLogDir] = useState<string>("");

	const scrollRef = useRef<HTMLDivElement>(null);
	const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

	// ─── Fetch frontend logs ───
	const refreshFrontend = useCallback(() => {
		setFrontendEntries(log.getEntries());
	}, []);

	useEffect(() => {
		refreshFrontend();
	}, [refreshFrontend, activeTab]);

	// ─── Fetch backend logs ───
	const fetchBackendLogs = useCallback(async () => {
		setBeLoading(true);
		try {
			const lines = await loggedInvoke<string[]>("get_log_tail", { lines: beTailLines });
			setBackendLines(lines.map(parseBackendLine));
		} catch (err) {
			log.error("Failed to fetch backend logs", { error: String(err) });
			setBackendLines([{ ts: "", level: "ERROR", message: `Failed to load: ${err}`, raw: String(err) }]);
		} finally {
			setBeLoading(false);
		}
	}, [beTailLines]);

	const fetchLogDir = useCallback(async () => {
		try {
			const dir = await loggedInvoke<string>("get_log_dir");
			setLogDir(dir);
		} catch { /* ignore */ }
	}, []);

	useEffect(() => {
		if (activeTab === "backend") {
			fetchBackendLogs();
			fetchLogDir();
		}
	}, [activeTab, fetchBackendLogs, fetchLogDir]);

	// Auto-refresh
	useEffect(() => {
		if (beAutoRefresh && activeTab === "backend") {
			autoRefreshRef.current = setInterval(fetchBackendLogs, 3000);
		}
		return () => {
			if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
		};
	}, [beAutoRefresh, activeTab, fetchBackendLogs]);

	// Scroll to bottom on new entries
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [frontendEntries, backendLines]);

	// ─── Filtered frontend entries ───
	const filteredFe = useMemo(() => {
		let entries = frontendEntries;
		if (feLevelFilter !== "all") {
			const pri: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
			const min = pri[feLevelFilter];
			entries = entries.filter((e) => pri[e.level] >= min);
		}
		if (feSearch.trim()) {
			const q = feSearch.toLowerCase();
			entries = entries.filter(
				(e) =>
					e.message.toLowerCase().includes(q) ||
					(e.context && JSON.stringify(e.context).toLowerCase().includes(q))
			);
		}
		return entries;
	}, [frontendEntries, feLevelFilter, feSearch]);

	// ─── Filtered backend entries ───
	const filteredBe = useMemo(() => {
		let lines = backendLines;
		if (beLevelFilter !== "all") {
			lines = lines.filter((l) => l.level === beLevelFilter);
		}
		if (beSearch.trim()) {
			const q = beSearch.toLowerCase();
			lines = lines.filter((l) => l.raw.toLowerCase().includes(q));
		}
		return lines;
	}, [backendLines, beLevelFilter, beSearch]);

	// ─── Export helpers ───
	const handleExportFrontend = useCallback(() => {
		const text = log.exportText();
		const blob = new Blob([text], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `directree-frontend-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}, []);

	const handleExportBackend = useCallback(() => {
		const text = backendLines.map((l) => l.raw).join("\n");
		const blob = new Blob([text], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `directree-backend-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}, [backendLines]);

	const handleCopyAll = useCallback(async () => {
		const text = activeTab === "frontend"
			? log.exportText()
			: backendLines.map((l) => l.raw).join("\n");
		try {
			await navigator.clipboard.writeText(text);
		} catch { /* fallback: ignore */ }
	}, [activeTab, backendLines]);

	// ═══════════════════════════════════════════════════════
	//  Render
	// ═══════════════════════════════════════════════════════

	return (
		<main className="h-screen w-screen overflow-hidden bg-slate-900 flex flex-col">

			{/* ─── Header ─── */}
			<div className="px-5 py-3 border-b border-slate-700/50 flex items-center gap-4 flex-shrink-0">
				<button
					onClick={() => router.back()}
					className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700/50 hover:text-slate-200 transition-all"
					title="Go back"
				>
					<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
					</svg>
				</button>

				<div className="flex items-center gap-2">
					<svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
							d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
					</svg>
					<h1 className="text-sm font-semibold text-slate-200">Logs Viewer</h1>
				</div>

				{/* Tab switcher */}
				<div className="flex items-center gap-1 bg-slate-800 rounded-lg p-0.5 border border-slate-700/50">
					{(["frontend", "backend"] as const).map((tab) => (
						<button
							key={tab}
							onClick={() => setActiveTab(tab)}
							className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all capitalize
								${activeTab === tab
									? "bg-slate-600/60 text-slate-200 shadow-sm"
									: "text-slate-400 hover:text-slate-300 hover:bg-slate-700/40"
								}`}
						>
							{tab}
						</button>
					))}
				</div>

				<div className="flex-1" />

				{/* Actions */}
				<div className="flex items-center gap-2">
					<button
						onClick={handleCopyAll}
						className="text-[10px] px-2.5 py-1.5 rounded-md bg-slate-700/40 border border-slate-600/30
							text-slate-300 hover:bg-slate-600/50 transition-all flex items-center gap-1.5"
						title="Copy all visible logs"
					>
						<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
								d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
						</svg>
						Copy
					</button>
					<button
						onClick={activeTab === "frontend" ? handleExportFrontend : handleExportBackend}
						className="text-[10px] px-2.5 py-1.5 rounded-md bg-slate-700/40 border border-slate-600/30
							text-slate-300 hover:bg-slate-600/50 transition-all flex items-center gap-1.5"
						title="Export logs to file"
					>
						<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
								d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
						</svg>
						Export
					</button>
				</div>
			</div>

			{/* ─── Toolbar ─── */}
			<div className="px-5 py-2 border-b border-slate-700/50 flex items-center gap-3 flex-shrink-0">
				{/* Search */}
				<div className="relative flex-1 max-w-sm">
					<svg className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
					</svg>
					<input
						value={activeTab === "frontend" ? feSearch : beSearch}
						onChange={(e) => activeTab === "frontend" ? setFeSearch(e.target.value) : setBeSearch(e.target.value)}
						placeholder="Filter logs…"
						className="w-full text-xs pl-8 pr-2 py-1.5 rounded-md bg-slate-800 border border-slate-700/50
							text-slate-300 placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none transition-all"
					/>
				</div>

				{/* Level filter */}
				<div className="flex items-center gap-1">
					{activeTab === "frontend" ? (
						<>
							{(["all", "debug", "info", "warn", "error"] as const).map((lvl) => (
								<button
									key={lvl}
									onClick={() => setFeLevelFilter(lvl)}
									className={`text-[10px] px-2 py-1 rounded-md border transition-all uppercase
										${feLevelFilter === lvl
											? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
											: "bg-slate-700/30 text-slate-400 border-slate-600/20 hover:bg-slate-700/50"
										}`}
								>
									{lvl}
								</button>
							))}
						</>
					) : (
						<>
							{["all", "TRACE", "DEBUG", "INFO", "WARN", "ERROR"].map((lvl) => (
								<button
									key={lvl}
									onClick={() => setBeLevelFilter(lvl)}
									className={`text-[10px] px-2 py-1 rounded-md border transition-all
										${beLevelFilter === lvl
											? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
											: "bg-slate-700/30 text-slate-400 border-slate-600/20 hover:bg-slate-700/50"
										}`}
								>
									{lvl}
								</button>
							))}
						</>
					)}
				</div>

				{/* Backend-specific controls */}
				{activeTab === "backend" && (
					<div className="flex items-center gap-2 ml-auto">
						<select
							value={beTailLines}
							onChange={(e) => setBeTailLines(Number(e.target.value))}
							className="text-[10px] px-2 py-1 rounded-md bg-slate-800 border border-slate-700/50
								text-slate-300 focus:outline-none"
						>
							<option value={100}>Last 100</option>
							<option value={500}>Last 500</option>
							<option value={1000}>Last 1000</option>
							<option value={5000}>Last 5000</option>
						</select>

						<button
							onClick={() => setBeAutoRefresh((v) => !v)}
							className={`text-[10px] px-2.5 py-1 rounded-md border transition-all flex items-center gap-1
								${beAutoRefresh
									? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
									: "bg-slate-700/30 text-slate-400 border-slate-600/20 hover:bg-slate-700/50"
								}`}
						>
							<div className={`w-1.5 h-1.5 rounded-full ${beAutoRefresh ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
							Auto
						</button>

						<button
							onClick={fetchBackendLogs}
							disabled={beLoading}
							className="text-[10px] px-2.5 py-1 rounded-md bg-slate-700/40 border border-slate-600/30
								text-slate-300 hover:bg-slate-600/50 transition-all disabled:opacity-40"
						>
							{beLoading ? "Loading…" : "Refresh"}
						</button>
					</div>
				)}

				{/* Frontend clear */}
				{activeTab === "frontend" && (
					<div className="ml-auto flex items-center gap-2">
						<button
							onClick={() => { refreshFrontend(); }}
							className="text-[10px] px-2.5 py-1 rounded-md bg-slate-700/40 border border-slate-600/30
								text-slate-300 hover:bg-slate-600/50 transition-all"
						>
							Refresh
						</button>
						<button
							onClick={() => { log.clear(); refreshFrontend(); }}
							className="text-[10px] px-2.5 py-1 rounded-md bg-red-500/10 border border-red-500/20
								text-red-300 hover:bg-red-500/20 transition-all"
						>
							Clear
						</button>
					</div>
				)}
			</div>

			{/* ─── Log content ─── */}
			<div ref={scrollRef} className="flex-1 overflow-auto custom-scrollbar">
				{activeTab === "frontend" ? (
					/* ── Frontend Logs ── */
					<div className="font-mono text-[11px]">
						{filteredFe.length === 0 ? (
							<div className="flex items-center justify-center h-full min-h-[200px] text-slate-500">
								<div className="text-center">
									<svg className="w-8 h-8 mx-auto mb-2 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
											d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
									</svg>
									<p className="text-xs">No frontend logs yet</p>
									<p className="text-[10px] text-slate-600 mt-1">Interact with the app to generate logs</p>
								</div>
							</div>
						) : (
							<table className="w-full">
								<thead className="sticky top-0 bg-slate-900 border-b border-slate-700/50">
									<tr>
										<th className="text-left text-[9px] text-slate-500 uppercase tracking-wider font-semibold px-3 py-1.5 w-[180px]">Time</th>
										<th className="text-left text-[9px] text-slate-500 uppercase tracking-wider font-semibold px-3 py-1.5 w-[60px]">Level</th>
										<th className="text-left text-[9px] text-slate-500 uppercase tracking-wider font-semibold px-3 py-1.5">Message</th>
										<th className="text-left text-[9px] text-slate-500 uppercase tracking-wider font-semibold px-3 py-1.5">Context</th>
									</tr>
								</thead>
								<tbody>
									{filteredFe.map((entry, idx) => (
										<tr key={idx}
											className={`border-b border-slate-800/50 hover:bg-slate-800/40
												${entry.level === "error" ? "bg-red-500/5" : entry.level === "warn" ? "bg-amber-500/5" : ""}`}>
											<td className="px-3 py-1 text-slate-500 whitespace-nowrap">
												{entry.ts.replace("T", " ").slice(0, 23)}
											</td>
											<td className="px-3 py-1">{levelBadge(entry.level)}</td>
											<td className="px-3 py-1 text-slate-300 break-all">{entry.message}</td>
											<td className="px-3 py-1 text-slate-500 break-all max-w-[300px] truncate">
												{entry.context ? JSON.stringify(entry.context) : ""}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						)}
					</div>
				) : (
					/* ── Backend Logs ── */
					<div className="font-mono text-[11px]">
						{beLoading && backendLines.length === 0 ? (
							<div className="flex items-center justify-center h-full min-h-[200px] text-slate-400">
								<div className="flex flex-col items-center gap-2">
									<div className="w-5 h-5 border-2 border-slate-500 border-t-emerald-400 rounded-full animate-spin" />
									<span className="text-xs">Loading backend logs…</span>
								</div>
							</div>
						) : filteredBe.length === 0 ? (
							<div className="flex items-center justify-center h-full min-h-[200px] text-slate-500">
								<div className="text-center">
									<svg className="w-8 h-8 mx-auto mb-2 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
											d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
									</svg>
									<p className="text-xs">No backend log entries found</p>
									{logDir && <p className="text-[10px] text-slate-600 mt-1">Log dir: {logDir}</p>}
								</div>
							</div>
						) : (
							<>
								<table className="w-full">
									<thead className="sticky top-0 bg-slate-900 border-b border-slate-700/50">
										<tr>
											<th className="text-left text-[9px] text-slate-500 uppercase tracking-wider font-semibold px-3 py-1.5 w-[220px]">Time</th>
											<th className="text-left text-[9px] text-slate-500 uppercase tracking-wider font-semibold px-3 py-1.5 w-[60px]">Level</th>
											<th className="text-left text-[9px] text-slate-500 uppercase tracking-wider font-semibold px-3 py-1.5">Message</th>
										</tr>
									</thead>
									<tbody>
										{filteredBe.map((line, idx) => (
											<tr key={idx}
												className={`border-b border-slate-800/50 hover:bg-slate-800/40
													${line.level === "ERROR" ? "bg-red-500/5" : line.level === "WARN" ? "bg-amber-500/5" : ""}`}>
												<td className="px-3 py-1 text-slate-500 whitespace-nowrap">
													{line.ts.replace("T", " ").slice(0, 23)}
												</td>
												<td className="px-3 py-1">{levelBadge(line.level)}</td>
												<td className="px-3 py-1 text-slate-300 break-all">{line.message}</td>
											</tr>
										))}
									</tbody>
								</table>
								{logDir && (
									<div className="px-3 py-2 border-t border-slate-700/50 text-[10px] text-slate-500">
										Log directory: <span className="text-slate-400 font-mono">{logDir}</span>
										{" · "}{filteredBe.length} / {backendLines.length} entries shown
									</div>
								)}
							</>
						)}
					</div>
				)}
			</div>

			{/* ─── Status bar ─── */}
			<div className="px-5 py-1.5 border-t border-slate-700/50 flex items-center justify-between flex-shrink-0 text-[10px] text-slate-500">
				<span>
					{activeTab === "frontend"
						? `${filteredFe.length} / ${frontendEntries.length} entries (buffer: ${log.size} / 2000)`
						: `${filteredBe.length} / ${backendLines.length} lines`}
				</span>
				<span>
					{activeTab === "backend" && beAutoRefresh && (
						<span className="text-emerald-400">Auto-refreshing every 3s</span>
					)}
				</span>
			</div>
		</main>
	);
}
