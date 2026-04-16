import React, { useEffect, useRef } from "react";

interface ConfirmDialogProps {
	open: boolean;
	title: string;
	message: string;
	confirmLabel?: string;
	confirmColor?: string;
	onConfirm: () => void;
	onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
	open,
	title,
	message,
	confirmLabel = "Confirm",
	confirmColor = "bg-red-500 hover:bg-red-400",
	onConfirm,
	onCancel,
}) => {
	const confirmRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (open) confirmRef.current?.focus();
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") onCancel();
			if (e.key === "Enter") onConfirm();
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [open, onCancel, onConfirm]);

	if (!open) return null;

	return (
		<div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
			<div className="bg-slate-800 border border-slate-700/60 rounded-2xl shadow-2xl w-full max-w-sm mx-4">
				<div className="px-6 py-4 border-b border-slate-700/50">
					<h2 className="text-sm font-semibold text-slate-200">{title}</h2>
				</div>
				<div className="px-6 py-5">
					<p className="text-xs text-slate-400 leading-relaxed">{message}</p>
				</div>
				<div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-700/50">
					<button onClick={onCancel}
						className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-700/40 transition-colors">
						Cancel
					</button>
					<button ref={confirmRef} onClick={onConfirm}
						className={`px-5 py-2 rounded-lg text-sm font-medium text-white transition-colors ${confirmColor}`}>
						{confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
};

export default ConfirmDialog;
