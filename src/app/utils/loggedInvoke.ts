/**
 * Logged wrapper around Tauri's invoke().
 *
 * Captures command name, sanitized args, timing, and result/error
 * into the frontend ring-buffer logger.
 *
 * Drop-in replacement:
 *   import { loggedInvoke } from "@/app/utils/loggedInvoke";
 *   const result = await loggedInvoke<MyType>("fetch_ldap_tree", { base_dn: dn });
 */

import { invoke, InvokeArgs } from "@tauri-apps/api/core";
import { log } from "./logger";

/** Keys whose values must never appear in logs */
const REDACTED_KEYS = new Set(["password", "pwd", "secret", "token", "credential", "credentials"]);

/** Max length for a single arg value in logs */
const ARG_MAX_LEN = 200;

function sanitizeArgs(args?: InvokeArgs): Record<string, unknown> | undefined {
  if (!args || typeof args !== "object") return undefined;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
    if (REDACTED_KEYS.has(k.toLowerCase())) {
      clean[k] = "***REDACTED***";
    } else if (typeof v === "string" && v.length > ARG_MAX_LEN) {
      clean[k] = v.slice(0, ARG_MAX_LEN) + `…(${v.length})`;
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

/**
 * Invoke a Tauri command with automatic frontend logging.
 */
export async function loggedInvoke<T>(cmd: string, args?: InvokeArgs): Promise<T> {
  const sanitized = sanitizeArgs(args);
  const start = performance.now();

  log.debug(`invoke → ${cmd}`, sanitized);

  try {
    const result = await invoke<T>(cmd, args);
    const ms = (performance.now() - start).toFixed(1);
    log.info(`invoke ← ${cmd} OK`, { duration_ms: ms });
    return result;
  } catch (err: unknown) {
    const ms = (performance.now() - start).toFixed(1);
    const message = err instanceof Error ? err.message : String(err);
    log.error(`invoke ✗ ${cmd}`, { duration_ms: ms, error: message });
    throw err;
  }
}
