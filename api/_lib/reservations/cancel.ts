// api/reservations.ts の取消（予約だけ、グループ込み、複合の取消）（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { requireStaff, createUserScopedClient, type AuthUser } from '../auth.js'
import { recordEventHistory, fetchEventSnapshotServer } from '../eventHistory.js'
import { assertCustomerSelfCancelAllowed } from '../customerCancellation.js'
import { groupCancellationError, RESERVATION_SELECT_FIELDS, RESERVATION_WITH_CUSTOMER_AND_EVENT_SELECT_FIELDS, ensureReservationOwnedByOrg, recordBillingForCancellation } from './common.js'

export async function handleCancelWithLock(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const requestReceivedAt = new Date().toISOString()
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id が必要です' })

  const body = (req.body ?? {}) as Record<string, unknown>
  const customerId = body.customer_id as string | null | undefined
  const reason = (body.cancellation_reason as string | null | undefined) ?? null

  // 自組織所有チェック
  const own = await ensureReservationOwnedByOrg(id, user)
  if (!own.ok) return res.status(own.status).json({ error: own.error })

  if (!db) return res.status(500).json({ error: 'db unavailable' })
  const { data: reservationForPolicy, error: policyFetchError } = await db!
    .from('reservations')
    .select(RESERVATION_WITH_CUSTOMER_AND_EVENT_SELECT_FIELDS)
    .eq('id', id)
    .maybeSingle()
  if (policyFetchError || !reservationForPolicy) {
    return res.status(500).json({ error: '予約取得に失敗しました' })
  }
  const customerGate = await assertCustomerSelfCancelAllowed(user, reservationForPolicy)
  if (!customerGate.ok) return res.status(customerGate.status).json({ error: customerGate.error })

  // user-scoped で RPC を呼ぶ（RPC 側で auth.uid() による顧客/スタッフ判定）
  const userClient = createUserScopedClient(user.jwt)
  const { data, error } = await userClient.rpc('cancel_reservation_with_lock', {
    p_reservation_id: id,
    p_customer_id: customerId ?? null,
    p_cancellation_reason: reason,
  })

  if (error) {
    console.error('[reservations:cancel-with-lock] RPC error:', error)
    return res.status(500).json({ error: '予約のキャンセルに失敗しました', detail: error.message })
  }
  if (data !== true) {
    return res.status(500).json({ error: '予約のキャンセルに失敗しました（DB 側で処理できませんでした）' })
  }
  const billingWarning = await recordBillingForCancellation(user, reservationForPolicy, requestReceivedAt)
  return res.status(200).json({ success: true, billingWarning })
}

export async function handleCancelWithGroupLock(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const requestReceivedAt = new Date().toISOString()
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id が必要です' })

  const body = (req.body ?? {}) as Record<string, unknown>
  const customerId = body.customer_id as string | null | undefined
  const reason = (body.cancellation_reason as string | null | undefined) ?? null

  const own = await ensureReservationOwnedByOrg(id, user)
  if (!own.ok) return res.status(own.status).json({ error: own.error })

  if (!db) return res.status(500).json({ error: 'db unavailable' })
  const { data: reservationForPolicy, error: policyFetchError } = await db!
    .from('reservations')
    .select(RESERVATION_WITH_CUSTOMER_AND_EVENT_SELECT_FIELDS)
    .eq('id', id)
    .maybeSingle()
  if (policyFetchError || !reservationForPolicy) {
    return res.status(500).json({ error: '予約取得に失敗しました' })
  }
  const customerGate = await assertCustomerSelfCancelAllowed(user, reservationForPolicy)
  if (!customerGate.ok) return res.status(customerGate.status).json({ error: customerGate.error })

  const userClient = createUserScopedClient(user.jwt)
  const { data, error } = await userClient.rpc('cancel_reservation_and_group_with_notice', {
    p_reservation_id: id,
    p_customer_id: customerId ?? null,
    p_cancellation_reason: reason,
  })

  if (error) {
    console.error('[reservations:cancel-with-group-lock] RPC error:', error)
    const failure = groupCancellationError(error)
    return res.status(failure.status).json({ error: failure.message, detail: error.message })
  }
  if (data !== true) {
    return res.status(500).json({ error: '予約+グループのキャンセルに失敗しました（DB 側）' })
  }
  if (user.role === 'customer' && isPendingPrivateRequest(reservationForPolicy)) {
    await enqueuePrivateRequestWithdrawalNotice(id)
  }
  const billingWarning = await recordBillingForCancellation(user, reservationForPolicy, requestReceivedAt)
  return res.status(200).json({ success: true, billingWarning })
}

const PENDING_PRIVATE_REQUEST_STATUSES = new Set(['pending', 'pending_gm', 'gm_confirmed', 'pending_store'])

// 申込中の貸切リクエスト（公演がまだ無い）か。取り消し前の予約で判定する。
function isPendingPrivateRequest(reservation: {
  private_group_id?: string | null
  reservation_source?: string | null
  schedule_event_id?: string | null
  status?: string | null
}): boolean {
  return (reservation.private_group_id != null || reservation.reservation_source === 'web_private')
    && reservation.schedule_event_id == null
    && PENDING_PRIVATE_REQUEST_STATUSES.has(reservation.status ?? '')
}

// お客様の取り下げを打診先GM・貸切キャンセル共有チャンネルへ知らせる。失敗してもキャンセル自体は成功扱い。
async function enqueuePrivateRequestWithdrawalNotice(reservationId: string) {
  try {
    const { error } = await db!.rpc('enqueue_private_request_withdrawal', { p_reservation_id: reservationId })
    if (error) console.error('[reservations:cancel-with-group-lock] 取り下げ通知の登録に失敗:', error)
  } catch (error) {
    console.error('[reservations:cancel-with-group-lock] 取り下げ通知の登録に失敗:', error)
  }
}

// cancel() の DB パートを一括で実行する複合エンドポイント。
//
// ⚠ クライアント側の cancel() は以下を実施していた:
//   1. 予約取得（customer/schedule_events JOIN）
//   2. RPC: cancel_reservation_and_group_with_lock or cancel_reservation_with_lock
//   3. グループキャンセル時はシステムメッセージを private_group_messages に INSERT
//   4. キャンセル確認メール送信（Edge Function）
//   5. キャンセル待ち通知（Edge Function、失敗時はキューに INSERT）
//   6. 貸切予約なら GM への Discord 通知（Edge Function）
//
// ここで DB 部分（1〜3 + 失敗時の waitlist キュー INSERT）をサーバー側に寄せ、
// メール・Discord 通知系（Edge Function 呼び出し）はクライアント側に残す。
// 戻り値で「次にクライアントが呼ぶべき Edge Function 呼び出しに必要な情報」を返す。
export async function handleCancelOrchestrated(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const requestReceivedAt = new Date().toISOString()
  if (!db) return res.status(500).json({ error: 'db unavailable' })
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id が必要です' })

  const body = (req.body ?? {}) as Record<string, unknown>
  const reason = (body.cancellation_reason as string | null | undefined) ?? null
  const skipGroupCancel = Boolean(body.skip_group_cancel)
  // true のとき、紐づく貸切公演(category='private')も中止にする（貸切リクエストの却下フロー）
  const cancelPrivateEvent = Boolean(body.cancel_private_event)
  const rejectionBody = body.private_rejection_body
  const atomicRejection = rejectionBody !== undefined
  if (atomicRejection && (typeof rejectionBody !== 'string' || !rejectionBody.trim()
    || rejectionBody.length > 20000 || !skipGroupCancel || !cancelPrivateEvent)) {
    return res.status(400).json({ error: '貸切却下の本文と処理条件を確認してください' })
  }

  // 公演中止・グループ取消の省略は店舗側の却下フロー専用。予約変更前に認可する。
  if (skipGroupCancel || cancelPrivateEvent) requireStaff(user)

  // 1) 予約 + customers + schedule_events を取得（マルチテナント境界チェックも兼ねる）
  const { data: reservation, error: fetchError } = await db!
    .from('reservations')
    .select(RESERVATION_WITH_CUSTOMER_AND_EVENT_SELECT_FIELDS)
    .eq('id', id)
    .maybeSingle()

  if (fetchError) {
    console.error('[reservations:cancel] fetch error:', fetchError)
    return res.status(500).json({ error: '予約取得に失敗しました', detail: fetchError.message })
  }
  if (!reservation) {
    return res.status(404).json({ error: '予約が見つかりません' })
  }
  if (reservation.organization_id !== user.orgId) {
    // platform customer (role='customer' かつ orgId='') は org 不一致を許容
    // RPC (cancel_reservation_with_lock / cancel_reservation_and_group_with_lock) 側で
    // auth.uid() ベースの ownership チェックが走るためここでは弾かない。
    const isPlatformCustomer = user.role === 'customer' && !user.orgId
    if (!isPlatformCustomer) {
      return res.status(403).json({ error: '他組織の予約は操作できません' })
    }
  }

  const customerGate = await assertCustomerSelfCancelAllowed(user, reservation)
  if (!customerGate.ok) return res.status(customerGate.status).json({ error: customerGate.error })

  // 2) RPC でキャンセル
  const userClient = createUserScopedClient(user.jwt)
  if (atomicRejection) {
    const { data, error } = await userClient.rpc('reject_private_booking_with_delivery', {
      p_reservation_id: id,
      p_message_body: rejectionBody,
    })
    if (error || data !== true) {
      console.error('[reservations:cancel] atomic rejection error:', error)
      const rejectionErrors: Record<string, string> = {
        PRIVATE_EVENT_HAS_OTHER_RESERVATIONS: 'この公演には別の有効な予約があります。予約一覧を確認してから却下してください',
        PRIVATE_GROUP_RESERVATION_MISMATCH: '貸切グループに別の申込が紐付いています。再読込してください',
        PRIVATE_GROUP_ORGANIZATION_MISMATCH: '申込と貸切グループの所属組織が一致しません',
        REJECTION_NOTICE_CONFLICT: 'この却下は別の内容で保存済みです。通知履歴を確認してください',
        RESERVATION_ALREADY_CANCELLED: 'この予約は別の理由で取消済みです。取消履歴を確認してください',
      }
      return res.status(error?.code === '42501' ? 403 : 409).json({
        error: rejectionErrors[error?.message ?? ''] ?? '貸切却下を保存できませんでした。状態を再読込して確認してください',
        detail: error?.message,
      })
    }
  } else if (skipGroupCancel) {
    const { data, error } = await userClient.rpc('cancel_reservation_with_lock', {
      p_reservation_id: id,
      p_customer_id: reservation.customer_id ?? null,
      p_cancellation_reason: reason,
    })
    if (error || data !== true) {
      console.error('[reservations:cancel] cancel_reservation_with_lock error:', error, 'data:', data)
      return res.status(500).json({
        error: '予約のキャンセルに失敗しました',
        detail: error?.message,
      })
    }
  } else {
    const { data, error } = await userClient.rpc('cancel_reservation_and_group_with_notice', {
      p_reservation_id: id,
      p_customer_id: reservation.customer_id ?? null,
      p_cancellation_reason: reason,
    })
    if (error || data !== true) {
      console.error('[reservations:cancel] cancel_reservation_and_group_with_lock error:', error, 'data:', data)
      const failure = groupCancellationError(error)
      return res.status(failure.status).json({ error: failure.message, detail: error?.message })
    }
  }

  // 2-b) 貸切リクエストの却下フロー（cancel_private_event = true）のときだけ、
  //      紐づく貸切公演（category='private'）も中止にする。
  //      「有効な予約が0件なら中止」という状態ベースの判定はしない（スタッフが予約を入れ直す運用や、
  //      予約行を持たない手入力の貸切を巻き込むため）。店舗が能動的に却下した操作のときのみ中止する。
  //      ⚠ 予約キャンセルは既に確定しており巻き戻せないため、ここでの失敗は警告として返すだけにする。
  let eventCancelWarning = false
  if (cancelPrivateEvent && !atomicRejection) {
    try {
      const targetEventId = (reservation.schedule_event_id as string | null | undefined) ?? null
      if (!targetEventId) {
        // 未承認リクエストの却下 → 公演がまだ存在しない（正常系。何もしない）
      } else if (!user.orgId) {
        // org を特定できない呼び出し元（platform customer）は公演に触らない
        console.warn('[reservations:cancel] cancel_private_event skipped: user.orgId が未設定')
      } else {
        // org スコープ: 実行ユーザーの組織の公演だけを対象にする（マルチテナント境界）
        const { data: targetEvent, error: eventFetchError } = await db!
          .from('schedule_events')
          .select('id, category, is_cancelled')
          .eq('id', targetEventId)
          .eq('organization_id', user.orgId)
          .maybeSingle()
        if (eventFetchError) throw eventFetchError

        // 貸切公演かつ未中止のときだけ更新する（open など他カテゴリ・中止済みは触らない）
        if (targetEvent && targetEvent.category === 'private' && targetEvent.is_cancelled !== true) {
          const { error: eventUpdateError } = await db!
            .from('schedule_events')
            .update({
              is_cancelled: true,
              cancelled_at: new Date().toISOString(),
              cancellation_reason: reason,
            })
            .eq('id', targetEventId)
            .eq('organization_id', user.orgId)
            .eq('category', 'private')
          if (eventUpdateError) throw eventUpdateError
        }
      }
    } catch (eventCancelError) {
      console.error('[reservations:cancel] private event cancel error:', eventCancelError)
      eventCancelWarning = true
    }
  }

  // グループ取消の通知はRPC内で予約・グループと一括保存する。

  // 4) キャンセル後の予約レコード（プレーン）と、後段の Edge Function 呼び出しに必要な情報を返す
  const { data: cancelled, error: fetchAfterError } = await db
    .from('reservations')
    .select(RESERVATION_SELECT_FIELDS)
    .eq('id', id)
    .single()
  if (fetchAfterError || !cancelled) {
    console.error('[reservations:cancel] fetch after cancel error:', fetchAfterError)
    return res.status(500).json({ error: 'キャンセル後の予約取得に失敗しました' })
  }

  // schedule_event_history に remove_participant を記録（失敗してもキャンセルは成功させる）
  try {
    const scheduleEventId = reservation.schedule_event_id as string | null | undefined
    if (scheduleEventId && reservation.organization_id && !(atomicRejection && reservation.status === 'cancelled')) {
      const snapshot = await fetchEventSnapshotServer(
        db,
        scheduleEventId,
        reservation.organization_id as string,
      )
      const cellDate = String(snapshot?.date ?? '')
      const cellStoreId = String(snapshot?.store_id ?? '')
      const cellTimeSlot = (snapshot?.time_slot as string | null | undefined) ?? null
      if (cellDate && cellStoreId) {
        const customerName =
          (reservation.customer_name as string | undefined)?.trim() ||
          '(お客様)'
        const participantCount = (reservation.participant_count as number | undefined) ?? 0
        // 顧客自身のキャンセルか、スタッフによるキャンセル（貸切拒否含む）かで表示を分ける
        const isCustomerCancel = user.role === 'customer'
        let displayName: string
        let changedByStaffId: string | null = null
        let notes: string
        if (isCustomerCancel) {
          displayName = `${customerName}（お客様）`
          notes = `${customerName}（${participantCount}名）が予約サイトから予約をキャンセル`
        } else {
          // スタッフが API 経由でキャンセル → 操作者の staff 名を取得
          const { data: staffRow } = await db!
            .from('staff')
            .select('id, name')
            .eq('user_id', user.userId)
            .eq('organization_id', user.orgId)
            .maybeSingle()
          const actorName = (staffRow?.name as string | undefined) ?? '(スタッフ)'
          changedByStaffId = (staffRow?.id as string | undefined) ?? null
          // 貸切グループの拒否フロー（skipGroupCancel）は「貸切管理」タグ
          const source = skipGroupCancel ? '貸切管理' : 'スタッフ操作'
          displayName = `${actorName}（${source}）`
          notes = `${customerName}（${participantCount}名）の予約をキャンセル`
        }
        await recordEventHistory(db, {
          scheduleEventId,
          organizationId: reservation.organization_id as string,
          actionType: 'remove_participant',
          oldValues: {
            participant_name: customerName,
            participant_count: participantCount,
            reservation_id: id,
          },
          newValues: null,
          cellInfo: { date: cellDate, storeId: cellStoreId, timeSlot: cellTimeSlot },
          changedByUserId: user.userId,
          changedByStaffId,
          changedByName: displayName,
          notes,
        })
      }
    }
  } catch (historyError) {
    console.error('[reservations:cancel] history record error:', historyError)
  }

  // 組織 slug は通知メール本文の URL 生成用にサーバ側で取得（クライアントは表示用に保持してもよい）
  let orgSlug: string | null = null
  try {
    const { data: org } = await db
      .from('organizations')
      .select('slug')
      .eq('id', reservation.organization_id)
      .maybeSingle()
    orgSlug = (org as { slug?: string } | null)?.slug ?? null
  } catch (orgErr) {
    console.warn('[reservations:cancel] organizations slug fetch error:', orgErr)
  }

  const billingWarning = await recordBillingForCancellation(user, reservation, requestReceivedAt, atomicRejection)

  return res.status(200).json({
    reservation: cancelled,
    billingWarning,
    // クライアントが Edge Function 呼び出しに使う付加情報
    contextForNotifications: {
      reservation, // customers, schedule_events JOIN 込みの完全な予約
      organization_slug: orgSlug,
      skip_group_cancel: skipGroupCancel,
    },
    // 予約はキャンセルできたが、紐づく貸切公演の中止に失敗した場合のみ true
    ...(eventCancelWarning ? { eventCancelWarning: true } : {}),
  })
}
