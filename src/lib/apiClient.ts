/**
 * バックエンド API (/api/*) を呼び出すためのクライアント。
 *
 * - Supabase セッションから JWT を取得して Authorization ヘッダに付与する
 * - フロントは org_id をリクエストに含めない（サーバー側で JWT から確実に取得する）
 * - エラー時は ApiClientError を throw する
 */
import { supabase } from './supabase'

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error || !session) throw new ApiClientError(401, 'ログインが必要です')
  return {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = await getAuthHeaders()
  const res = await fetch(path, {
    ...options,
    headers: { ...headers, ...options?.headers },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new ApiClientError(res.status, body?.error ?? `API エラー: ${res.status}`)
  }

  return res.json() as Promise<T>
}

export const apiClient = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
}
