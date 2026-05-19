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

async function getAuthHeaders(forceRefresh = false): Promise<Record<string, string>> {
  if (forceRefresh) {
    const { data, error } = await supabase.auth.refreshSession()
    if (error || !data.session) throw new ApiClientError(401, 'セッションの更新に失敗しました。再ログインしてください')
    return {
      'Authorization': `Bearer ${data.session.access_token}`,
      'Content-Type': 'application/json',
    }
  }
  // getSession() はキャッシュを返すため期限切れトークンを送る可能性があるが、
  // 401 を受け取った場合は refreshSession() でリトライする（下記 apiFetch 参照）
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

  // 401 の場合はトークンをリフレッシュして1回だけリトライ
  if (res.status === 401) {
    const refreshedHeaders = await getAuthHeaders(true)
    const retryRes = await fetch(path, {
      ...options,
      headers: { ...refreshedHeaders, ...options?.headers },
    })
    if (!retryRes.ok) {
      const body = await retryRes.json().catch(() => ({ error: `HTTP ${retryRes.status}` }))
      throw new ApiClientError(retryRes.status, body?.error ?? `API エラー: ${retryRes.status}`)
    }
    return retryRes.json() as Promise<T>
  }

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
