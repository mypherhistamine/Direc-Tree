import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";

export interface Bookmark {
	dn: string;
	label: string;
	addedAt: number;
}

const BOOKMARKS_KEY = "directree_bookmarks";

function loadBookmarks(profileId?: string): Bookmark[] {
	try {
		const raw = localStorage.getItem(BOOKMARKS_KEY);
		if (!raw) return [];
		const all: Record<string, Bookmark[]> = JSON.parse(raw);
		return all[profileId ?? "__default"] ?? [];
	} catch { return []; }
}

function persistBookmarks(bookmarks: Bookmark[], profileId?: string) {
	try {
		const raw = localStorage.getItem(BOOKMARKS_KEY);
		const all: Record<string, Bookmark[]> = raw ? JSON.parse(raw) : {};
		all[profileId ?? "__default"] = bookmarks;
		localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(all));
	} catch { /* ignore */ }
}

interface BookmarksPanelProps {
	profileId?: string;
	/** Currently selected DN — used for "add current" */
	currentDn?: string | null;
	/** Callback to navigate to a bookmarked DN */
	onNavigate?: (dn: string) => void;
}

const BookmarksPanel: React.FC<BookmarksPanelProps> = ({
	profileId,
	currentDn,
	onNavigate,
}) => {
	const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
	const [isOpen, setIsOpen] = useState(false);
	const panelRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		setBookmarks(loadBookmarks(profileId));
	}, [profileId]);

	// Close on outside click
	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
				setIsOpen(false);
			}
		};
		if (isOpen) document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [isOpen]);

	const isBookmarked = useMemo(
		() => currentDn ? bookmarks.some((b) => b.dn === currentDn) : false,
		[bookmarks, currentDn]
	);

	const toggleBookmark = useCallback(() => {
		if (!currentDn) return;
		let updated: Bookmark[];
		if (isBookmarked) {
			updated = bookmarks.filter((b) => b.dn !== currentDn);
		} else {
			const label = currentDn.split(",")[0];
			updated = [...bookmarks, { dn: currentDn, label, addedAt: Date.now() }];
		}
		setBookmarks(updated);
		persistBookmarks(updated, profileId);
	}, [currentDn, isBookmarked, bookmarks, profileId]);

	const removeBookmark = useCallback(
		(dn: string) => {
			const updated = bookmarks.filter((b) => b.dn !== dn);
			setBookmarks(updated);
			persistBookmarks(updated, profileId);
		},
		[bookmarks, profileId]
	);

	return (
		<div className="relative" ref={panelRef}>
			{/* Star / Bookmark toggle button */}
			<button
				onClick={() => setIsOpen(!isOpen)}
				title={`Bookmarks (${bookmarks.length})`}
				className={`p-1.5 rounded-lg transition-all border
					${isOpen
						? "bg-amber-500/20 text-amber-300 border-amber-500/40"
						: "bg-slate-700/40 text-slate-400 border-slate-600/30 hover:bg-slate-600/50 hover:text-slate-200"
					}`}
			>
				<svg className="w-4 h-4" fill={bookmarks.length > 0 ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
						d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
				</svg>
			</button>

			{/* Dropdown */}
			{isOpen && (
				<div className="absolute top-full left-0 mt-1 z-50 w-72 max-h-80
					bg-slate-800 border border-slate-700/60 rounded-lg shadow-xl
					flex flex-col overflow-hidden">
					{/* Bookmark current node */}
					{currentDn && (
						<button
							onClick={toggleBookmark}
							className="px-3 py-2 text-xs border-b border-slate-700/50 flex items-center gap-2
								hover:bg-slate-700/50 transition-colors text-left"
						>
							{isBookmarked ? (
								<>
									<svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
											d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
									</svg>
									<span className="text-amber-300">Remove bookmark for current node</span>
								</>
							) : (
								<>
									<svg className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
											d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
									</svg>
									<span className="text-slate-300">Bookmark current node</span>
								</>
							)}
						</button>
					)}

					{/* List */}
					{bookmarks.length === 0 ? (
						<div className="px-3 py-4 text-center text-xs text-slate-500">
							No bookmarks yet
						</div>
					) : (
						<div className="overflow-y-auto custom-scrollbar flex-1">
							{bookmarks.map((b) => (
								<div key={b.dn}
									className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-700/50 transition-colors group"
								>
									<button
										onClick={() => { onNavigate?.(b.dn); setIsOpen(false); }}
										className="flex-1 min-w-0 text-left"
									>
										<p className="text-xs text-slate-300 truncate font-medium">{b.label}</p>
										<p className="text-[10px] text-slate-500 truncate font-mono">{b.dn}</p>
									</button>
									<button
										onClick={() => removeBookmark(b.dn)}
										className="flex-shrink-0 p-0.5 text-slate-600 hover:text-red-400
											opacity-0 group-hover:opacity-100 transition-all"
									>
										<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
										</svg>
									</button>
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
};

export default BookmarksPanel;
