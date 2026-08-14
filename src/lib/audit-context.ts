import "server-only";

import { createHash } from "node:crypto";

export type AuditRequestContext = {
  ipHash: string;
  requestId: string;
  userAgent: string;
};

export function auditContextFromRequest(request: Request): AuditRequestContext {
  const source =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  return {
    ipHash: createHash("sha256")
      .update(`${process.env.SESSION_SECRET || "unconfigured"}:${source}`)
      .digest("hex"),
    requestId: request.headers.get("x-vercel-id") || crypto.randomUUID(),
    userAgent: (request.headers.get("user-agent") || "unknown").slice(0, 300),
  };
}
