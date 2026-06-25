/**
 * スタッフ参加予約 同期ヘルパー (edit mode 用)
 *
 * GM 役割を「スタッフ参加 (staff)」にした瞬間に reservations へ 1 件 INSERT、
 * 役割を外したり名前を消した時に対応する予約を DELETE する。
 * add mode (event 未保存) では使えないため、handleSave で別途同期する。
 *
 * PerformanceModal から逐語移設（挙動不変）。
 */
import { supabase } from '@/lib/supabase'
import { reservationApi } from '@/lib/reservationApi'

export async function ensureStaffReservation(params: {
  eventId: string
  staffName: string
  organizationId: string | null
  scenarioTitle: string
  scenarioMasterId: string | null | undefined
  storeId: string | null
}): Promise<void> {
  const { eventId, staffName, organizationId, scenarioTitle, scenarioMasterId, storeId } = params
  // 既に staff_participation の予約が存在するかチェック
  const { data: existing } = await supabase
    .from('reservations')
    .select('id, participant_names')
    .eq('schedule_event_id', eventId)
    .eq('reservation_source', 'staff_participation')
  if (existing?.some(r => Array.isArray(r.participant_names) && r.participant_names.includes(staffName))) {
    return // すでに同名で staff_participation があるので何もしない
  }

  // 顧客検索 (staff の name 一致)
  let customerId: string | null = null
  try {
    let q = supabase.from('customers').select('id').eq('name', staffName)
    if (organizationId) q = q.or(`organization_id.eq.${organizationId},organization_id.is.null`)
    const { data: cust } = await q.limit(1).maybeSingle()
    if (cust) customerId = cust.id
  } catch {/* 顧客なくても予約は作る */}

  const now = new Date()
  const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '')
  const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase()
  const reservationNumber = `${dateStr}-${randomStr}`

  await supabase.from('reservations').insert({
    reservation_number: reservationNumber,
    schedule_event_id: eventId,
    organization_id: organizationId,
    title: scenarioTitle || '',
    scenario_master_id: scenarioMasterId ?? null,
    store_id: storeId,
    customer_id: customerId,
    customer_name: staffName,
    participant_names: [staffName],
    participant_count: 1,
    base_price: 0,
    unit_price: 0,
    total_price: 0,
    final_price: 0,
    discount_amount: 0,
    duration: 240,
    requested_datetime: new Date().toISOString(),
    payment_method: 'staff',
    payment_status: 'paid',
    status: 'confirmed',
    reservation_source: 'staff_participation',
  })
}

export async function removeStaffReservation(eventId: string, staffName: string): Promise<void> {
  const { data: existing } = await supabase
    .from('reservations')
    .select('id, participant_names')
    .eq('schedule_event_id', eventId)
    .eq('reservation_source', 'staff_participation')
  const target = existing?.find(r =>
    Array.isArray(r.participant_names) && r.participant_names.includes(staffName)
  )
  if (target) {
    // 直接 delete は禁止（no-restricted-syntax）。API 層経由で org 境界チェック付きの物理削除にする
    await reservationApi.delete(target.id)
  }
}
