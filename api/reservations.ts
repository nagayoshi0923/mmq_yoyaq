import { saveGmResponse } from './_lib/saveGmResponse.js'
import { readGmResponses, readGmPendingCount, readGmReadiness } from './_lib/gmResponses.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'
import { requireAuth, requireStaff, createUserScopedClient, ApiError, type AuthUser } from './_lib/auth.js'
import { setCors, ensureReservationOwnedByOrg } from './_lib/reservations/common.js'
import { handleGetAllOrRange, handleGetByScheduleEvent, handleGetByCustomer, handleGetSummary, handleGetAvailability } from './_lib/reservations/reads.js'
import { handleCreate } from './_lib/reservations/create.js'
import { handleStaffParticipation, handleCreateStaffEntry } from './_lib/reservations/staffEntry.js'
import { handleUpdate, handleUpdateParticipantsWithLock, handleRecalculatePrices } from './_lib/reservations/update.js'
import { handleCancelWithLock, handleCancelWithGroupLock, handleCancelOrchestrated } from './_lib/reservations/cancel.js'
import { handleSyncStaffReservationStatuses } from './_lib/reservations/staffSync.js'

// 予約 API の入口。処理は api/_lib/reservations/ に分けてある（整備 Phase 3、#774）。

// ─── ハンドラ ─────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const method = req.method
  if (method !== 'GET' && method !== 'POST' && method !== 'PATCH' && method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  try {
    const user = await requireAuth(req)

    if (method === 'GET') return await routeGet(req, res, user)
    if (method === 'POST') return await routePost(req, res, user)
    if (method === 'PATCH') return await routePatch(req, res, user)
    if (method === 'DELETE') return await routeDelete(req, res, user)
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[reservations] unexpected error:', err)
    return res.status(500).json({
      error: 'サーバーエラーが発生しました',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
}

// ─── GET ルーティング ─────────────────────────────────────────────────────────
async function routeGet(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const type = req.query.type as string | undefined

  // ?type なし → 既存挙動（一覧 or 期間内一覧）。スタッフ以上のみ。
  if (!type) {
    requireStaff(user)
    return await handleGetAllOrRange(req, res, user.orgId)
  }

  switch (type) {
    case 'staff-participation':
      requireStaff(user)
      return await handleStaffParticipation(req, res, user, false)
    case 'gm-readiness':
      requireStaff(user)
      return res.status(200).json(await readGmReadiness(db!, user, req.query))
    case 'gm-pending-count':
      requireStaff(user)
      return res.status(200).json(await readGmPendingCount(db!, user))
    case 'gm-responses':
      requireStaff(user)
      return res.status(200).json(await readGmResponses(db!, user, req.query))
    case 'by-schedule-event':
      // 顧客でも自分の予約を見るために呼びうるが、現状クライアントの呼び出し元は staff のみ。
      // 安全側に倒して staff 以上に制限する。
      requireStaff(user)
      return await handleGetByScheduleEvent(req, res, user.orgId)
    case 'by-customer':
      requireStaff(user)
      return await handleGetByCustomer(req, res, user.orgId)
    case 'summary':
      requireStaff(user)
      return await handleGetSummary(req, res, user.orgId)
    case 'availability':
      // 公開的な情報なのでスタッフ縛りなし。ただし JWT は必須（requireAuth で確認済み）。
      return await handleGetAvailability(req, res, user.orgId)
    default:
      return res.status(400).json({ error: `未対応の type: ${type}` })
  }
}

// ─── POST ルーティング ────────────────────────────────────────────────────────
async function routePost(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const action = (req.query.action as string | undefined) ?? 'create'

  switch (action) {
    case 'gm-response':
      if (!db) throw new ApiError(500, 'db unavailable')
      return res.status(200).json(await saveGmResponse(db, user, req.body ?? {}))
    case 'create':
      // 顧客（ログイン済み）でも自分自身の予約は作成できる。
      // 権限細分化は RPC 内の auth.uid() ベースの組織境界チェックに任せる。
      return await handleCreate(req, res, user)
    case 'sync-staff-participation':
      requireStaff(user)
      return await handleStaffParticipation(req, res, user, true)
    case 'create-staff-entry':
      requireStaff(user)
      return await handleCreateStaffEntry(req, res, user)
    default:
      return res.status(400).json({ error: `unknown action: ${action}` })
  }
}

// ─── PATCH ルーティング ───────────────────────────────────────────────────────
async function routePatch(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const action = (req.query.action as string | undefined) ?? 'update'

  switch (action) {
    case 'update':
      requireStaff(user)
      return await handleUpdate(req, res, user)
    case 'cancel-with-lock':
      // 予約だけの取消は店舗処理専用。顧客はグループ・通知も同期する通常経路へ。
      requireStaff(user)
      return await handleCancelWithLock(req, res, user)
    case 'cancel-with-group-lock':
      return await handleCancelWithGroupLock(req, res, user)
    case 'cancel':
      // 複合フロー: 予約 + グループ + システムメッセージ送信
      return await handleCancelOrchestrated(req, res, user)
    case 'update-participants-with-lock':
      return await handleUpdateParticipantsWithLock(req, res, user)
    case 'recalculate-prices':
      requireStaff(user)
      return await handleRecalculatePrices(req, res, user)
    case 'sync-staff-reservation-statuses':
      requireStaff(user)
      return await handleSyncStaffReservationStatuses(req, res, user)
    default:
      return res.status(400).json({ error: `unknown action: ${action}` })
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────
async function routeDelete(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  requireStaff(user)

  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id が必要です' })

  const own = await ensureReservationOwnedByOrg(id, user)
  if (!own.ok) return res.status(own.status).json({ error: own.error })

  // RPC: admin_delete_reservations_by_ids は SECURITY DEFINER + 内部で auth.uid() による org/role チェック
  const userClient = createUserScopedClient(user.jwt)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (userClient as any).rpc('admin_delete_reservations_by_ids', {
    p_reservation_ids: [id],
  })

  if (error) {
    console.error('[reservations:delete] RPC error:', error)
    return res.status(500).json({ error: '予約の削除に失敗しました', detail: error.message })
  }
  return res.status(200).json({ success: true })
}
