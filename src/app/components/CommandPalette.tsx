import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";

interface CommandItem {
	id: string;
	label: string;
	icon?: React.ReactNode;
	shortcut?: string;
	action: () => void;
}

interface CommandPaletteProps {
	open: boolean;
	onClose: () => void;
	commands: CommandItem[];
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, commands }) => {
	const [query, setQuery] = useState("");
	const [selectedIdx, setSelectedIdx] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	const filtered = useMemo(() => {
		if (!query.trim()) return commands;
		const lower = query.toLowerCase();
		return commands.filter((c) => c.label.toLowerCase().includes(lower));
	}, [commands, query]);

	useEffect(() => {
		if (open) {
			setQuery("");
			setSelectedIdx(0);
			setTimeout(() => inputRef.current?.focus(), 50);
		}
	}, [open]);

	useEffect(() => {
		setSelectedIdx(0);
	}, [filtered]);

	// Scroll selected into view
	useEffect(() => {
		if (!listRef.current) return;
		const el = listRef.current.children[selectedIdx] as HTMLElement;
		el?.scrollIntoView({ block: "nearest" });
	}, [selectedIdx]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setSelectedIdx((prev) => Math.min(prev + 1, filtered.length - 1));
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				setSelectedIdx((prev) => Math.max(prev - 1, 0));
			} else if (e.key === "Enter") {
				e.preventDefault();
				if (filtered[selectedIdx]) {
					filtered[selectedIdx].action();
					onClose();
				}
			} else if (e.key === "Escape") {
				onClose();
			}
		},
		[filtered, selectedIdx, onClose]
	);

	if (!open) return null;

	return (
		<div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm"
			onClick={onClose}>
			<div
				className="bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl w-[min(90vw,520px)] overflow-hidden"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Input */}
				<div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-2">
					<svg className="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
							d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
					</svg>
					<input
						ref={inputRef}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Type a command…"
						className="flex-1 text-sm bg-transparent text-slate-200 placeholder-slate-500 outline-none"
					/>
					<kbd className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700/50 text-slate-500">
						ESC
					</kbd>
				</div>

				{/* Results */}
				<div ref={listRef} className="max-h-[50vh] overflow-y-auto custom-scrollbar py-1">
					{filtered.length === 0 ? (
						<div className="px-4 py-6 text-center text-xs text-slate-500">
							No matching commands
						</div>
					) : (
						filtered.map((cmd, idx) => (
							<button
								key={cmd.id}
								onClick={() => { cmd.action(); onClose(); }}
								className={`w-full text-left px-4 py-2 flex items-center gap-3 transition-colors
									${idx === selectedIdx ? "bg-blue-500/15 text-blue-200" : "text-slate-300 hover:bg-slate-800/80"}`}
							>
								{cmd.icon && <span className="w-4 h-4 flex-shrink-0 text-slate-500">{cmd.icon}</span>}
								<span className="flex-1 text-sm truncate">{cmd.label}</span>
								{cmd.shortcut && (
									<kbd className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700/50 text-slate-500 flex-shrink-0">
										{cmd.shortcut}
									</kbd>
								)}
							</button>
						))
					)}
				</div>
			</div>
		</div>
	);
};

export default CommandPalette;
