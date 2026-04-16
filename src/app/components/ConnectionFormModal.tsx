import React, { useState, useEffect, useRef } from "react";
import { ConnectionNode } from "../models/ConnectionTree";

interface ConnectionFormModalProps {
	open: boolean;
	initial?: Partial<ConnectionNode>;
	isEdit: boolean;
	onSave: (conn: Omit<ConnectionNode, "id" | "type">) => void;
	onCancel: () => void;
}

const ConnectionFormModal: React.FC<ConnectionFormModalProps> = ({
	open,
	initial,
	isEdit,
	onSave,
	onCancel,
}) => {
	const [name, setName] = useState("");
	const [url, setUrl] = useState("ldap://localhost:389");
	const [bindDn, setBindDn] = useState("");
	const [password, setPassword] = useState("");
	const [baseDn, setBaseDn] = useState("");
	const [noTlsVerify, setNoTlsVerify] = useState(false);
	const nameRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (open) {
			setName(initial?.name ?? "");
			setUrl(initial?.url ?? "ldap://localhost:389");
			setBindDn(initial?.bindDn ?? "");
			setPassword(initial?.password ?? "");
			setBaseDn(initial?.baseDn ?? "");
			setNoTlsVerify(initial?.noTlsVerify ?? false);
			setTimeout(() => nameRef.current?.focus(), 50);
		}
	}, [open, initial]);

	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [open, onCancel]);

	if (!open) return null;

	const canSave = name.trim() && url.trim() && bindDn.trim();

	const fields: Array<[string, string, string, string, string, (v: string) => void]> = [
		["name", "Connection Name", "My LDAP Server", "text", name, setName],
		["url", "Server URL", "ldap://hostname:389", "text", url, setUrl],
		["bindDn", "Bind DN", "cn=admin,dc=example,dc=com", "text", bindDn, setBindDn],
		["password", "Password", "••••••••", "password", password, setPassword],
		["baseDn", "Base DN (optional)", "dc=example,dc=com", "text", baseDn, setBaseDn],
	];

	return (
		<div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
			<div className="bg-slate-800 border border-slate-700/60 rounded-2xl shadow-2xl w-full max-w-md mx-4">
				<div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
					<h2 className="text-base font-semibold text-slate-200">
						{isEdit ? "Edit Connection" : "New Connection"}
					</h2>
					<button onClick={onCancel} className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-colors">
						<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				<div className="px-6 py-5 space-y-4">
					{fields.map(([key, label, placeholder, type, value, setter]) => (
						<div key={key}>
							<label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
							<input
								ref={key === "name" ? nameRef : undefined}
								type={type}
								value={value}
								onChange={(e) => setter(e.target.value)}
								placeholder={placeholder}
								className="w-full px-3 py-2 rounded-lg text-sm bg-slate-900/60 border border-slate-700/60 text-slate-200 placeholder-slate-600
									focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
							/>
						</div>
					))}

					{/* TLS verify toggle */}
					<label className="flex items-center gap-2 cursor-pointer">
						<input
							type="checkbox"
							checked={noTlsVerify}
							onChange={(e) => setNoTlsVerify(e.target.checked)}
							className="w-4 h-4 rounded border-slate-600 bg-slate-900/60 text-blue-500 focus:ring-blue-500/20"
						/>
						<span className="text-xs text-slate-400">Skip TLS certificate verification</span>
					</label>
				</div>

				<div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-700/50">
					<button onClick={onCancel}
						className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-700/40 transition-colors">
						Cancel
					</button>
					<button
						onClick={() => canSave && onSave({ name: name.trim(), url: url.trim(), bindDn: bindDn.trim(), password, baseDn: baseDn.trim(), noTlsVerify })}
						disabled={!canSave}
						className="px-5 py-2 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-400
							disabled:opacity-40 disabled:pointer-events-none transition-colors">
						{isEdit ? "Save" : "Create"}
					</button>
				</div>
			</div>
		</div>
	);
};

export default ConnectionFormModal;
