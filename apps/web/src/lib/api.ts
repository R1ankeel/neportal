/**
 * Базовый URL API. На сервере доступны `API_URL` и `NEXT_PUBLIC_API_URL`;
 * для клиентского fetch из браузера задайте `NEXT_PUBLIC_API_URL`.
 */
export function getApiBaseUrl(): string {
  const raw =
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "http://localhost:4000";
  return raw.replace(/\/$/, "");
}

export function getAttachmentPreviewUrl(attachmentId: string): string {
  return `${getApiBaseUrl()}/budget-expense-attachments/${attachmentId}/preview`;
}

export function getAttachmentDownloadUrl(attachmentId: string): string {
  return `${getApiBaseUrl()}/budget-expense-attachments/${attachmentId}/download`;
}

/** @deprecated Используйте getAttachmentPreviewUrl / getAttachmentDownloadUrl */
export function getAttachmentOpenUrl(attachmentId: string): string {
  return `${getApiBaseUrl()}/budget-expense-attachments/${attachmentId}/open`;
}

export async function apiGet<T>(path: string, query?: Record<string, string | undefined>): Promise<T> {
  let urlPath = path.startsWith("/") ? path : `/${path}`;
  if (query) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") p.set(k, v);
    }
    const s = p.toString();
    if (s) urlPath += `?${s}`;
  }
  const url = `${getApiBaseUrl()}${urlPath}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET ${urlPath} → ${res.status} ${text}`.trim());
  }
  return res.json() as Promise<T>;
}

export async function apiPostJson<T>(path: string, body: unknown): Promise<T> {
  const url = `${getApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST ${path} → ${res.status} ${text}`.trim());
  }
  return res.json() as Promise<T>;
}

export async function apiPatchJson<T>(path: string, body: unknown): Promise<T> {
  const url = `${getApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PATCH ${path} → ${res.status} ${text}`.trim());
  }
  return res.json() as Promise<T>;
}
