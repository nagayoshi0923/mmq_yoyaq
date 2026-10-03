// api/reservations.ts の予約項目の更新・人数変更・料金の再計算（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import { assertReservationActor } from '../reservationActor.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { createUserScopedClient, ApiError, type AuthUser } from '../auth.js'
import { RESERVATION_FOR_UPDATE_EMAIL_SELECT_FIELDS, ensureReservationOwnedByOrg } from './common.js'

export async function handleUpdate(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id が必要です' })

  const body = (req.body ?? {}) as Record<string, unknown>
  const updates = (body.updates ?? body) as Record<string, unknown>
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'updates が必要です' })
  }

  // 1) 自組織所有チェック
  const own = await ensureReservationOwnedByOrg(id, user)
  if (!own.ok) return res.status(own.status).json({ error: own.error })

  // 2) RPC (admin_update_reservation_fields) は SECURITY DEFINER で auth.uid() ベースの追加チェックを行う。
  //    user-scoped client で呼ぶ。
  const userClient = createUserScopedClient(user.jwt)
  const { data: ok, error: updateError } = await userClient.rpc(
    'admin_update_reservation_fields',
    { p_reservation_id: id, p_updates: updates },
  )

  if (updateError) {
    console.error('[reservations:update] RPC error:', updateError)
    return res.status(500).json({ error: '予約の更新に失敗しました', detail: updateError.message })
  }
  if (!ok) {
    return res.status(500).json({ error: '予約の更新に失敗しました（DB 側で 0 行更新）' })
  }
  // admin_update_reservation_fields は失敗時に例外でなく { success:false, error } を返す。
  // これを握り潰すと「成功扱いだが DB は未更新」になり、再取得で巻き戻って見える
  // （チェックインがタブ往復で外れる不具合の一因だった）。success:false は明示的にエラーで返す。
  if (typeof ok === 'object' && ok !== null && (ok as { success?: boolean }).success === false) {
    const rpcError = (ok as { error?: string }).error || '予約の更新に失敗しました'
    console.error('[reservations:update] RPC rejected:', rpcError)
    return res.status(400).json({ error: rpcError })
  }

  // 3) 更新後のレコードを customers/schedule_events と一緒に返す（メール送信側で必要）
  const { data, error } = await db
    .from('reservations')
    .select(RESERVATION_FOR_UPDATE_EMAIL_SELECT_FIELDS)
    .eq('id', id)
    .single()

  if (error || !data) {
    console.error('[reservations:update] fetch error:', error)
    return res.status(500).json({ error: '更新後の予約取得に失敗しました' })
  }

  return res.status(200).json(data)
}

export async function handleUpdateParticipantsWithLock(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
) {
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id が必要です' })

  const body = (req.body ?? {}) as Record<string, unknown>
  const newCount = body.new_count as number | undefined
  const customerId = (body.customer_id as string | null | undefined) ?? null
  if (newCount == null) {
    return res.status(400).json({ error: 'new_count が必要です' })
  }

  if (!db) return res.status(500).json({ error: 'db unavailable' })
  const { data: reservation, error: readError } = await db.from('reservations')
    .select('organization_id, customer_id').eq('id', id).maybeSingle()
  if (readError) throw new ApiError(503, '予約の利用権限を確認できませんでした')
  if (!reservation) return res.status(404).json({ error: '予約が見つかりません' })
  if (customerId !== null && customerId !== reservation.customer_id) {
    throw new ApiError(403, 'この予約を操作する権限がありません')
  }
  let customer: { user_id: string | null } | null = null
  if (reservation.customer_id) {
    const { data, error } = await db.from('customers').select('user_id')
      .eq('id', reservation.customer_id).maybeSingle()
    if (error) throw new ApiError(503, '予約の利用権限を確認できませんでした')
    customer = data
  }
  await assertReservationActor(db, user, reservation.organization_id, customer)

  const userClient = createUserScopedClient(user.jwt)
  const { data, error } = await userClient.rpc('update_reservation_participants', {
    p_reservation_id: id,
    p_new_count: newCount,
    p_customer_id: customerId,
  })

  if (error) {
    console.error('[reservations:update-participants-with-lock] RPC error:', error)
    const code = String((error as { code?: string }).code || '')
    if (['P0010', 'P0011', 'P0012', 'P0013', '42501'].includes(code)) {
      return res.status(403).json({ error: 'この予約を操作する権限がありません', code })
    }
    const known: Record<string, string> = {
      P0050: '予約変更の受付期限を過ぎています。店舗へお問い合わせください',
      P0006: '参加人数が不正です',
      P0007: '予約が見つかりません',
      P0008: '選択した人数分の空席がありません',
      P0010: '権限がありません',
      P0011: '権限がありません',
    }
    if (known[code]) {
      return res.status(400).json({ error: known[code], code, detail: error.message })
    }
    return res.status(500).json({ error: '人数変更に失敗しました', detail: error.message, code })
  }

  return res.status(200).json({ success: Boolean(data) })
}

export async function handleRecalculatePrices(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id が必要です' })

  const body = (req.body ?? {}) as Record<string, unknown>
  const participantNames = (body.participant_names as string[] | null | undefined) ?? null

  const own = await ensureReservationOwnedByOrg(id, user)
  if (!own.ok) return res.status(own.status).json({ error: own.error })

  const userClient = createUserScopedClient(user.jwt)
  const { data, error } = await userClient.rpc('admin_recalculate_reservation_prices', {
    p_reservation_id: id,
    p_participant_names: participantNames,
  })

  if (error) {
    console.error('[reservations:recalculate-prices] RPC error:', error)
    return res.status(500).json({ error: '料金再計算に失敗しました', detail: error.message })
  }
  return res.status(200).json({ success: Boolean(data) })
}
