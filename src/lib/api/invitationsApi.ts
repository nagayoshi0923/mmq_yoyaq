/**
 * 組織招待 API
 *
 * バックエンド API (/api/invitations) 経由で全ての read/write を実行する。
 * - 管理者専用エンドポイント（一覧/作成/削除/再送信）は JWT で認証
 * - 招待受諾画面用エンドポイント（getByToken/accept）は未ログインからもアクセス可能
 *   （token 自体が秘密情報のため、token を知っているクライアントのみ操作可能）
 */
import { logger } from '@/utils/logger'
import { apiClient } from '@/lib/apiClient'
import type { OrganizationInvitation } from '@/types'

// ----------------------------------------------------------------------------
// 公開エンドポイント用の fetch ヘルパー（apiClient は JWT 必須なので使えない）
// ----------------------------------------------------------------------------
async function publicFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    const err = new Error(body?.error ?? `API エラー: ${res.status}`) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return res.json() as Promise<T>
}

/**
 * 招待を作成（admin 専用）
 * - organization_id はサーバ側で JWT から取得され、リクエストボディの値は無視される
 * - created_by もサーバ側で JWT から取得される
 */
export async function createInvitation(params: {
  organization_id: string
  email: string
  name: string
  role?: string[]
  created_by?: string
}): Promise<{ data: OrganizationInvitation | null; error: Error | null }> {
  try {
    const data = await apiClient.post<OrganizationInvitation>(
      '/api/invitations?action=create',
      {
        // organization_id / created_by はサーバ側で強制されるため送信不要（互換のため受ける）
        email: params.email,
        name: params.name,
        role: params.role,
      }
    )
    return { data, error: null }
  } catch (error) {
    logger.error('Failed to create invitation:', error)
    return { data: null, error: error as Error }
  }
}

/**
 * トークンで招待を取得（公開エンドポイント）
 * 招待受諾画面で未ログインユーザがアクセスする。
 */
export async function getInvitationByToken(
  token: string
): Promise<{ data: OrganizationInvitation | null; error: Error | null }> {
  try {
    const data = await publicFetch<OrganizationInvitation>(
      `/api/invitations?token=${encodeURIComponent(token)}`
    )
    return { data, error: null }
  } catch (error) {
    logger.error('Failed to get invitation:', error)
    return { data: null, error: error as Error }
  }
}

/**
 * 招待を受諾（公開エンドポイント、パスワード設定 & ユーザー作成）
 *
 * サーバ側で:
 *  1. accept_invitation_atomic RPC でアトミックに受諾
 *  2. auth ユーザ作成（service_role 経由 admin.createUser）
 *  3. users / staff テーブルにレコード作成（organization_id は招待のものを強制）
 *  4. 招待に staff_id を紐付け
 */
export async function acceptInvitation(params: {
  token: string
  password: string
}): Promise<{ success: boolean; error: string | null }> {
  try {
    const data = await publicFetch<{ success: boolean; error?: string }>(
      '/api/invitations?action=accept',
      {
        method: 'POST',
        body: JSON.stringify({ token: params.token, password: params.password }),
      }
    )
    if (data.success) return { success: true, error: null }
    return { success: false, error: data.error ?? '招待の受諾に失敗しました' }
  } catch (error) {
    logger.error('Failed to accept invitation:', error)
    return { success: false, error: (error as Error).message }
  }
}

/**
 * 組織の招待一覧を取得（admin 専用）
 *
 * 引数の organizationId は互換のため受けるが、サーバ側で JWT 経由の自組織に強制されるため無視される。
 */
export async function getInvitationsByOrganization(
  _organizationId: string
): Promise<{ data: OrganizationInvitation[]; error: Error | null }> {
  try {
    const data = await apiClient.get<OrganizationInvitation[]>('/api/invitations')
    return { data, error: null }
  } catch (error) {
    logger.error('Failed to get invitations:', error)
    return { data: [], error: error as Error }
  }
}

/**
 * 招待を削除（admin 専用、自組織のみ）
 */
export async function deleteInvitation(
  invitationId: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    await apiClient.delete<{ success: boolean }>(
      `/api/invitations?id=${encodeURIComponent(invitationId)}`
    )
    return { success: true, error: null }
  } catch (error) {
    logger.error('Failed to delete invitation:', error)
    return { success: false, error: error as Error }
  }
}

/**
 * 招待を再送信（admin 専用、新しいトークンを生成）
 */
export async function resendInvitation(
  invitationId: string
): Promise<{ data: OrganizationInvitation | null; error: Error | null }> {
  try {
    const params = new URLSearchParams({ id: invitationId, action: 'resend' })
    const data = await apiClient.patch<OrganizationInvitation>(
      `/api/invitations?${params.toString()}`,
      {}
    )
    return { data, error: null }
  } catch (error) {
    logger.error('Failed to resend invitation:', error)
    return { data: null, error: error as Error }
  }
}
