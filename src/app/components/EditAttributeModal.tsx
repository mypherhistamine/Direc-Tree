import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { loggedInvoke } from "../utils/loggedInvoke";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

interface EditAttributeModalProps {
	open: boolean;
	onClose: () => void;
	dn: string;
	attributeName: string | null;
	currentValue: string | null;
	onSaved: () => void;
}

type OpMode = "replace" | "add" | "delete";

/* ── helpers ── */

function isValidBase64(s: string): boolean {
	try {
		return btoa(atob(s)) === s.replace(/\s/g, "");
	} catch {
		return false;
	}
}

function base64ByteSize(s: string): number | null {
	try {
		return atob(s).length;
	} catch {
		return null;
	}
}

/* ── component ── */

const EditAttributeModal: React.FC<EditAttributeModalProps> = ({
	open,
	onClose,
	dn,
	attributeName,
	currentValue,
	onSaved,
}) => {
	const [attrName, setAttrName] = useState(attributeName ?? "");
	const [values, setValues] = useState<string[]>([currentValue ?? ""]);
	const [opMode, setOpMode] = useState<OpMode>("replace");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [fullscreen, setFullscreen] = useState(false);
	const [wordWrap, setWordWrap] = useState(true);
	const [treatAsBinary, setTreatAsBinary] = useState(false);
	const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
	const [dirty, setDirty] = useState(false);
	const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
	const originalRef = useRef<string[]>([]);

	/* reset when modal opens */
	useEffect(() => {
		if (open) {
			const initial = currentValue ? [currentValue] : [""];
			setAttrName(attributeName ?? "");
			setValues(initial);
			originalRef.current = initial;
			setOpMode(attributeName ? "replace" : "add");
			setError(null);
			setFullscreen(false);
			setTreatAsBinary(false);
			setDirty(false);
		}
	}, [open, attributeName, currentValue]);

	/* dirty tracking */
	useEffect(() => {
		setDirty(JSON.stringify(values) !== JSON.stringify(originalRef.current));
	}, [values]);

	/* keyboard: Esc / Ctrl+Enter / Ctrl+Shift+F */
	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") { e.preventDefault(); handleClose(); }
			if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); handleSave(); }
			if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "F") { e.preventDefault(); setFullscreen((v) => !v); }
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, dirty]);

	const handleClose = useCallback(() => {
		if (dirty && !window.confirm("You have unsaved changes. Discard?")) return;
		onClose();
	}, [dirty, onClose]);

	const setValueAt = useCallback((idx: number, val: string) => {
		setValues((prev) => { const n = [...prev]; n[idx] = val; return n; });
	}, []);
	const addValue = useCallback(() => {
		setValues((prev) => [...prev, ""]);
		setTimeout(() => textareaRefs.current[textareaRefs.current.length]?.focus(), 50);
	}, []);
	const removeValue = useCallback((idx: number) => {
		setValues((prev) => prev.filter((_, i) => i !== idx));
	}, []);
	const copyValue = useCallback(async (idx: number) => {
		try { await writeText(values[idx]); setCopiedIdx(idx); setTimeout(() => setCopiedIdx(null), 1500); } catch { /* */ }
	}, [values]);

	const b64Info = useMemo(() => {
		if (!treatAsBinary) return null;
		return values.map((v) => {
			const valid = isValidBase64(v.trim());
			return { valid, size: valid ? base64ByteSize(v.trim()) : null };
		});
	}, [values, treatAsBinary]);

	const handleSave = useCallback(async () => {
		if (!attrName.trim()) { setError("Attribute name is required"); return; }
		if (treatAsBinary) {
			for (let i = 0; i < values.length; i++) {
				if (values[i].trim() && !isValidBase64(values[i].trim())) {
					setError(`Value ${i + 1} is not valid Base64`); return;
				}
			}
		}
		setSaving(true); setError(null);
		try {
			const sendValues = opMode === "delete" && values.every((v) => v.trim() === "")
				? []
				: values.filter((v) => v.trim() !== "" || opMode !== "add");
			await loggedInvoke("modify_ldap_entry", {
				dn,
				modifications: [{ op: opMode, attribute: attrName.trim(), values: sendValues }],
			});
			onSaved(); onClose();
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : String(err));
		} finally { setSaving(false); }
	}, [dn, attrName, values, opMode, onSaved, onClose, treatAsBinary]);

	if (!open) return null;

	const modalSize = fullscreen
		? "fixed inset-4 z-50"
		: "w-[min(1000px,95vw)] max-h-[80vh]";

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={handleClose}>
			<div className={`bg-slate-800 border border-slate-700/50 rounded-xl shadow-2xl flex flex-col ${modalSize}`} onClick={(e) => e.stopPropagation()}>

				{/* ═══ Header ═══ */}
				<div className="px-5 py-3 border-b border-slate-700/50 flex items-center gap-3 flex-shrink-0">
					<svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
							d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
					</svg>
					<h2 className="text-sm font-semibold text-slate-200">
						{attributeName ? "Edit Attribute" : "Add Attribute"}
					</h2>
					{dirty && (
						<span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
							Modified
						</span>
					)}
					<div className="flex-1" />

					{/* fullscreen toggle */}
					<button onClick={() => setFullscreen((v) => !v)}
						title={fullscreen ? "Exit fullscreen (Ctrl+Shift+F)" : "Fullscreen (Ctrl+Shift+F)"}
						className="p-1.5 rounded-lg text-slate-400 bg-slate-700/40 border border-slate-600/30 hover:bg-slate-600/50 hover:text-slate-200 transition-all">
						{fullscreen ? (
							<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
									d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
							</svg>
						) : (
							<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
									d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
							</svg>
						)}
					</button>

					<button onClick={handleClose}
						className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-all">
						<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				{/* ═══ Body ═══ */}
				<div className="flex-1 overflow-auto custom-scrollbar px-5 py-4 space-y-4 min-h-0">
					{/* DN (compact row) */}
					<div className="flex items-start gap-2">
						<label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold pt-1.5 flex-shrink-0 w-20">Entry DN</label>
						<p className="text-xs text-slate-400 font-mono break-all bg-slate-900/50 rounded-lg p-2 border border-slate-700/40 flex-1">{dn}</p>
					</div>

					{/* Operation + Name row */}
					<div className="flex gap-4">
						<div className="flex-shrink-0">
							<label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block mb-1.5">Operation</label>
							<div className="flex gap-1">
								{([
									{ key: "replace", label: "Replace" },
									{ key: "add", label: "Add" },
									{ key: "delete", label: "Delete" },
								] as const).map((o) => (
									<button key={o.key} onClick={() => setOpMode(o.key)}
										className={`text-xs px-3 py-1.5 rounded-lg border transition-all font-medium
											${opMode === o.key
												? o.key === "delete" ? "bg-red-500/20 text-red-300 border-red-500/30" : "bg-blue-500/20 text-blue-300 border-blue-500/30"
												: "bg-slate-700/40 text-slate-400 border-slate-600/30 hover:bg-slate-600/50 hover:text-slate-200"}`}>
										{o.label}
									</button>
								))}
							</div>
						</div>
						<div className="flex-1">
							<label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block mb-1.5">Attribute Name</label>
							<input value={attrName} onChange={(e) => setAttrName(e.target.value)} readOnly={!!attributeName}
								className={`w-full text-sm px-3 py-1.5 rounded-lg border font-mono transition-all bg-slate-900/50 border-slate-700/50 text-slate-200 focus:border-blue-500/50 focus:outline-none ${attributeName ? "opacity-60 cursor-not-allowed" : ""}`}
								placeholder="e.g. description" />
						</div>
					</div>

					{/* Toolbar */}
					<div className="flex items-center gap-2 flex-wrap">
						<label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Values ({values.length})</label>
						<div className="flex-1" />
						<button onClick={() => setWordWrap((v) => !v)} title={wordWrap ? "Disable word wrap" : "Enable word wrap"}
							className={`text-[10px] px-2 py-1 rounded-md border transition-all font-medium ${wordWrap ? "bg-blue-500/20 text-blue-300 border-blue-500/30" : "bg-slate-700/40 text-slate-500 border-slate-600/30 hover:text-slate-300"}`}>
							{wordWrap ? "Wrap ✓" : "Wrap"}
						</button>
						<button onClick={() => setTreatAsBinary((v) => !v)} title="Treat value as Base64-encoded binary"
							className={`text-[10px] px-2 py-1 rounded-md border transition-all font-medium ${treatAsBinary ? "bg-purple-500/20 text-purple-300 border-purple-500/30" : "bg-slate-700/40 text-slate-500 border-slate-600/30 hover:text-slate-300"}`}>
							{treatAsBinary ? "Base64 ✓" : "Base64"}
						</button>
						<button onClick={addValue}
							className="text-[10px] px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all font-medium">
							+ Add Value
						</button>
					</div>

					{/* Delete-all hint */}
					{opMode === "delete" && values.every((v) => v.trim() === "") && (
						<div className="text-xs text-slate-500 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
							This will remove the entire <span className="font-mono text-red-300">{attrName}</span> attribute from the entry.
						</div>
					)}

					{/* ═══ Value editors ═══ */}
					<div className="space-y-3 flex-1 min-h-0">
						{values.map((val, idx) => (
							<div key={idx} className="relative group/val">
								{/* value header */}
								<div className="flex items-center gap-2 mb-1">
									<span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
										{values.length > 1 ? `Value ${idx + 1}` : "Value"}
									</span>
									<div className="flex-1" />
									<button onClick={() => copyValue(idx)} title="Copy value"
										className={`text-[10px] px-1.5 py-0.5 rounded border transition-all ${copiedIdx === idx ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-slate-700/40 text-slate-400 border-slate-600/30 hover:bg-slate-600/50 hover:text-slate-200"}`}>
										{copiedIdx === idx ? "Copied!" : "Copy"}
									</button>
									{values.length > 1 && (
										<button onClick={() => removeValue(idx)} title="Remove this value"
											className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all">
											Remove
										</button>
									)}
								</div>

								<textarea
									ref={(el) => { textareaRefs.current[idx] = el; }}
									value={val}
									onChange={(e) => setValueAt(idx, e.target.value)}
									className={`w-full text-sm px-3 py-2 rounded-lg border font-mono transition-all bg-slate-900/50 border-slate-700/50 text-slate-200 focus:border-blue-500/50 focus:outline-none resize-none ${wordWrap ? "whitespace-pre-wrap break-all" : "whitespace-pre overflow-x-auto"}`}
									style={{
										minHeight: fullscreen ? "200px" : "100px",
										height: fullscreen
											? `max(200px, calc(80vh - ${values.length > 1 ? "420" : "350"}px))`
											: values.length === 1 ? "240px" : "100px",
									}}
									placeholder="Attribute value"
									spellCheck={false}
								/>

								{/* Base64 validation info */}
								{treatAsBinary && b64Info && b64Info[idx] && (
									<div className={`mt-1 text-[10px] ${b64Info[idx].valid ? "text-emerald-400" : "text-red-400"}`}>
										{b64Info[idx].valid
											? `✓ Valid Base64 · ${b64Info[idx].size?.toLocaleString()} decoded bytes`
											: "✗ Invalid Base64 encoding"}
									</div>
								)}
							</div>
						))}
					</div>

					{/* Error */}
					{error && (
						<div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 font-mono break-all">
							{error}
						</div>
					)}
				</div>

				{/* ═══ Footer ═══ */}
				<div className="px-5 py-3 border-t border-slate-700/50 flex items-center gap-2 flex-shrink-0">
					<span className="text-[10px] text-slate-600">Ctrl+Enter save · Esc close · Ctrl+Shift+F fullscreen</span>
					<div className="flex-1" />
					<button onClick={handleClose}
						className="text-xs px-4 py-2 rounded-lg bg-slate-700/40 text-slate-300 border border-slate-600/30 hover:bg-slate-600/50 transition-all">
						Cancel
					</button>
					<button onClick={handleSave} disabled={saving}
						className={`text-xs px-4 py-2 rounded-lg font-medium border transition-all
							${opMode === "delete" ? "bg-red-500/20 text-red-300 border-red-500/30 hover:bg-red-500/30" : "bg-blue-500/20 text-blue-300 border-blue-500/30 hover:bg-blue-500/30"}
							disabled:opacity-40 disabled:cursor-not-allowed`}>
						{saving ? "Saving…" : opMode === "delete" ? "Delete" : "Save"}
					</button>
				</div>
			</div>
		</div>
	);
};

export default EditAttributeModal;
