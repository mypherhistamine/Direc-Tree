import React, { useState, useCallback, useEffect, useMemo } from "react";
import { loggedInvoke } from "../utils/loggedInvoke";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

interface RootDseModalProps {
	open: boolean;
	onClose: () => void;
}

const RootDseModal: React.FC<RootDseModalProps> = ({ open, onClose }) => {
	const [attrs, setAttrs] = useState<Record<string, string[]>>({});
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [filter, setFilter] = useState("");
	const [copiedKey, setCopiedKey] = useState<string | null>(null);

	const fetchRootDse = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const result = await loggedInvoke<Record<string, string[]>>("fetch_root_dse");
			setAttrs(result);
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		if (open) fetchRootDse();
	}, [open, fetchRootDse]);

	const entries = useMemo(() => {
		const all = Object.entries(attrs);
		if (!filter.trim()) return all;
		const lower = filter.toLowerCase();
		return all.filter(([k, v]) => k.toLowerCase().includes(lower) || v.join(", ").toLowerCase().includes(lower));
	}, [attrs, filter]);

	const copyValue = useCallback(async (key: string, value: string) => {
		try {
			await writeText(value);
			setCopiedKey(key);
			setTimeout(() => setCopiedKey(null), 1500);
		} catch { /* */ }
	}, []);

	if (!open) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
			<div className="bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl flex flex-col"
				style={{ width: "min(80vw, 700px)", height: "min(80vh, 600px)" }}>
				{/* Header */}
				<div className="px-5 py-3 border-b border-slate-700/50 flex items-center justify-between flex-shrink-0">
					<div className="flex items-center gap-2">
						<svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
								d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
						</svg>
						<h2 className="text-sm font-semibold text-slate-200">RootDSE Information</h2>
					</div>
					<button
						onClick={onClose}
						className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700/60 hover:text-slate-200 transition-all"
					>
						<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				{/* Filter */}
				<div className="px-5 py-2 border-b border-slate-700/50 flex-shrink-0">
					<div className="relative">
						<svg className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
						</svg>
						<input
							value={filter}
							onChange={(e) => setFilter(e.target.value)}
							placeholder="Filter attributes…"
							className="w-full text-xs pl-8 pr-2 py-1.5 rounded-md bg-slate-800 border border-slate-700/50
								text-slate-300 placeholder-slate-500 focus:border-purple-500/50 focus:outline-none transition-all"
						/>
					</div>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-auto custom-scrollbar">
					{isLoading ? (
						<div className="flex items-center justify-center h-full text-slate-400">
							<div className="flex flex-col items-center gap-2">
								<div className="w-6 h-6 border-2 border-slate-500 border-t-purple-400 rounded-full animate-spin" />
								<span className="text-xs">Fetching RootDSE…</span>
							</div>
						</div>
					) : error ? (
						<div className="p-5">
							<div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 font-mono break-all">
								{error}
							</div>
						</div>
					) : (
						<table className="w-full text-xs">
							<thead className="sticky top-0 z-10">
								<tr className="bg-slate-800">
									<th className="text-left px-4 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-700/50 w-[35%]">
										Attribute
									</th>
									<th className="text-left px-4 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-700/50">
										Value
									</th>
								</tr>
							</thead>
							<tbody>
								{entries.map(([key, values], idx) => (
									<tr key={key}
										className={`transition-colors hover:bg-slate-700/50
											${idx % 2 === 0 ? "bg-transparent" : "bg-slate-800/30"}`}
									>
										<td className="px-4 py-1.5 font-medium text-slate-300 whitespace-nowrap">
											<span className="flex items-center gap-1.5">
												<span className="w-1.5 h-1.5 rounded-full bg-purple-400/60 flex-shrink-0" />
												{key}
											</span>
										</td>
										<td className="px-4 py-1.5 text-slate-400 font-mono">
											<div className="flex items-center gap-1.5">
												<span className="break-all">{values.join(", ")}</span>
												<button
													onClick={() => copyValue(key, values.join(", "))}
													className={`flex-shrink-0 p-0.5 rounded transition-all
														${copiedKey === key ? "text-emerald-400" : "text-slate-600 hover:text-slate-300"}`}
												>
													{copiedKey === key ? (
														<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
														</svg>
													) : (
														<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
																d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
														</svg>
													)}
												</button>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</div>

				{/* Footer */}
				<div className="px-5 py-2 border-t border-slate-700/50 flex items-center justify-between flex-shrink-0">
					<span className="text-[10px] text-slate-500">
						{entries.length} attribute{entries.length !== 1 ? "s" : ""}
					</span>
					<button
						onClick={fetchRootDse}
						disabled={isLoading}
						className="text-[10px] px-2.5 py-1 rounded-md bg-purple-500/10 text-purple-400
							border border-purple-500/20 hover:bg-purple-500/20 disabled:opacity-30 transition-all flex items-center gap-1"
					>
						<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
								d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
						</svg>
						Refresh
					</button>
				</div>
			</div>
		</div>
	);
};

export default RootDseModal;
