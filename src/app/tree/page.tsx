'use client'
import { loggedInvoke } from "../utils/loggedInvoke";
import { log } from "../utils/logger";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LdapTreeView from "../components/LdapTreeView";
import { LdapNode } from "../models/LdapNode";
import { setConnectionStatus, ACTIVE_PROFILE_KEY } from "../models/ConnectionTree";

export default function TreePage() {
	const router = useRouter();
	const [ldapTree, setLdapTree] = useState<LdapNode[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [connecting, setConnecting] = useState(true);
	const [profileName, setProfileName] = useState<string>("");

	useEffect(() => {
		const init = async () => {
			try {
				const raw = localStorage.getItem(ACTIVE_PROFILE_KEY);
				if (!raw) {
					router.push("/");
					return;
				}
				const profile = JSON.parse(raw);
				setProfileName(profile.name ?? "");

				// Reuse existing connection if still alive
				const alreadyConnected = await loggedInvoke<boolean>("is_ldap_connected");
				if (!alreadyConnected) {
				await loggedInvoke("connect_ldap", {
						url: profile.url,
						bindDn: profile.bindDn,
						password: profile.password,
						noTlsVerify: profile.noTlsVerify ?? false,
					});
				}

				// Update status to connected
				setConnectionStatus(profile.id, "connected");

				// Fetch initial tree
				log.info("tree-page: connected, fetching initial tree");
				const tree = await loggedInvoke<LdapNode[]>("fetch_ldap_tree", {
					baseDn: profile.baseDn ?? "",
				});
				setLdapTree(tree);
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				log.error("tree-page: connection failed", { error: message });
				setError(message);
				// Update status to error
				try {
					const raw = localStorage.getItem(ACTIVE_PROFILE_KEY);
					if (raw) {
						const profile = JSON.parse(raw);
						setConnectionStatus(profile.id, "error", message);
					}
				} catch { /* */ }
			} finally {
				setConnecting(false);
			}
		};
		init();
	}, [router]);

	if (connecting) {
		return (
			<main className="h-screen w-screen overflow-hidden bg-slate-900 flex items-center justify-center">
				<div className="flex flex-col items-center gap-4 text-slate-400">
					<div className="w-10 h-10 border-2 border-slate-600 border-t-blue-400 rounded-full animate-spin" />
					<p className="text-sm">Connecting to LDAP server…</p>
					{profileName && (
						<p className="text-xs text-slate-500">Profile: {profileName}</p>
					)}
				</div>
			</main>
		);
	}

	if (error) {
		return (
			<main className="h-screen w-screen overflow-hidden bg-slate-900 flex items-center justify-center">
				<div className="flex flex-col items-center gap-4 max-w-md px-6">
					<div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center">
						<svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
						</svg>
					</div>
					<h2 className="text-lg font-semibold text-slate-200">Connection Failed</h2>
					<p className="text-sm text-red-400 text-center font-mono bg-red-500/10 border border-red-500/20 rounded-lg p-3 w-full break-all">
						{error}
					</p>
					<button
						onClick={() => router.push("/")}
						className="mt-2 px-6 py-2.5 rounded-lg text-sm font-medium
							bg-slate-700 text-slate-200 border border-slate-600
							hover:bg-slate-600 transition-colors"
					>
						&larr; Back to Profiles
					</button>
				</div>
			</main>
		);
	}

	return (
		<main className="h-screen w-screen overflow-hidden bg-slate-900">
			<LdapTreeView treeData={ldapTree} />
		</main>
	);
}
