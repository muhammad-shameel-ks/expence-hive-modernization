import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

// The dev server binds to 0.0.0.0 so the internal demo is reachable from
// the office network, but Next.js blocks cross-origin requests to dev-only
// assets (the HMR websocket and /_next/*) from non-localhost origins by
// default. Allowlist every non-loopback IPv4 address of this machine so
// team members can open the app via the server's LAN IP. The probe is
// dev-only: allowedDevOrigins is ignored in production, and probing the
// interfaces confuses the production build's file tracing.
function lanIpv4Addresses(): string[] {
  if (process.env.NODE_ENV === "production") {
    return [];
  }
  const addresses: string[] = [];
  for (const infos of Object.values(networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family === "IPv4" && !info.internal) {
        addresses.push(info.address);
      }
    }
  }
  return addresses;
}

// ALLOWED_DEV_ORIGINS is a comma-separated list of extra hostnames
// (e.g. the server's DNS name) that should be allowed in addition to the
// auto-discovered LAN addresses.
const extraOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: [...lanIpv4Addresses(), ...extraOrigins],
};

export default nextConfig;
