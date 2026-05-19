import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'
import { requireAuth, requireStaff, createUserScopedClient, ApiError, type AuthUser } from './_lib/auth.js'

// ─── CORS ────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  process.env.ALLOWED_ORIGIN,
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean) as string[]

function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? '*')
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

// ─── 共通 SELECT 文字列 ──────────────────────────────────────────────────────
const RESERVATION_SELECT_FIELDS =
  'id, organization_id, reservation_number, reservation_page_id, title, scenario_id, scenario_master_id, store_id, customer_id, schedule_event_id, requested_datetime, actual_datetime, duration, participant_count, participant_names, assigned_staff, gm_staff, base_price, options_price, total_price, discount_amount, final_price, unit_price, payment_status, payment_method, payment_datetime, status, customer_notes, staff_notes, special_requests, cancellation_reason, cancelled_at, external_reservation_id, reservation_source, created_by, created_at, updated_at, customer_name, customer_email, customer_phone, private_group_id, candidate_datetimes'

const CUSTOMER_SELECT_FIELDS =
  'id, organization_id, user_id, name, nickname, email, email_verified, phone, address, line_id, avatar_url, preferences, notification_settings, created_at, updated_at'

const RESERVATION_WITH_CUSTOMER_SELECT_FIELDS = `${RESERVATION_SELECT_FIELDS}, customers(${CUSTOMER_SELECT_FIELDS})`

const SCHEDULE_EVENT_EMBED_FOR_CANCEL =
  'schedule_events!schedule_event_id(id, date, start_time, end_time, venue, scenario, organization_id, is_private_booking, gms, store_id)'

const RESERVATION_WITH_CUSTOMER_AND_EVENT_SELECT_FIELDS = `${RESERVATION_WITH_CUSTOMER_SELECT_FIELDS}, ${SCHEDULE_EVENT_EMBED_FOR_CANCEL}`

const SCHEDULE_EVENT_EMBED_FOR_UPDATE_EMAIL =
  'schedule_events!schedule_event_id(date, start_time, end_time, venue, scenario, store_id)'

const RESERVATION_FOR_UPDATE_EMAIL_SELECT_FIELDS = `${RESERVATION_WITH_CUSTOMER_SELECT_FIELDS}, ${SCHEDULE_EVENT_EMBED_FOR_UPDATE_EMAIL}`

const RESERVATION_SUMMARY_SELECT_FIELDS =
  'schedule_event_id, date, venue, scenario, start_time, end_time, max_participants, current_reservations, available_seats, reservation_count'

// reservation_source の有効値（クライアントから来た値を検証する用）
const ACTIVE_STATUSES = ['pending', 'confirmed', 'gm_confirmed', 'checked_in', 'cancelled'] as const
const RESERVATION_SOURCE_STAFF_ENTRY = 'staff_entry'

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

// 既存の getAll / getByDateRange
async function handleGetAllOrRange(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })
  const start = req.query.start as string | undefined
  const end = req.query.end as string | undefined

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = (db as any)
    .from('reservations')
    .select(RESERVATION_SELECT_FIELDS)
    .eq('organization_id', orgId)

  if (start && end) {
    query = query
      .gte('requested_datetime', start)
      .lte('requested_datetime', end)
      .order('requested_datetime', { ascending: true })
  } else {
    query = query.order('requested_datetime', { ascending: false })
  }

  const { data, error } = await query
  if (error) {
    console.error('[reservations] handleGetAllOrRange error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// getByScheduleEvent: 特定イベントの予約 + customers JOIN
async function handleGetByScheduleEvent(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })
  const scheduleEventId = req.query.schedule_event_id as string | undefined
  if (!scheduleEventId) {
    return res.status(400).json({ error: 'schedule_event_id が必要です' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('reservations')
    .select(RESERVATION_WITH_CUSTOMER_SELECT_FIELDS)
    .eq('schedule_event_id', scheduleEventId)
    .eq('organization_id', orgId)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[reservations:by-schedule-event] error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// getByCustomer
async function handleGetByCustomer(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })
  const customerId = req.query.customer_id as string | undefined
  if (!customerId) {
    return res.status(400).json({ error: 'customer_id が必要です' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('reservations')
    .select(RESERVATION_SELECT_FIELDS)
    .eq('customer_id', customerId)
    .eq('organization_id', orgId)
    .order('requested_datetime', { ascending: false })

  if (error) {
    console.error('[reservations:by-customer] error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// getSummary: reservation_summary ビュー（自組織のスケジュールに限定するため schedule_events で絞る）
async function handleGetSummary(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })
  const scheduleEventId = req.query.schedule_event_id as string | undefined

  // schedule_event_id 指定 → その 1 件のみ。ただし当該 schedule_event が自組織のものであることを確認。
  if (scheduleEventId) {
    const { data: ev, error: evError } = await db
      .from('schedule_events')
      .select('id')
      .eq('id', scheduleEventId)
      .eq('organization_id', orgId)
      .maybeSingle()
    if (evError) {
      console.error('[reservations:summary] schedule_events check error:', evError)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: evError.message })
    }
    if (!ev) {
      return res.status(404).json({ error: 'schedule_event が見つかりません' })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('reservation_summary')
      .select(RESERVATION_SUMMARY_SELECT_FIELDS)
      .eq('schedule_event_id', scheduleEventId)

    if (error) {
      console.error('[reservations:summary] error:', error)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
    }
    return res.status(200).json(data ?? [])
  }

  // schedule_event_id 未指定 → 自組織のスケジュールに紐付くサマリだけを返す
  const { data: events, error: evError } = await db
    .from('schedule_events')
    .select('id')
    .eq('organization_id', orgId)
  if (evError) {
    console.error('[reservations:summary] schedule_events list error:', evError)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: evError.message })
  }
  const ids = (events ?? []).map((e: { id: string }) => e.id)
  if (ids.length === 0) return res.status(200).json([])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('reservation_summary')
    .select(RESERVATION_SUMMARY_SELECT_FIELDS)
    .in('schedule_event_id', ids)

  if (error) {
    console.error('[reservations:summary] in() error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// getAvailability: 空席状況。自組織の schedule_event のみ。
async function handleGetAvailability(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })
  const scheduleEventId = req.query.schedule_event_id as string | undefined
  if (!scheduleEventId) {
    return res.status(400).json({ error: 'schedule_event_id が必要です' })
  }

  // マルチテナント境界: schedule_event が自組織のものか
  const { data: ev, error: evError } = await db
    .from('schedule_events')
    .select('id')
    .eq('id', scheduleEventId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (evError) {
    console.error('[reservations:availability] schedule_events check error:', evError)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: evError.message })
  }
  if (!ev) {
    return res.status(404).json({ error: 'schedule_event が見つかりません' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('reservation_summary')
    .select('schedule_event_id, max_participants, current_reservations, available_seats')
    .eq('schedule_event_id', scheduleEventId)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    console.error('[reservations:availability] error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }

  if (!data) {
    return res.status(200).json({
      maxParticipants: null,
      currentReservations: 0,
      availableSeats: 0,
    })
  }

  return res.status(200).json({
    maxParticipants: data.max_participants,
    currentReservations: data.current_reservations,
    availableSeats: data.available_seats,
  })
}

// ─── POST ルーティング ────────────────────────────────────────────────────────
async function routePost(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const action = (req.query.action as string | undefined) ?? 'create'

  switch (action) {
    case 'create':
      // 顧客（ログイン済み）でも自分自身の予約は作成できる。
      // 権限細分化は RPC 内の auth.uid() ベースの組織境界チェックに任せる。
      return await handleCreate(req, res, user)
    case 'create-staff-entry':
      requireStaff(user)
      return await handleCreateStaffEntry(req, res, user)
    default:
      return res.status(400).json({ error: `unknown action: ${action}` })
  }
}

async function handleCreate(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  const body = (req.body ?? {}) as Record<string, unknown>
  const reservation = (body.reservation ?? body) as Record<string, unknown>

  const scheduleEventId = reservation.schedule_event_id as string | undefined
  const customerId = reservation.customer_id as string | undefined
  const participantCount = reservation.participant_count as number | undefined
  if (!scheduleEventId || !customerId || participantCount == null) {
    return res.status(400).json({
      error: 'schedule_event_id / customer_id / participant_count が必要です',
    })
  }

  // schedule_event の存在確認のみ（org チェックは RPC 内部で実施）
  // RPC が auth.uid() ベースで安全にチェックするため、ここでは不要
  const { data: ev, error: evError } = await db
    .from('schedule_events')
    .select('id, organization_id')
    .eq('id', scheduleEventId)
    .maybeSingle()
  if (evError || !ev) {
    console.error('[reservations:create] schedule_events check error:', evError)
    return res.status(404).json({ error: 'schedule_event が見つかりません' })
  }

  const { data: cust, error: custError } = await db
    .from('customers')
    .select('id, organization_id, user_id')
    .eq('id', customerId)
    .maybeSingle()
  if (custError || !cust) {
    console.error('[reservations:create] customers check error:', custError)
    return res.status(404).json({ error: 'customer が見つかりません' })
  }
  // platform customer (organization_id = NULL) は全組織で利用可
  // guest customer は自組織のみ
  if (cust.organization_id !== null && cust.organization_id !== user.orgId) {
    return res.status(403).json({ error: '他組織の customer は指定できません' })
  }
  // 顧客ロールの場合は自分自身の customers 行のみ作成可
  if (user.role === 'customer' && cust.user_id !== user.userId) {
    return res.status(403).json({ error: '他人の customer に対しては作成できません' })
  }

  // 予約番号（冪等性: クライアント提供を優先）
  const providedReservationNumber = reservation.reservation_number as string | undefined
  const reservationNumber = providedReservationNumber || generateReservationNumber()

  // RPC 呼び出し（auth.uid() を伝播する user-scoped client を使う）
  const userClient = createUserScopedClient(user.jwt)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: createdId, error: rpcError } = await (userClient as any).rpc(
    'create_reservation_with_lock_v2',
    {
      p_schedule_event_id: scheduleEventId,
      p_participant_count: participantCount,
      p_customer_id: customerId,
      p_customer_name: (reservation.customer_name as string | null) ?? null,
      p_customer_email: (reservation.customer_email as string | null) ?? null,
      p_customer_phone: (reservation.customer_phone as string | null) ?? null,
      p_notes: (reservation.customer_notes as string | null) ?? null,
      p_how_found: (reservation as Record<string, unknown>).how_found as string | null ?? null,
      p_reservation_number: reservationNumber,
      p_customer_coupon_id:
        (reservation as Record<string, unknown>).customer_coupon_id as string | null ?? null,
    },
  )

  if (rpcError) {
    console.error('[reservations:create] RPC error:', rpcError)
    // 冪等性: UNIQUE 違反の場合、既存予約を返す
    const code = String((rpcError as { code?: string }).code || '')
    const msg = String((rpcError as { message?: string }).message || '')
    const isUniqueViolation =
      code === '23505' ||
      msg.includes('reservation_number') ||
      msg.includes('duplicate') ||
      msg.includes('unique')
    if (isUniqueViolation && reservationNumber) {
      const { data: existing } = await db
        .from('reservations')
        .select(RESERVATION_SELECT_FIELDS)
        .eq('reservation_number', reservationNumber)
        .eq('organization_id', user.orgId)
        .maybeSingle()
      if (existing) return res.status(200).json(existing)
    }
    // 既知のエラーコードはメッセージを訳して返す
    const known: Record<string, string> = {
      P0001: '参加人数が不正です',
      P0002: '公演が見つかりません',
      P0003: 'この公演は満席です',
      P0004: '選択した人数分の空席がありません',
    }
    if (known[code]) {
      return res.status(400).json({ error: known[code], code, detail: msg })
    }
    return res.status(500).json({ error: '予約作成に失敗しました', detail: msg, code })
  }

  const reservationId = createdId as string | null
  if (!reservationId) {
    return res.status(500).json({ error: '予約 ID が取得できませんでした' })
  }

  const { data: created, error: fetchError } = await db
    .from('reservations')
    .select(RESERVATION_SELECT_FIELDS)
    .eq('id', reservationId)
    .single()

  if (fetchError || !created) {
    console.error('[reservations:create] fetch after insert error:', fetchError)
    return res.status(500).json({ error: '作成後の予約取得に失敗しました' })
  }

  return res.status(201).json(created)
}

// スタッフ参加枠の予約（syncStaffReservations から呼ばれる）
// 通常の create_reservation_with_lock_v2 は payment_method='staff'/reservation_source=staff_entry を扱えないため、
// staff 専用の直接 INSERT エンドポイントとして提供する。
async function handleCreateStaffEntry(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  const body = (req.body ?? {}) as Record<string, unknown>
  const scheduleEventId = body.schedule_event_id as string | undefined
  const staffName = body.staff_name as string | undefined
  const eventDetails = (body.event_details ?? {}) as {
    date?: string
    start_time?: string
    scenario_master_id?: string | null
    scenario_title?: string | null
    store_id?: string | null
    duration?: number | null
  }

  if (!scheduleEventId || !staffName) {
    return res.status(400).json({ error: 'schedule_event_id / staff_name が必要です' })
  }

  // マルチテナント境界: schedule_event が自組織のものか
  const { data: ev, error: evError } = await db
    .from('schedule_events')
    .select('id, organization_id, date, start_time, scenario, scenario_master_id, store_id, duration')
    .eq('id', scheduleEventId)
    .maybeSingle()
  if (evError || !ev) {
    return res.status(404).json({ error: 'schedule_event が見つかりません' })
  }
  if (ev.organization_id !== user.orgId) {
    return res.status(403).json({ error: '他組織の schedule_event は指定できません' })
  }

  const reservationNumber = generateReservationNumber()
  const date = eventDetails.date || ev.date
  const startTime = eventDetails.start_time || ev.start_time

  const payload = {
    organization_id: user.orgId,
    schedule_event_id: scheduleEventId,
    reservation_number: reservationNumber,
    title: eventDetails.scenario_title || ev.scenario || '',
    scenario_master_id: eventDetails.scenario_master_id ?? ev.scenario_master_id ?? null,
    store_id: eventDetails.store_id ?? ev.store_id ?? null,
    customer_id: null,
    customer_notes: staffName,
    requested_datetime: `${date}T${startTime}+09:00`,
    duration: eventDetails.duration ?? ev.duration ?? 120,
    participant_count: 1,
    participant_names: [staffName],
    assigned_staff: [],
    base_price: 0,
    options_price: 0,
    total_price: 0,
    discount_amount: 0,
    final_price: 0,
    payment_method: 'staff',
    payment_status: 'paid',
    status: 'confirmed',
    reservation_source: RESERVATION_SOURCE_STAFF_ENTRY,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: insertError } = await (db as any)
    .from('reservations')
    .insert([payload])
    .select(RESERVATION_SELECT_FIELDS)
    .single()

  if (insertError) {
    console.error('[reservations:create-staff-entry] insert error:', insertError)
    return res.status(500).json({ error: 'スタッフ予約の作成に失敗しました', detail: insertError.message })
  }

  return res.status(201).json(inserted)
}

// ─── PATCH ルーティング ───────────────────────────────────────────────────────
async function routePatch(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const action = (req.query.action as string | undefined) ?? 'update'

  switch (action) {
    case 'update':
      requireStaff(user)
      return await handleUpdate(req, res, user)
    case 'cancel-with-lock':
      // 顧客自身の予約 or staff
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

// 自組織が所有する予約か確認するヘルパ
async function ensureReservationOwnedByOrg(
  reservationId: string,
  orgId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ ok: true; reservation: any } | { ok: false; status: number; error: string }> {
  if (!db) return { ok: false, status: 500, error: 'db unavailable' }
  const { data, error } = await db
    .from('reservations')
    .select('id, organization_id, customer_id, private_group_id, schedule_event_id')
    .eq('id', reservationId)
    .maybeSingle()
  if (error) {
    return { ok: false, status: 500, error: error.message }
  }
  if (!data) {
    return { ok: false, status: 404, error: '予約が見つかりません' }
  }
  if (data.organization_id !== orgId) {
    return { ok: false, status: 403, error: '他組織の予約は操作できません' }
  }
  return { ok: true, reservation: data }
}

async function handleUpdate(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id が必要です' })

  const body = (req.body ?? {}) as Record<string, unknown>
  const updates = (body.updates ?? body) as Record<string, unknown>
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'updates が必要です' })
  }

  // 1) 自組織所有チェック
  const own = await ensureReservationOwnedByOrg(id, user.orgId)
  if (!own.ok) return res.status(own.status).json({ error: own.error })

  // 2) RPC (admin_update_reservation_fields) は SECURITY DEFINER で auth.uid() ベースの追加チェックを行う。
  //    user-scoped client で呼ぶ。
  const userClient = createUserScopedClient(user.jwt)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ok, error: updateError } = await (userClient as any).rpc(
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

async function handleCancelWithLock(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id が必要です' })

  const body = (req.body ?? {}) as Record<string, unknown>
  const customerId = body.customer_id as string | null | undefined
  const reason = (body.cancellation_reason as string | null | undefined) ?? null

  // 自組織所有チェック
  const own = await ensureReservationOwnedByOrg(id, user.orgId)
  if (!own.ok) return res.status(own.status).json({ error: own.error })

  // user-scoped で RPC を呼ぶ（RPC 側で auth.uid() による顧客/スタッフ判定）
  const userClient = createUserScopedClient(user.jwt)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (userClient as any).rpc('cancel_reservation_with_lock', {
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
  return res.status(200).json({ success: true })
}

async function handleCancelWithGroupLock(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id が必要です' })

  const body = (req.body ?? {}) as Record<string, unknown>
  const customerId = body.customer_id as string | null | undefined
  const reason = (body.cancellation_reason as string | null | undefined) ?? null

  const own = await ensureReservationOwnedByOrg(id, user.orgId)
  if (!own.ok) return res.status(own.status).json({ error: own.error })

  const userClient = createUserScopedClient(user.jwt)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (userClient as any).rpc('cancel_reservation_and_group_with_lock', {
    p_reservation_id: id,
    p_customer_id: customerId ?? null,
    p_cancellation_reason: reason,
  })

  if (error) {
    console.error('[reservations:cancel-with-group-lock] RPC error:', error)
    return res.status(500).json({ error: '予約+グループのキャンセルに失敗しました', detail: error.message })
  }
  if (data !== true) {
    return res.status(500).json({ error: '予約+グループのキャンセルに失敗しました（DB 側）' })
  }
  return res.status(200).json({ success: true })
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
async function handleCancelOrchestrated(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id が必要です' })

  const body = (req.body ?? {}) as Record<string, unknown>
  const reason = (body.cancellation_reason as string | null | undefined) ?? null
  const skipGroupCancel = Boolean(body.skip_group_cancel)

  // 1) 予約 + customers + schedule_events を取得（マルチテナント境界チェックも兼ねる）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reservation, error: fetchError } = await (db as any)
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
    return res.status(403).json({ error: '他組織の予約は操作できません' })
  }

  // 2) RPC でキャンセル
  const userClient = createUserScopedClient(user.jwt)
  if (skipGroupCancel) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (userClient as any).rpc('cancel_reservation_with_lock', {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (userClient as any).rpc('cancel_reservation_and_group_with_lock', {
      p_reservation_id: id,
      p_customer_id: reservation.customer_id ?? null,
      p_cancellation_reason: reason,
    })
    if (error || data !== true) {
      console.error('[reservations:cancel] cancel_reservation_and_group_with_lock error:', error, 'data:', data)
      return res.status(500).json({
        error: '予約+グループのキャンセルに失敗しました',
        detail: error?.message,
      })
    }
  }

  // 3) グループキャンセルの場合のみ、システムメッセージを送信
  if (reservation.private_group_id && !skipGroupCancel) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: settings } = await (db as any)
      .from('global_settings')
      .select('system_msg_booking_cancelled_title, system_msg_booking_cancelled_body')
      .eq('organization_id', reservation.organization_id)
      .maybeSingle()

    const title = settings?.system_msg_booking_cancelled_title || 'ご予約がキャンセルされました'
    const messageBody =
      settings?.system_msg_booking_cancelled_body ||
      reason ||
      '誠に申し訳ございませんが、やむを得ない事情によりご予約がキャンセルとなりました。'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('private_group_messages').insert({
      group_id: reservation.private_group_id,
      sender_type: 'system',
      message: JSON.stringify({
        type: 'system',
        action: 'booking_cancelled',
        title,
        body: messageBody,
      }),
    })
  }

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

  return res.status(200).json({
    reservation: cancelled,
    // クライアントが Edge Function 呼び出しに使う付加情報
    contextForNotifications: {
      reservation, // customers, schedule_events JOIN 込みの完全な予約
      organization_slug: orgSlug,
      skip_group_cancel: skipGroupCancel,
    },
  })
}

async function handleUpdateParticipantsWithLock(
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

  const own = await ensureReservationOwnedByOrg(id, user.orgId)
  if (!own.ok) return res.status(own.status).json({ error: own.error })

  const userClient = createUserScopedClient(user.jwt)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (userClient as any).rpc('update_reservation_participants', {
    p_reservation_id: id,
    p_new_count: newCount,
    p_customer_id: customerId,
  })

  if (error) {
    console.error('[reservations:update-participants-with-lock] RPC error:', error)
    const code = String((error as { code?: string }).code || '')
    const known: Record<string, string> = {
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

async function handleRecalculatePrices(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id が必要です' })

  const body = (req.body ?? {}) as Record<string, unknown>
  const participantNames = (body.participant_names as string[] | null | undefined) ?? null

  const own = await ensureReservationOwnedByOrg(id, user.orgId)
  if (!own.ok) return res.status(own.status).json({ error: own.error })

  const userClient = createUserScopedClient(user.jwt)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (userClient as any).rpc('admin_recalculate_reservation_prices', {
    p_reservation_id: id,
    p_participant_names: participantNames,
  })

  if (error) {
    console.error('[reservations:recalculate-prices] RPC error:', error)
    return res.status(500).json({ error: '料金再計算に失敗しました', detail: error.message })
  }
  return res.status(200).json({ success: Boolean(data) })
}

// syncStaffReservations から呼ばれる、複数予約のステータスを一括 cancelled に変更するエンドポイント。
// （旧 client の syncStaffReservations は this.update(id, { status: 'cancelled' }) を for ループで呼んでいた）
async function handleSyncStaffReservationStatuses(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })
  const body = (req.body ?? {}) as Record<string, unknown>
  const ids = body.reservation_ids as string[] | undefined
  const newStatus = (body.status as string | undefined) ?? 'cancelled'
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'reservation_ids（配列）が必要です' })
  }

  // 全 ID が自組織のものか確認
  const { data: owned, error: ownedError } = await db
    .from('reservations')
    .select('id, organization_id')
    .in('id', ids)
  if (ownedError) {
    console.error('[reservations:sync-staff] owned check error:', ownedError)
    return res.status(500).json({ error: '所有確認に失敗しました', detail: ownedError.message })
  }
  const ownedIds = new Set((owned ?? []).filter(
    (r: { organization_id: string }) => r.organization_id === user.orgId,
  ).map((r: { id: string }) => r.id))
  const safeIds = ids.filter(id => ownedIds.has(id))
  if (safeIds.length === 0) {
    return res.status(403).json({ error: '対象予約が見つからない、または他組織の予約です' })
  }

  // 直接 UPDATE（service_role で RLS バイパス + 上で組織検証済み）。
  // RPC を使わない理由: admin_update_reservation_fields は 1 件ずつしか扱わないため、N+1 を避ける。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (db as any)
    .from('reservations')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .in('id', safeIds)
    .eq('organization_id', user.orgId)

  if (updateError) {
    console.error('[reservations:sync-staff] update error:', updateError)
    return res.status(500).json({ error: '一括ステータス更新に失敗しました', detail: updateError.message })
  }
  return res.status(200).json({ success: true, updatedCount: safeIds.length })
}

// ─── DELETE ───────────────────────────────────────────────────────────────────
async function routeDelete(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  requireStaff(user)

  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id が必要です' })

  const own = await ensureReservationOwnedByOrg(id, user.orgId)
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

// ─── ユーティリティ ───────────────────────────────────────────────────────────
function generateReservationNumber(): string {
  const now = new Date()
  const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '')
  const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `${dateStr}-${randomStr}`
}
