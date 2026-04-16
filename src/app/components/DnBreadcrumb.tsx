import React, { useMemo, useCallback } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

interface DnBreadcrumbProps {
	dn: string | null;
	onNavigate?: (dn: string) => void;
}

/**
 * Displays the DN as a clickable breadcrumb trail.
 * e.g. "cn=John" / "ou=Users" / "dc=example" / "dc=com"
 * Clicking any segment navigates to the ancestor DN.
 */
const DnBreadcrumb: React.FC<DnBreadcrumbProps> = ({ dn, onNavigate }) => {
	const segments = useMemo(() => {
		if (!dn) return [];
		// Split DN into RDN components (simple split on comma — works for most DNs)
		const parts = dn.split(",").map((s) => s.trim());
		return parts.map((rdn, idx) => ({
			rdn,
			// The full DN from this segment onwards
			fullDn: parts.slice(idx).join(","),
		}));
	}, [dn]);

	const handleCopy = useCallback(async () => {
		if (!dn) return;
		try {
			await writeText(dn);
		} catch { /* ignore */ }
	}, [dn]);

	if (!dn) return null;

	return (
		<div className="flex items-center gap-0.5 min-w-0 overflow-x-auto custom-scrollbar flex-shrink-0">
			{segments.map((seg, idx) => (
				<React.Fragment key={idx}>
					{idx > 0 && (
						<svg className="w-3 h-3 text-slate-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
						</svg>
					)}
					<button
						onClick={() => onNavigate?.(seg.fullDn)}
						title={seg.fullDn}
						className="text-[10px] px-1.5 py-0.5 rounded font-mono whitespace-nowrap
							text-slate-400 hover:text-blue-300 hover:bg-blue-500/10 transition-all"
					>
						{seg.rdn}
					</button>
				</React.Fragment>
			))}
			<button
				onClick={handleCopy}
				title="Copy full DN"
				className="ml-1 p-0.5 rounded text-slate-600 hover:text-slate-300 transition-all flex-shrink-0"
			>
				<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
						d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
				</svg>
			</button>
		</div>
	);
};

export default DnBreadcrumb;
