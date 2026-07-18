import type { AuthenticatedUser } from "@leen-life/shared-types";
import type { Request } from "express";

export interface AuthedRequest extends Request {
  user: AuthenticatedUser;
  correlationId?: string;
}

export function requestMeta(req: AuthedRequest) {
  return {
    ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip ?? null,
    deviceInfo: (req.headers["user-agent"] as string) ?? null,
  };
}
