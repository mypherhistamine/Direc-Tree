import React, { useState, useCallback, useEffect } from "react";
import { loggedInvoke } from "../utils/loggedInvoke";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

interface LdifViewProps {
	/** DN of the currently selected node */
	dn: string | null;
	/** Whether to include operational attributes */
	includeOperational: boolean;
}

const LdifView: React.FC<LdifViewProps> = ({ dn, includeOperational }) => {
	const [ldif, setLdif] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	const fetchLdif = useCallback(async () => {
		if (!dn) return;
		setIsLoading(true);
		setError(null);
		try {
			const result = await loggedInvoke<string>("get_entry_ldif", {
				baseDn: dn,
				includeOperational,
			});
			setLdif(result);
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : String(err));
			setLdif(null);
		} finally {
			setIsLoading(false);
		}
	}, [dn, includeOperational]);

	useEffect(() => {
		fetchLdif();
	}, [fetchLdif]);

	const handleCopy = useCallback(async () => {
		if (!ldif) return;
		try {
			await writeText(ldif);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch { /* ignore */ }
	}, [ldif]);

	const handleExport = useCallback(() => {
		if (!ldif) return;
		const rdn = dn?.split(",")[0]?.replace(/[^a-zA-Z0-9_-]/g, "_") ?? "entry";
		const blob = new Blob([ldif], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${rdn}.ldif`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}, [ldif, dn]);

	if (!dn) {
		return (
			<div className="flex items-center justify-center h-full text-slate-500">
				<p className="text-xs">Select a node to view LDIF</p>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-full text-slate-400">
				<div className="flex flex-col items-center gap-2">
					<div className="w-5 h-5 border-2 border-slate-500 border-t-blue-400 rounded-full animate-spin" />
					<span className="text-xs">Loading LDIF…</span>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="p-4">
				<div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 font-mono break-all">
					{error}
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			{/* Toolbar */}
			<div className="px-3 py-2 border-b border-slate-700/50 flex items-center gap-2 flex-shrink-0">
				<button
					onClick={handleCopy}
					className="text-[10px] px-2.5 py-1 rounded-md bg-slate-700/40 border border-slate-600/30
						text-slate-300 hover:bg-slate-600/50 transition-all flex items-center gap-1.5"
				>
					{copied ? (
						<>
							<svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
							</svg>
							Copied
						</>
					) : (
						<>
							<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
									d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
							</svg>
							Copy
						</>
					)}
				</button>
				<button
					onClick={handleExport}
					className="text-[10px] px-2.5 py-1 rounded-md bg-slate-700/40 border border-slate-600/30
						text-slate-300 hover:bg-slate-600/50 transition-all flex items-center gap-1.5"
				>
					<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
							d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
					</svg>
					Export .ldif
				</button>
				<button
					onClick={fetchLdif}
					className="text-[10px] px-2.5 py-1 rounded-md bg-slate-700/40 border border-slate-600/30
						text-slate-300 hover:bg-slate-600/50 transition-all flex items-center gap-1.5"
				>
					<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
							d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
					</svg>
					Refresh
				</button>
			</div>

			{/* LDIF content */}
			<div className="flex-1 overflow-auto custom-scrollbar p-4">
				<pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-all leading-relaxed">
					{ldif}
				</pre>
			</div>
		</div>
	);
};

export default LdifView;
