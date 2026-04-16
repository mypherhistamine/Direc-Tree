import { Suspense } from "react";
import SchemaPageClient from "./SchemaPageClient";

export default function SchemaPage() {
	return (
		<Suspense
			fallback={
				<main className="h-screen w-screen overflow-hidden bg-slate-900 flex items-center justify-center">
					<div className="flex flex-col items-center gap-4 text-slate-400">
						<div className="w-10 h-10 border-2 border-slate-600 border-t-purple-400 rounded-full animate-spin" />
						<p className="text-sm">Loading schema browser…</p>
					</div>
				</main>
			}
		>
			<SchemaPageClient />
		</Suspense>
	);
}
