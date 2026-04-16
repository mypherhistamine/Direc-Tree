import React from "react";
import { LdapProfile } from "../models/LdapProfile";

interface ProfileFormModalProps {
	profile: LdapProfile;
	isEdit: boolean;
	saving: boolean;
	onUpdate: (field: keyof LdapProfile, value: string) => void;
	onSave: () => void;
	onClose: () => void;
}

const ProfileFormModal: React.FC<ProfileFormModalProps> = ({
	profile,
	isEdit,
	saving,
	onUpdate,
	onSave,
	onClose,
}) => {
	const fields = [
		["name", "Profile Name", "My LDAP Server", "text"],
		["url", "Server URL", "ldap://hostname:389", "text"],
		["bindDn", "Bind DN", "cn=admin,dc=example,dc=com", "text"],
		["password", "Password", "••••••••", "password"],
		["baseDn", "Base DN (optional)", "dc=example,dc=com", "text"],
	] as const;

	const canSave = !saving && profile.name.trim() !== "" && profile.url.trim() !== "" && profile.bindDn.trim() !== "";

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
			<div className="bg-slate-800 border border-slate-700/60 rounded-2xl shadow-2xl w-full max-w-md mx-4">
				{/* Modal header */}
				<div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
					<h2 className="text-base font-semibold text-slate-200">
						{isEdit ? "Edit Profile" : "New Profile"}
					</h2>
					<button onClick={onClose} className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-colors">
						<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				{/* Modal body */}
				<div className="px-6 py-5 space-y-4">
					{fields.map(([field, label, placeholder, type]) => (
						<div key={field}>
							<label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
							<input
								type={type}
								value={profile[field]}
								onChange={(e) => onUpdate(field, e.target.value)}
								placeholder={placeholder}
								className="w-full px-3 py-2 rounded-lg text-sm
									bg-slate-900/60 border border-slate-700/60 text-slate-200
									placeholder-slate-600
									focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20
									transition-all"
							/>
						</div>
					))}
				</div>

				{/* Modal footer */}
				<div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-700/50">
					<button
						onClick={onClose}
						className="px-4 py-2 rounded-lg text-sm text-slate-400
							hover:bg-slate-700/40 transition-colors"
					>
						Cancel
					</button>
					<button
						onClick={onSave}
						disabled={!canSave}
						className="px-5 py-2 rounded-lg text-sm font-medium
							bg-blue-500 text-white hover:bg-blue-400
							disabled:opacity-40 disabled:pointer-events-none
							transition-colors"
					>
						{saving ? "Saving…" : "Save"}
					</button>
				</div>
			</div>
		</div>
	);
};

export default ProfileFormModal;
