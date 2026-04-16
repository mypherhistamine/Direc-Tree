import React, { useState, useEffect, useRef } from "react";

interface FolderNameDialogProps {
	open: boolean;
	title: string;
	initialName?: string;
	onSave: (name: string) => void;
	onCancel: () => void;
}

const FolderNameDialog: React.FC<FolderNameDialogProps> = ({
	open,
	title,
	initialName = "",
	onSave,
	onCancel,
}) => {
	const [name, setName] = useState(initialName);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (open) {
			setName(initialName);
			setTimeout(() => inputRef.current?.focus(), 50);
		}
	}, [open, initialName]);

	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") onCancel();
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [open, onCancel]);

	if (!open) return null;

	return (
		<div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
			<div className="bg-slate-800 border border-slate-700/60 rounded-2xl shadow-2xl w-full max-w-sm mx-4">
				<div className="px-6 py-4 border-b border-slate-700/50">
					<h2 className="text-sm font-semibold text-slate-200">{title}</h2>
				</div>
				<div className="px-6 py-5">
					<label className="block text-xs font-medium text-slate-400 mb-1.5">Folder Name</label>
					<input
						ref={inputRef}
						type="text"
						value={name}
						onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onSave(name.trim()); }}
						placeholder="My Servers"
						className="w-full px-3 py-2 rounded-lg text-sm bg-slate-900/60 border border-slate-700/60 text-slate-200 placeholder-slate-600
							focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
					/>
				</div>
				<div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-700/50">
					<button onClick={onCancel}
						className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-700/40 transition-colors">
						Cancel
					</button>
					<button onClick={() => { if (name.trim()) onSave(name.trim()); }}
						disabled={!name.trim()}
						className="px-5 py-2 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-400 disabled:opacity-40 disabled:pointer-events-none transition-colors">
						Save
					</button>
				</div>
			</div>
		</div>
	);
};

export default FolderNameDialog;
