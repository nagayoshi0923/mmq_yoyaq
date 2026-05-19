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

/**
 * 認証ヘッダを取得する。
 *
 * getSession() はキャッシュを返すため期限切れトークンを送る可能性がある。
 * Supabase 初期化時（_recoverAndRefresh）にも同じ問題が起きるため、
 * リクエスト前に expires_at を確認し、期限切れなら先にリフレッシュする。
 * SDK 内部のロックにより _recoverAndRefresh との競合は自動的に直列化される。
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error || !session) throw new ApiClientError(401, 'ログインが必要です')

  // トークンが期限切れ（または60秒以内に期限切れ）の場合はリフレッシュ
  const now = Math.floor(Date.now() / 1000)
  if ((session.expires_at ?? 0) < now + 60) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
    if (refreshError || !refreshed.session) {
      throw new ApiClientError(401, 'セッションの更新に失敗しました。再ログインしてください')
    }
    return {
      'Authorization': `Bearer ${refreshed.session.access_token}`,
      'Content-Type': 'application/json',
    }
  }

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

  // 401 の場合は再度 getAuthHeaders() を呼んでリトライ（プロアクティブリフレッシュが
  // タイミングにより間に合わなかった場合のセーフネット。この時点では _recoverAndRefresh
  // が完了しているためリフレッシュ競合は発生しない）
  if (res.status === 401) {
    const retryHeaders = await getAuthHeaders()
    const retryRes = await fetch(path, {
      ...options,
      headers: { ...retryHeaders, ...options?.headers },
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
