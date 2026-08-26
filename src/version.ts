// The one place this package knows its own version.
//
// It is reported twice — as `serverInfo.version` in the MCP initialize
// handshake, and as the User-Agent on every API request — and the two were
// free to drift while each carried its own literal. Reading package.json at
// startup makes `npm version` the only edit a release needs.

import { readFileSync } from "node:fs";

/** Package version, e.g. "0.1.2". */
export const VERSION: string = readVersion();

/**
 * What the API sees. It groups callers by the token before the first "/", so
 * this is how a request from this server is told apart from one from the Go
 * CLI (agentdomains-cli/<version>).
 */
export const USER_AGENT = `agentdomains-mcp/${VERSION}`;

function readVersion(): string {
  try {
    // Compiled to dist/version.js, so package.json is one level up — the same
    // relative position in a checkout and in an installed package.
    const raw = readFileSync(new URL("../package.json", import.meta.url), "utf8");
    const v = (JSON.parse(raw) as { version?: string }).version;
    if (v) return v;
  } catch {
    // Unreadable package.json is not worth refusing to start over; a version
    // that says "unknown" is more useful than a server that will not boot.
  }
  return "0.0.0-unknown";
}
