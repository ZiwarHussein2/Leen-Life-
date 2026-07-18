"use client";

/** Minimal authenticated API client. Token lives in a same-site cookie. */

export function getToken(): string | null {
  if (typeof document === "undefined") return null;
  return document.cookie.match(/(?:^|; )ll_token=([^;]+)/)?.[1] ?? null;
}

export function setToken(token: string | null) {
  if (token) {
    document.cookie = `ll_token=${token}; path=/; max-age=28800; samesite=strict`;
  } else {
    document.cookie = "ll_token=; path=/; max-age=0";
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; formData?: FormData } = {},
): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api/v1${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.formData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.formData ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
  });
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth")) {
    setToken(null);
    window.location.href = "/login";
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join(", ") : data?.message ?? res.statusText;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export interface Me {
  id: string;
  fullName: string;
  email: string;
  language: string;
  role: { key: string; name: string };
  department: { id: string; name: string; type: string } | null;
  permissions: string[];
}

export function fmtIQD(amount: number | null | undefined): string {
  return `${(amount ?? 0).toLocaleString()} IQD`;
}

/** Role → landing route. */
export function homeFor(roleKey: string): string {
  switch (roleKey) {
    case "RECEPTION": return "/reception";
    case "DEPARTMENT_OPERATOR": return "/department";
    case "SONAR_DOCTOR": return "/sonar";
    case "REPORT_DOCTOR": return "/doctor";
    case "ACCOUNTING": return "/accounting";
    case "EMPLOYEE": return "/employee";
    case "BRANCH_ADMIN":
    case "PLATFORM_ADMIN": return "/admin";
    case "MERNA_GOVERNANCE": return "/accounting";
    default: return "/login";
  }
}
