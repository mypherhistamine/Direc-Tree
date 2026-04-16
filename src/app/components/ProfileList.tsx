import React from "react";
import { LdapProfile } from "../models/LdapProfile";

interface ProfileListProps {
	profiles: LdapProfile[];
	connectingId: string | null;
	onEdit: (profile: LdapProfile) => void;
	onDelete: (id: string) => void;
	onConnect: (profile: LdapProfile) => void;
}

const ProfileList: React.FC<ProfileListProps> = ({
	profiles,
	connectingId,
	onEdit,
	onDelete,
	onConnect,
}) => {
	if (profiles.length === 0) {
		return (
			<div className="text-center py-20">
				<div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
					<svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
							d="M5 12h14M12 5l7 7-7 7" />
					</svg>
				</div>
				<p className="text-slate-400 font-medium">No connection profiles yet</p>
				<p className="text-sm text-slate-500 mt-1">Create one to get started browsing LDAP directories</p>
			</div>
		);
	}

	return (
		<div className="grid gap-3">
			{profiles.map((p) => (
				<div
					key={p.id}
					className="group flex items-center justify-between p-4 rounded-xl
						bg-slate-800/60 border border-slate-700/50
						hover:border-slate-600/60 hover:bg-slate-800/80
						transition-all duration-200"
				>
					<div className="min-w-0 flex-1">
						<h3 className="text-sm font-semibold text-slate-200 truncate">{p.name || "Unnamed"}</h3>
						<p className="text-xs text-slate-400 font-mono mt-0.5 truncate">{p.url}</p>
						{p.baseDn && (
							<p className="text-[11px] text-slate-500 mt-0.5 truncate">Base: {p.baseDn}</p>
						)}
					</div>

					<div className="flex items-center gap-1.5 ml-4 flex-shrink-0">
						<button
							onClick={() => onEdit(p)}
							title="Edit"
							className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700/60 transition-colors"
						>
							<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
									d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
							</svg>
						</button>
						<button
							onClick={() => onDelete(p.id)}
							title="Delete"
							className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
						>
							<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
									d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
							</svg>
						</button>
						<button
							onClick={() => onConnect(p)}
							disabled={connectingId === p.id}
							className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium
								bg-emerald-500/15 text-emerald-400 border border-emerald-500/25
								hover:bg-emerald-500/25 hover:border-emerald-500/40
								disabled:opacity-50 transition-all"
						>
							{connectingId === p.id ? (
								<div className="w-3.5 h-3.5 border-2 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" />
							) : (
								<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
								</svg>
							)}
							Connect
						</button>
					</div>
				</div>
			))}
		</div>
	);
};

export default ProfileList;
