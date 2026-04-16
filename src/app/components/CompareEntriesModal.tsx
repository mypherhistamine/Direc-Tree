import React, { useState, useCallback, useEffect, useMemo } from "react";
import { loggedInvoke } from "../utils/loggedInvoke";

interface CompareEntriesModalProps {
	open: boolean;
	onClose: () => void;
	/** Pre-fill DN A from tree selection */
	dnA?: string | null;
	/** Pre-fill DN B from marked-for-compare */
	dnB?: string | null;
}

interface CompareRow {
	key: string;
	valueA: string | null;
	valueB: string | null;
	status: "same" | "different" | "only-a" | "only-b";
}

const CompareEntriesModal: React.FC<CompareEntriesModalProps> = ({
	open,
	onClose,
	dnA: initialDnA,
	dnB: initialDnB,
}) => {
	const [dnA, setDnA] = useState(initialDnA ?? "");
	const [dnB, setDnB] = useState(initialDnB ?? "");
	const [rows, setRows] = useState<CompareRow[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [filterMode, setFilterMode] = useState<"all" | "different" | "only-a" | "only-b">("all");

	useEffect(() => {
		if (open) {
			if (initialDnA) setDnA(initialDnA);
			if (initialDnB) setDnB(initialDnB);
			setRows([]);
			setError(null);
		}
	}, [open, initialDnA, initialDnB]);

	const handleCompare = useCallback(async () => {
		if (!dnA.trim() || !dnB.trim()) return;
		setIsLoading(true);
		setError(null);
		try {
			const [attrsA, attrsB] = await Promise.all([
				loggedInvoke<Record<string, string[]>>("fetch_node_attributes", { baseDn: dnA }),
				loggedInvoke<Record<string, string[]>>("fetch_node_attributes", { baseDn: dnB }),
			]);

			const allKeys = new Set([...Object.keys(attrsA), ...Object.keys(attrsB)]);
			const compareRows: CompareRow[] = [];

			for (const key of allKeys) {
				const rawA = attrsA[key] ?? null;
				const rawB = attrsB[key] ?? null;
				const vA = rawA ? rawA.join(", ") : null;
				const vB = rawB ? rawB.join(", ") : null;

				let status: CompareRow["status"];
				if (vA !== null && vB !== null) {
					status = vA === vB ? "same" : "different";
				} else if (vA !== null) {
					status = "only-a";
				} else {
					status = "only-b";
				}

				compareRows.push({ key, valueA: vA, valueB: vB, status });
			}

			// Sort: different first, then only-a, only-b, same
			const order = { different: 0, "only-a": 1, "only-b": 2, same: 3 };
			compareRows.sort((a, b) => order[a.status] - order[b.status] || a.key.localeCompare(b.key));

			setRows(compareRows);
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setIsLoading(false);
		}
	}, [dnA, dnB]);

	const filteredRows = useMemo(() => {
		if (filterMode === "all") return rows;
		return rows.filter((r) => r.status === filterMode);
	}, [rows, filterMode]);

	const statusCounts = useMemo(() => {
		const counts = { all: rows.length, same: 0, different: 0, "only-a": 0, "only-b": 0 };
		for (const r of rows) counts[r.status]++;
		return counts;
	}, [rows]);

	if (!open) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
			<div className="bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl flex flex-col"
				style={{ width: "min(95vw, 1200px)", height: "min(90vh, 800px)" }}>

				{/* Header */}
				<div className="px-5 py-3 border-b border-slate-700/50 flex items-center justify-between flex-shrink-0">
					<div className="flex items-center gap-2">
						<svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
								d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
						</svg>
						<h2 className="text-sm font-semibold text-slate-200">Compare Entries</h2>
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

				{/* DN inputs */}
				<div className="px-5 py-3 border-b border-slate-700/50 flex-shrink-0 space-y-2">
					<div className="flex gap-3">
						<div className="flex-1 min-w-0">
							<label className="text-[10px] text-cyan-400/70 uppercase tracking-wider font-semibold mb-1 block">Entry A</label>
							<input
								value={dnA}
								onChange={(e) => setDnA(e.target.value)}
								placeholder="DN of first entry"
								className="w-full text-xs px-3 py-1.5 rounded-md bg-slate-800 border border-slate-700/50
									text-slate-200 placeholder-slate-500 font-mono focus:border-cyan-500/50 focus:outline-none transition-all"
							/>
						</div>
						<div className="flex-1 min-w-0">
							<label className="text-[10px] text-cyan-400/70 uppercase tracking-wider font-semibold mb-1 block">Entry B</label>
							<input
								value={dnB}
								onChange={(e) => setDnB(e.target.value)}
								placeholder="DN of second entry"
								className="w-full text-xs px-3 py-1.5 rounded-md bg-slate-800 border border-slate-700/50
									text-slate-200 placeholder-slate-500 font-mono focus:border-cyan-500/50 focus:outline-none transition-all"
							/>
						</div>
						<button
							onClick={handleCompare}
							disabled={isLoading || !dnA.trim() || !dnB.trim()}
							className="self-end px-4 py-1.5 text-xs font-semibold rounded-lg
								bg-cyan-500/20 text-cyan-300 border border-cyan-500/30
								hover:bg-cyan-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all
								flex items-center gap-1.5"
						>
							{isLoading ? (
								<div className="w-3 h-3 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
							) : (
								<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
										d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
								</svg>
							)}
							Compare
						</button>
					</div>
				</div>

				{/* Filter tabs */}
				{rows.length > 0 && (
					<div className="px-5 py-2 border-b border-slate-700/50 flex gap-1.5 flex-shrink-0">
						{(["all", "different", "only-a", "only-b"] as const).map((mode) => {
							const labels = { all: "All", different: "Different", "only-a": "Only A", "only-b": "Only B" };
							const colors = {
								all: "bg-slate-700/40 text-slate-300 border-slate-600/30",
								different: "bg-amber-500/10 text-amber-300 border-amber-500/20",
								"only-a": "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
								"only-b": "bg-pink-500/10 text-pink-300 border-pink-500/20",
							};
							const activeColors = {
								all: "bg-slate-600/60 text-slate-200 border-slate-500/50",
								different: "bg-amber-500/25 text-amber-200 border-amber-500/40",
								"only-a": "bg-cyan-500/25 text-cyan-200 border-cyan-500/40",
								"only-b": "bg-pink-500/25 text-pink-200 border-pink-500/40",
							};
							return (
								<button
									key={mode}
									onClick={() => setFilterMode(mode)}
									className={`text-[10px] px-2 py-1 rounded-md border transition-all
										${filterMode === mode ? activeColors[mode] : colors[mode]}`}
								>
									{labels[mode]} ({statusCounts[mode]})
								</button>
							);
						})}
					</div>
				)}

				{/* Error */}
				{error && (
					<div className="px-5 py-3 flex-shrink-0">
						<div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 font-mono break-all">
							{error}
						</div>
					</div>
				)}

				{/* Comparison table */}
				<div className="flex-1 overflow-auto custom-scrollbar">
					{filteredRows.length > 0 ? (
						<table className="w-full text-xs">
							<thead className="sticky top-0 z-10">
								<tr className="bg-slate-800">
									<th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-700/50 w-[20%]">
										Attribute
									</th>
									<th className="text-left px-3 py-2 text-[10px] font-semibold text-cyan-400/70 uppercase tracking-wider border-b border-slate-700/50 w-[35%]">
										Entry A
									</th>
									<th className="text-left px-3 py-2 text-[10px] font-semibold text-pink-400/70 uppercase tracking-wider border-b border-slate-700/50 w-[35%]">
										Entry B
									</th>
									<th className="w-16 text-center px-2 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-700/50">
										Status
									</th>
								</tr>
							</thead>
							<tbody>
								{filteredRows.map((row) => {
									const statusColors = {
										same: "text-emerald-500/60",
										different: "text-amber-400",
										"only-a": "text-cyan-400",
										"only-b": "text-pink-400",
									};
									const statusLabels = { same: "=", different: "≠", "only-a": "A", "only-b": "B" };
									const bgColors = {
										same: "",
										different: "bg-amber-500/5",
										"only-a": "bg-cyan-500/5",
										"only-b": "bg-pink-500/5",
									};
									return (
										<tr key={row.key} className={`transition-colors hover:bg-slate-700/30 ${bgColors[row.status]}`}>
											<td className="px-3 py-1.5 font-medium text-slate-300 whitespace-nowrap">
												{row.key}
											</td>
											<td className="px-3 py-1.5 font-mono text-slate-400 break-all max-w-0">
												<div className="truncate" title={row.valueA ?? "—"}>
													{row.valueA ?? <span className="text-slate-600 italic">—</span>}
												</div>
											</td>
											<td className="px-3 py-1.5 font-mono text-slate-400 break-all max-w-0">
												<div className="truncate" title={row.valueB ?? "—"}>
													{row.valueB ?? <span className="text-slate-600 italic">—</span>}
												</div>
											</td>
											<td className={`px-2 py-1.5 text-center font-bold ${statusColors[row.status]}`}>
												{statusLabels[row.status]}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					) : rows.length === 0 && !isLoading && !error ? (
						<div className="flex items-center justify-center h-full text-slate-500">
							<div className="flex flex-col items-center gap-2 text-center px-6">
								<svg className="w-10 h-10 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
										d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
								</svg>
								<p className="text-xs font-medium">Enter two DNs and click Compare</p>
							</div>
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
};

export default CompareEntriesModal;
