export type { Profile, ProfileAuditLog, AgentRoutingConfig, UserRole, AppDomain, Database } from "./database";

/** Shared action response shape — Rule 10 */
export type ActionResult<T = null> = {
  data: T | null;
  error: string | null;
};
