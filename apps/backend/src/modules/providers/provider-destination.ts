import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPrivateAgentAddress } from "../agents/agent-endpoint";

export type ProviderLookup = (host: string) => Promise<string[]>;
export type ProviderDestination = { url: URL; address: string; local: boolean };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/** Resolve and validate a provider endpoint immediately before its request. */
export async function resolveProviderDestination(
  rawUrl: string,
  allowLocal: boolean,
  lookupHost: ProviderLookup = async (host) => (await lookup(host, { all: true })).map(({ address }) => address),
): Promise<ProviderDestination> {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("invalid destination");
  if (url.username || url.password) throw new Error("invalid destination");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (LOCAL_HOSTS.has(host)) {
    if (!allowLocal || url.protocol !== "http:") throw new Error("invalid destination");
    return { url, address: host === "localhost" ? "127.0.0.1" : host, local: true };
  }
  const addresses = isIP(host) ? [host] : await lookupHost(host);
  if (!addresses.length || addresses.some(isPrivateAgentAddress)) throw new Error("invalid destination");
  const address = addresses[0];
  if (!address) throw new Error("invalid destination");
  return { url, address, local: false };
}

export function isProviderRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}
