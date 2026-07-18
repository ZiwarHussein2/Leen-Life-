export * from "./state-machines.js";

/** Supported UI languages. */
export const LOCALES = ["en", "ar", "ku"] as const;
export type Locale = (typeof LOCALES)[number];
export const RTL_LOCALES: Locale[] = ["ar", "ku"];

export function isRtl(locale: string): boolean {
  return RTL_LOCALES.includes(locale as Locale);
}

/** Radiology department types operated in Phase 1. */
export const RADIOLOGY_DEPARTMENTS = [
  "SONAR",
  "MRI",
  "CT",
  "XRAY",
  "MAMMOGRAPHY",
  "DEXA",
] as const;
export type RadiologyDepartment = (typeof RADIOLOGY_DEPARTMENTS)[number];

/** Standard API error envelope. */
export interface ApiError {
  statusCode: number;
  error: string;
  message: string | string[];
  correlationId?: string;
}

/** Standard paginated response envelope. */
export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** JWT claims the API attaches after authenticating a request. */
export interface AuthenticatedUser {
  userId: string;
  supabaseUserId: string | null;
  email: string;
  roleKey: string;
  branchId: string;
  departmentId: string | null;
  permissions: string[];
  mfaVerified: boolean;
}
