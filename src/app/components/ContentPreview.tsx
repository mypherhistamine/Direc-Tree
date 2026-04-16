import React, { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { AttributeType } from "../models/AttributeTypeEnum";
import XmlContentViewer from "./XmlContentViewer";
import JsonView from "@uiw/react-json-view";
import { darkTheme } from "@uiw/react-json-view/dark";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

interface ContentPreviewProps {
	attributeType: AttributeType;
	content: string | null;
	attributeKey: string | null;
	selectedDn?: string | null;
	onReload?: () => Promise<void>;
	isReloading?: boolean;
}

// ═══════════════════════════════════════════════════════════════
//  Magic-byte helpers — never assume base64 = image
// ═══════════════════════════════════════════════════════════════

type BinaryKind =
	| { kind: "image"; format: string; mime: string }
	| { kind: "certificate" }
	| { kind: "unknown" };

/** Attempt base64 → Uint8Array, returning null on failure */
function tryDecodeBase64(b64: string): Uint8Array | null {
	try {
		const bin = atob(b64);
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		return bytes;
	} catch {
		return null;
	}
}

/** Check leading bytes against known image signatures */
function detectBinaryKind(bytes: Uint8Array): BinaryKind {
	const hex = (start: number, len: number) =>
		Array.from(bytes.slice(start, start + len))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("")
			.toUpperCase();

	// PNG: 89 50 4E 47
	if (bytes.length >= 4 && hex(0, 4) === "89504E47")
		return { kind: "image", format: "PNG", mime: "image/png" };
	// JPEG: FF D8 FF
	if (bytes.length >= 3 && hex(0, 3) === "FFD8FF")
		return { kind: "image", format: "JPEG", mime: "image/jpeg" };
	// GIF: 47 49 46 38
	if (bytes.length >= 4 && hex(0, 4) === "47494638")
		return { kind: "image", format: "GIF", mime: "image/gif" };
	// WebP: RIFF....WEBP
	if (bytes.length >= 12 && hex(0, 4) === "52494646" && hex(8, 4) === "57454250")
		return { kind: "image", format: "WebP", mime: "image/webp" };
	// BMP: 42 4D
	if (bytes.length >= 2 && hex(0, 2) === "424D")
		return { kind: "image", format: "BMP", mime: "image/bmp" };
	// ICO: 00 00 01 00
	if (bytes.length >= 4 && hex(0, 4) === "00000100")
		return { kind: "image", format: "ICO", mime: "image/x-icon" };

	// X.509 / ASN.1 DER: starts with 0x30 (SEQUENCE)
	if (bytes.length >= 2 && bytes[0] === 0x30) return { kind: "certificate" };

	return { kind: "unknown" };
}

/** Format a byte array as hex dump (offset | hex | ascii) */
function formatHexDump(bytes: Uint8Array, maxBytes = 512): string {
	const lines: string[] = [];
	const limit = Math.min(bytes.length, maxBytes);
	for (let off = 0; off < limit; off += 16) {
		const chunk = bytes.slice(off, Math.min(off + 16, limit));
		const hexPart = Array.from(chunk)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join(" ")
			.padEnd(48, " ");
		const asciiPart = Array.from(chunk)
			.map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : "."))
			.join("");
		lines.push(`${off.toString(16).padStart(8, "0")}  ${hexPart} |${asciiPart}|`);
	}
	if (bytes.length > maxBytes)
		lines.push(`\n… ${bytes.length - maxBytes} more bytes omitted …`);
	return lines.join("\n");
}

type ViewMode = "auto" | "text" | "hex" | "image";

/** Compute SHA-256 hex digest via Web Crypto */
async function sha256hex(bytes: Uint8Array): Promise<string> {
	const hashBuffer = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/** Try to parse basic ASN.1 DER fields for X.509 certs */
function parseBasicCertFields(bytes: Uint8Array): { subject?: string; issuer?: string; serial?: string; notBefore?: string; notAfter?: string } {
	// This is a best-effort parser for common DER structures
	const result: { subject?: string; issuer?: string; serial?: string; notBefore?: string; notAfter?: string } = {};
	try {
		// Very basic: look for printable ASCII strings within the cert
		const text = Array.from(bytes).map(b => b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".").join("");
		// Try to find CN= patterns
		const cnMatches = text.match(/CN=([^,.]+)/g);
		if (cnMatches && cnMatches.length >= 1) result.subject = cnMatches[cnMatches.length - 1];
		if (cnMatches && cnMatches.length >= 2) result.issuer = cnMatches[0];
		// Serial: first few bytes after the outermost SEQUENCE header
		if (bytes.length > 15) {
			result.serial = Array.from(bytes.slice(4, 12)).map(b => b.toString(16).padStart(2, "0")).join(":");
		}
	} catch { /* best effort */ }
	return result;
}

// ═══════════════════════════════════════════════════════════════
//  Content Preview
// ═══════════════════════════════════════════════════════════════

const ContentPreview: React.FC<ContentPreviewProps> = ({
	attributeType,
	content,
	attributeKey,
	selectedDn,
	onReload,
	isReloading,
}) => {
	const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
	const [viewMode, setViewMode] = useState<ViewMode>("auto");
	const [copied, setCopied] = useState(false);
	const [copyError, setCopyError] = useState<string | null>(null);
	const [wordWrap, setWordWrap] = useState(true);
	const containerRef = useRef<HTMLDivElement>(null);

	// Decode base64 content for analysis (memoised)
	const b64Analysis = useMemo(() => {
		if (attributeType !== AttributeType.Base64 || !content) return null;
		const bytes = tryDecodeBase64(content);
		if (!bytes) return null;
		return { bytes, binaryKind: detectBinaryKind(bytes) };
	}, [attributeType, content]);

	const handleReload = useCallback(async () => {
		if (onReload) {
			await onReload();
			setLastRefreshed(new Date().toLocaleTimeString());
		}
	}, [onReload]);

	/** Build the string to copy based on current view mode + type */
	const getCopyContent = useCallback((): string | null => {
		if (!content) return null;

		// Base64 with sub-modes
		if (attributeType === AttributeType.Base64) {
			if (viewMode === "hex" && b64Analysis?.bytes) return formatHexDump(b64Analysis.bytes, b64Analysis.bytes.length);
			if (viewMode === "text") return content;
			// Auto mode: certificate → summary, image → base64, unknown → base64
			if (b64Analysis?.binaryKind.kind === "certificate" && b64Analysis.bytes) {
				const f = parseBasicCertFields(b64Analysis.bytes);
				const lines = ["X.509 Certificate"];
				if (f.subject) lines.push(`Subject: ${f.subject}`);
				if (f.issuer) lines.push(`Issuer: ${f.issuer}`);
				if (f.serial) lines.push(`Serial: ${f.serial}`);
				lines.push(`Size: ${b64Analysis.bytes.length} bytes`);
				lines.push("", "Base64:", content);
				return lines.join("\n");
			}
			return content; // raw base64 for images / unknown
		}

		// XML: copy as-is (already formatted by the viewer source)
		if (attributeType === AttributeType.Xml) return content;

		// JSON: copy the pretty-printed version
		if (attributeType === AttributeType.Json) {
			try { return JSON.stringify(JSON.parse(content), null, 2); } catch { return content; }
		}

		return content;
	}, [content, attributeType, viewMode, b64Analysis]);

	const handleCopy = useCallback(async () => {
		const text = getCopyContent();
		if (!text) return;
		try {
			await writeText(text);
			setCopied(true);
			setCopyError(null);
			setTimeout(() => setCopied(false), 1500);
		} catch (err) {
			setCopyError(err instanceof Error ? err.message : "Copy failed");
			setTimeout(() => setCopyError(null), 3000);
		}
	}, [getCopyContent]);

	// Ctrl+C when preview panel is focused
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const handler = (e: KeyboardEvent) => {
			// Only intercept if there's no text selection (let native copy work for selections)
			if (e.ctrlKey && e.key === "c" && !window.getSelection()?.toString()) {
				e.preventDefault();
				handleCopy();
			}
		};
		el.addEventListener("keydown", handler);
		return () => el.removeEventListener("keydown", handler);
	}, [handleCopy]);

	/** Determine MIME + extension for download based on actual analysis */
	const downloadMeta = useMemo(() => {
		switch (attributeType) {
			case AttributeType.Xml:
				return { mime: "application/xml", ext: "xml" };
			case AttributeType.Json:
				return { mime: "application/json", ext: "json" };
			case AttributeType.Base64: {
				if (b64Analysis?.binaryKind.kind === "image") {
					const fmt = b64Analysis.binaryKind.format.toLowerCase();
					return { mime: b64Analysis.binaryKind.mime, ext: fmt === "jpeg" ? "jpg" : fmt };
				}
				if (b64Analysis?.binaryKind.kind === "certificate")
					return { mime: "application/x-x509-ca-cert", ext: "cer" };
				return { mime: "application/octet-stream", ext: "bin" };
			}
			default:
				return { mime: "text/plain", ext: "txt" };
		}
	}, [attributeType, b64Analysis]);
	

	const handleDownload = useCallback(() => {
		console.log("content is -> " , content);
		if (!content) return;
		const { mime, ext } = downloadMeta;
		const fileName = `${(attributeKey ?? "content").replace(/[^a-zA-Z0-9_-]/g, "_")}.${ext}`;

		let blob: Blob;
		if (attributeType === AttributeType.Base64 && b64Analysis?.bytes) {
			blob = new Blob([b64Analysis.bytes.buffer as ArrayBuffer], { type: mime });
		} else if (attributeType === AttributeType.Json) {
			try {
				blob = new Blob([JSON.stringify(JSON.parse(content), null, 2)], { type: mime });
			} catch {
				blob = new Blob([content], { type: mime });
			}
		} else {
			blob = new Blob([content], { type: mime });
		}

		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = fileName;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}, [content, attributeType, attributeKey, downloadMeta, b64Analysis]);

	// Reset view mode when content changes
	const prevContentRef = React.useRef(content);
	if (prevContentRef.current !== content) {
		prevContentRef.current = content;
		if (viewMode !== "auto") setViewMode("auto");
	}

	// ─── Empty state ───
	if (!content) {
		return (
			<div className="flex items-center justify-center h-full text-slate-500">
				<div className="flex flex-col items-center gap-2 text-center px-6">
					<svg className="w-12 h-12 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
							d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
					</svg>
					<p className="text-sm font-medium">No content selected</p>
					<p className="text-xs text-slate-600">Click an attribute to preview its value</p>
				</div>
			</div>
		);
	}

	// ─── Type badge ───
	const renderTypeBadge = () => {
		const badges: Record<AttributeType, { label: string; color: string }> = {
			[AttributeType.Xml]: { label: "XML", color: "bg-pink-500/20 text-pink-300 border-pink-500/30" },
			[AttributeType.Json]: { label: "JSON", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
			[AttributeType.Base64]: { label: "BASE64", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
			[AttributeType.String]: { label: "STRING", color: "bg-slate-500/20 text-slate-300 border-slate-500/30" },
		};
		const badge = badges[attributeType];
		return (
			<span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${badge.color}`}>
				{badge.label}
			</span>
		);
	};

	// ─── View mode tabs (only for Base64) ───
	const availableModes: { key: ViewMode; label: string }[] = [{ key: "auto", label: "Auto" }];
	if (attributeType === AttributeType.Base64) {
		availableModes.push({ key: "text", label: "Text" });
		availableModes.push({ key: "hex", label: "Hex" });
		if (b64Analysis?.binaryKind.kind === "image") {
			availableModes.push({ key: "image", label: "Image" });
		}
	}

	// ─── Content renderer ───
	const renderContent = () => {
		// Non-base64 types always use their normal renderer
		if (attributeType === AttributeType.Xml)
			return <XmlContentViewer xml={content} />;
		if (attributeType === AttributeType.Json) {
			try {
				return (
					<div className="p-4 overflow-auto custom-scrollbar h-full">
						<JsonView
							value={JSON.parse(content)}
							displayDataTypes={false}
							style={{ ...darkTheme, backgroundColor: "transparent" }}
						/>
					</div>
				);
			} catch {
				return <PlainTextView content={content} wordWrap={wordWrap} />;
			}
		}
		if (attributeType !== AttributeType.Base64)
			return <PlainTextView content={content} wordWrap={wordWrap} />;

		// --- Base64 handling ---
		const bytes = b64Analysis?.bytes;
		const kind = b64Analysis?.binaryKind;

		// Explicit view mode overrides
		if (viewMode === "text") return <PlainTextView content={content} wordWrap={wordWrap} />;
		if (viewMode === "hex" && bytes)
			return <HexDumpView bytes={bytes} />;
		if (viewMode === "image" && bytes && kind?.kind === "image")
			return <ImageView bytes={bytes} mime={kind.mime} format={kind.format} />;

		// Auto mode
		if (!bytes) return <PlainTextView content={content} wordWrap={wordWrap} />;

		if (kind?.kind === "image")
			return <ImageView bytes={bytes} mime={kind.mime} format={kind.format} />;

		if (kind?.kind === "certificate")
			return <CertificateView bytes={bytes} raw={content} />;

		// Unknown binary
		return <BinaryInfoView bytes={bytes} onSwitchHex={() => setViewMode("hex")} />;
	};

	return (
		<div ref={containerRef} tabIndex={-1} className="flex flex-col h-full outline-none">
			{/* Preview Header */}
			<div className="px-4 py-3 border-b border-slate-700/50 bg-slate-800/50 flex items-center justify-between gap-3">
				<div className="min-w-0 flex-1">
					<p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-0.5">
						Preview
					</p>
					{attributeKey && (
						<p className="text-sm text-slate-200 font-mono truncate" title={attributeKey}>
							{attributeKey}
						</p>
					)}
					{lastRefreshed && (
						<p className="text-[10px] text-slate-500 mt-0.5">
							Last refreshed: {lastRefreshed}
						</p>
					)}
				</div>
				<div className="flex items-center gap-2">
					{renderTypeBadge()}

					{/* View-mode tabs */}
					{availableModes.length > 1 && (
						<div className="flex gap-0.5 bg-slate-800/80 rounded-md p-0.5 border border-slate-700/40">
							{availableModes.map((m) => (
								<button
									key={m.key}
									onClick={() => setViewMode(m.key)}
									className={`text-[10px] px-2 py-0.5 rounded transition-all font-semibold uppercase tracking-wider
										${viewMode === m.key
											? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
											: "text-slate-500 hover:text-slate-300 border border-transparent"
										}`}
								>
									{m.label}
								</button>
							))}
						</div>
					)}

					{/* Content stats */}
					{content && (attributeType === AttributeType.String || attributeType === AttributeType.Base64) && (
						<span className="text-[10px] text-slate-600 font-mono whitespace-nowrap" title={`${content.length} chars, ${new Blob([content]).size} bytes`}>
							{content.length > 1024 ? `${(content.length / 1024).toFixed(1)}K` : content.length} chars
						</span>
					)}

					{/* Word wrap toggle */}
					<button
						onClick={() => setWordWrap(w => !w)}
						title={wordWrap ? "Disable word wrap" : "Enable word wrap"}
						className={`p-1.5 rounded-lg border transition-all duration-150 ${
							wordWrap
								? "bg-blue-500/15 text-blue-300 border-blue-500/25"
								: "text-slate-500 bg-slate-700/40 border-slate-600/30 hover:bg-slate-600/50 hover:text-slate-200"
						}`}
					>
						<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
								d="M3 10h10a4 4 0 010 8H9m4 0l-3-3m3 3l-3 3M3 6h18M3 14h3" />
						</svg>
					</button>

					{/* Copy button */}
					<button
						onClick={handleCopy}
						title="Copy content (Ctrl+C)"
						className={`p-1.5 rounded-lg border transition-all duration-150 ${
							copied
								? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
								: copyError
									? "bg-red-500/20 text-red-300 border-red-500/30"
									: "text-slate-400 bg-slate-700/40 border-slate-600/30 hover:bg-slate-600/50 hover:text-slate-200 hover:border-slate-500/50"
						}`}
					>
						{copied ? (
							<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
							</svg>
						) : (
							<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
									d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
							</svg>
						)}
					</button>

					<button
						onClick={handleReload}
						disabled={!selectedDn || !attributeKey || isReloading}
						title="Reload attribute"
						className="p-1.5 rounded-lg text-slate-400
							bg-slate-700/40 border border-slate-600/30
							hover:bg-slate-600/50 hover:text-slate-200 hover:border-slate-500/50
							disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-slate-700/40
							transition-all duration-150"
					>
						<svg className={`w-4 h-4 ${isReloading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
								d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
						</svg>
					</button>
					<button
						onClick={handleDownload}
						title="Download content"
						className="p-1.5 rounded-lg text-slate-400
							bg-slate-700/40 border border-slate-600/30
							hover:bg-slate-600/50 hover:text-slate-200 hover:border-slate-500/50
							transition-all duration-150"
					>
						<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
								d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
						</svg>
					</button>
				</div>
			</div>

			{/* Content Area */}
			<div className="flex-1 overflow-hidden">
				{renderContent()}
			</div>
		</div>
	);
};

// ═══════════════════════════════════════════════════════════════
//  Sub-views
// ═══════════════════════════════════════════════════════════════

const PlainTextView: React.FC<{ content: string; wordWrap?: boolean }> = ({ content, wordWrap = true }) => (
	<div className={`p-4 h-full overflow-auto custom-scrollbar ${!wordWrap ? "overflow-x-auto" : ""}`}>
		<pre className={`text-sm text-slate-300 font-mono leading-relaxed ${wordWrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"}`}>
			{content}
		</pre>
	</div>
);

const HexDumpView: React.FC<{ bytes: Uint8Array }> = ({ bytes }) => (
	<div className="p-4 h-full overflow-auto custom-scrollbar">
		<pre className="text-xs text-slate-300 font-mono whitespace-pre leading-relaxed">
			{formatHexDump(bytes, 2048)}
		</pre>
	</div>
);

const ImageView: React.FC<{ bytes: Uint8Array; mime: string; format: string }> = ({
	bytes,
	mime,
	format,
}) => {
	const dataUrl = useMemo(() => {
		const binary = Array.from(bytes)
			.map((b) => String.fromCharCode(b))
			.join("");
		return `data:${mime};base64,${btoa(binary)}`;
	}, [bytes, mime]);

	return (
		<div className="flex flex-col items-center justify-center h-full gap-3 p-6">
			<div className="rounded-xl overflow-hidden border border-slate-700/50 shadow-lg shadow-black/20 bg-slate-800/50 p-3">
				<img
					src={dataUrl}
					alt="Decoded image"
					className="rounded-lg max-w-[400px] max-h-[400px] object-contain"
				/>
			</div>
			<span className="text-xs text-slate-500">
				{format} image &middot; {bytes.length.toLocaleString()} bytes
			</span>
		</div>
	);
};

const CertificateView: React.FC<{ bytes: Uint8Array; raw: string }> = ({ bytes, raw }) => {
	const isPem = raw.includes("-----BEGIN");
	const fields = useMemo(() => parseBasicCertFields(bytes), [bytes]);
	const [hash, setHash] = useState<string | null>(null);

	useEffect(() => { sha256hex(bytes).then(setHash); }, [bytes]);

	const handleDownload = useCallback(() => {
		const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/x-x509-ca-cert" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url; a.download = "certificate.cer";
		document.body.appendChild(a); a.click();
		document.body.removeChild(a); URL.revokeObjectURL(url);
	}, [bytes]);

	return (
		<div className="p-4 h-full overflow-auto custom-scrollbar space-y-3">
			<div className="flex items-center gap-2">
				<svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
						d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
				</svg>
				<span className="text-sm font-semibold text-slate-200">
					X.509 / DER Certificate
				</span>
				<span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
					{isPem ? "PEM" : "DER"}
				</span>
				<div className="flex-1" />
				<button onClick={handleDownload} title="Download certificate"
					className="text-xs px-2 py-1 rounded-md bg-slate-700/40 text-slate-300 border border-slate-600/30 hover:bg-slate-600/50 transition-all">
					Download .cer
				</button>
			</div>

			{/* Cert details */}
			<div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs bg-slate-900/50 rounded-lg p-3 border border-slate-700/40">
				<span className="text-slate-500 font-semibold">Size</span>
				<span className="text-slate-300 font-mono">{bytes.length.toLocaleString()} bytes</span>
				{fields.subject && <>
					<span className="text-slate-500 font-semibold">Subject</span>
					<span className="text-slate-300 font-mono">{fields.subject}</span>
				</>}
				{fields.issuer && <>
					<span className="text-slate-500 font-semibold">Issuer</span>
					<span className="text-slate-300 font-mono">{fields.issuer}</span>
				</>}
				{fields.serial && <>
					<span className="text-slate-500 font-semibold">Serial</span>
					<span className="text-slate-300 font-mono">{fields.serial}</span>
				</>}
				{hash && <>
					<span className="text-slate-500 font-semibold">SHA-256</span>
					<span className="text-slate-300 font-mono text-[10px] break-all">{hash}</span>
				</>}
			</div>

			<div className="mt-2">
				<p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">
					Hex preview
				</p>
				<pre className="text-xs text-slate-300 font-mono whitespace-pre leading-relaxed">
					{formatHexDump(bytes, 256)}
				</pre>
			</div>
		</div>
	);
};

const BinaryInfoView: React.FC<{ bytes: Uint8Array; onSwitchHex: () => void }> = ({
	bytes,
	onSwitchHex,
}) => {
	const [hash, setHash] = useState<string | null>(null);
	useEffect(() => { sha256hex(bytes).then(setHash); }, [bytes]);

	const handleDownload = useCallback(() => {
		const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/octet-stream" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url; a.download = "binary_data.bin";
		document.body.appendChild(a); a.click();
		document.body.removeChild(a); URL.revokeObjectURL(url);
	}, [bytes]);

	return (
		<div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
			<svg className="w-10 h-10 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
					d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
			</svg>
			<p className="text-sm font-medium">Binary data</p>
			<p className="text-xs text-slate-500">{bytes.length.toLocaleString()} bytes &middot; No recognized format</p>
			{hash && (
				<p className="text-[10px] text-slate-500 font-mono break-all max-w-[360px] text-center">
					SHA-256: {hash}
				</p>
			)}
			<div className="flex gap-2 mt-1">
				<button onClick={onSwitchHex}
					className="text-xs px-3 py-1.5 rounded-lg bg-slate-700/40 border border-slate-600/30 text-slate-300 hover:bg-slate-600/50 transition-all">
					View as Hex Dump
				</button>
				<button onClick={handleDownload}
					className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-all">
					Download Bytes
				</button>
			</div>
		</div>
	);
};

export default ContentPreview;
