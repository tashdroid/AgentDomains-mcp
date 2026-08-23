// Thin HTTP client for the AgentDomains API, mirroring the Go CLI's
// internal/client and internal/config packages so the two stay interchangeable.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_API_URL = "https://api.agentdomains.co";

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
}

interface DiskConfig {
  api_url?: string;
  api_key?: string;
  account_id?: string;
}

/**
 * Resolve credentials the same way the CLI does: read ~/.agentdomains/config.json
 * if it exists, then let AGENTDOMAINS_API_URL / AGENTDOMAINS_API_KEY override it.
 * The key is never logged anywhere in this package.
 */
export function loadConfig(): ApiConfig {
  let disk: DiskConfig = {};
  try {
    const raw = readFileSync(join(homedir(), ".agentdomains", "config.json"), "utf8");
    disk = JSON.parse(raw) as DiskConfig;
  } catch {
    // No config file (or unreadable/!JSON) — env vars alone are a valid setup.
  }
  return {
    baseUrl: (process.env.AGENTDOMAINS_API_URL || disk.api_url || DEFAULT_API_URL).replace(/\/+$/, ""),
    apiKey: process.env.AGENTDOMAINS_API_KEY || disk.api_key || "",
  };
}

/** Error carrying the API's own message, so tool callers see the real reason. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Perform a request against the API. `needKey` requests fail early with an
 * actionable message rather than bouncing off the server with a 401.
 */
export async function request(
  cfg: ApiConfig,
  method: string,
  path: string,
  body?: unknown,
  needKey = true,
): Promise<unknown> {
  if (needKey && !cfg.apiKey) {
    throw new ApiError(
      "no API key configured — run the `signup` tool first, or set AGENTDOMAINS_API_KEY " +
        "(the CLI stores one at ~/.agentdomains/config.json)",
      401,
    );
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers["Authorization"] = `Bearer ${cfg.apiKey}`;

  let res: Response;
  try {
    res = await fetch(cfg.baseUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
  } catch (err) {
    throw new ApiError(
      `cannot reach the AgentDomains API at ${cfg.baseUrl}: ${(err as Error).message}`,
      0,
    );
  }

  const raw = await res.text();
  if (res.status >= 300) {
    let msg = "";
    try {
      msg = (JSON.parse(raw) as { error?: string }).error || "";
    } catch {
      // Non-JSON error body — fall back to the status line below.
    }
    throw new ApiError(msg || `request failed (${res.status})`, res.status);
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

/**
 * Build /v1/subdomains/<label>[<suffix>][?domain=…] — the shape every
 * label-scoped endpoint uses (mirrors resourcePath in the Go CLI).
 */
export function resourcePath(label: string, suffix = "", domain?: string): string {
  let p = `/v1/subdomains/${encodeURIComponent(label)}${suffix}`;
  if (domain) p += `?domain=${encodeURIComponent(domain)}`;
  return p;
}
