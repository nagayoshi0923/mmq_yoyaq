/**
 * バックエンド API (/api/*) を呼び出すためのクライアント。
 *
 * - Supabase セッションから JWT を取得して Authorization ヘッダに付与する
 * - フロントは org_id をリクエストに含めない（サーバー側で JWT から確実に取得する）
 * - エラー時は ApiClientError を throw する
 */
import { supabase } from './supabase'
import { requestKey, withRepeatFailureBackoff } from './repeatFailureBackoff'
import { invalidateAfterWrite } from './api/sharedRequest'

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly detail?: string,
    /** サーバーが返した JSON body 全体（減少ガードの existing_count 等を UI に渡すため） */
    public readonly body?: Record<string, unknown>,
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
 *
 * allowAnon=true のとき、セッションが無くてもエラーにせず Authorization ヘッダ
 * を付けずに返す（公開エンドポイント用）。
 */
async function getAuthHeaders(allowAnon = false): Promise<Record<string, string>> {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error || !session) {
    if (allowAnon) return { 'Content-Type': 'application/json' }
    throw new ApiClientError(401, 'ログインが必要です')
  }

  // トークンが期限切れ（または60秒以内に期限切れ）の場合はリフレッシュ
  const now = Math.floor(Date.now() / 1000)
  if ((session.expires_at ?? 0) < now + 60) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
    if (refreshError || !refreshed.session) {
      if (allowAnon) return { 'Content-Type': 'application/json' }
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

type ApiFetchOptions = RequestInit & { allowAnon?: boolean }

async function apiFetch<T>(path: string, options?: ApiFetchOptions): Promise<T> {
  const { allowAnon, ...fetchOptions } = options ?? {}
  const headers = await getAuthHeaders(allowAnon)
  const res = await fetch(path, {
    ...fetchOptions,
    headers: { ...headers, ...fetchOptions.headers },
  })

  // 401 の場合は refreshSession() で強制リフレッシュしてリトライ。
  // getSession() のキャッシュが古い可能性があるため、必ず新トークンを取得する。
  // ただし allowAnon の場合は 401 が「未ログイン顧客への正当な拒否」なのでリトライしない。
  if (res.status === 401 && !allowAnon) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
    if (refreshError || !refreshed.session) {
      throw new ApiClientError(401, 'セッションの更新に失敗しました。再ログインしてください')
    }
    const retryHeaders = {
      'Authorization': `Bearer ${refreshed.session.access_token}`,
      'Content-Type': 'application/json',
    }
    const retryRes = await fetch(path, {
      ...fetchOptions,
      headers: { ...retryHeaders, ...fetchOptions.headers },
    })
    if (!retryRes.ok) {
      const body = await retryRes.json().catch(() => ({ error: `HTTP ${retryRes.status}` }))
      throw new ApiClientError(retryRes.status, body?.error ?? `API エラー: ${retryRes.status}`, body?.detail, body)
    }
    if (retryRes.status === 204) return undefined as T
    return retryRes.json() as Promise<T>
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new ApiClientError(res.status, body?.error ?? `API エラー: ${res.status}`, body?.detail, body)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/**
 * 書き込み（POST/PATCH/DELETE）は、同じ宛先・同じ内容が 3 回続けて失敗したら次から 10 秒空けて送る。
 * 失敗する保存を画面が即座に再送し続け、DB が混んだ（2026-10-13）ための歯止め。読み込み（GET）は対象外。
 */
function writeWithBackoff<T>(method: string, path: string, options: ApiFetchOptions): Promise<T> {
  // どの書き込みの後も、書き込み前に始まった読み取りへの相乗りをやめる（sharedRequest.ts）
  return writeWithBackoffInner<T>(method, path, options).finally(invalidateAfterWrite)
}

function writeWithBackoffInner<T>(method: string, path: string, options: ApiFetchOptions): Promise<T> {
  return withRepeatFailureBackoff<{ ok: true; value: T } | { ok: false; error: unknown }>(
    requestKey(`${method} ${path}`, options.body ?? ''),
    () => apiFetch<T>(path, options).then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error })),
    r => !r.ok,
  ).then(r => { if (r.ok) return r.value; throw r.error })
}

export const apiClient = {
  get: <T>(path: string, options?: { allowAnon?: boolean }) =>
    apiFetch<T>(path, options),
  post: <T>(path: string, body: unknown, options?: { allowAnon?: boolean }) =>
    writeWithBackoff<T>('POST', path, { method: 'POST', body: JSON.stringify(body), ...options }),
  patch: <T>(path: string, body: unknown) =>
    writeWithBackoff<T>('PATCH', path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => writeWithBackoff<T>('DELETE', path, { method: 'DELETE' }),
}
