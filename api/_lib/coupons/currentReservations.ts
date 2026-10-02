// api/coupons.ts の顧客のクーポン使用候補の予約（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { type AuthUser } from '../auth.js'
import { findCustomerByUserId } from './common.js'

// =========================================
// 顧客向け: 現在進行中の予約（クーポン使用時の紐付け候補）
// =========================================
export async function handleCurrentReservations(
  _req: VercelRequest,
  res: VercelResponse,
  user: AuthUser
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any

  const customer = await findCustomerByUserId(database, user.userId, user.orgId, 'id, name, organization_id') as
    | { id: string; name: string | null; organization_id: string | null }
    | null

  // スタッフ情報（スタッフ予約のマッチング用）— 組織スコープも検証
  const { data: staffRows } = await database
    .from('staff')
    .select('id, name, organization_id')
    .eq('user_id', user.userId)
    .eq('organization_id', user.orgId)
    .limit(1)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const staffRecord = ((staffRows as any[]) ?? [])[0] ?? null

  if (!customer && !staffRecord) return res.status(200).json([])

  // 日付境界はサーバーのタイムゾーンに依存させない。
  const todayStr = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // 1. 通常予約（自分が customer_id の予約 / 組織スコープも検証）
  // ⚠️ platform customer (user.orgId='') の場合、reservations.organization_id は実際の
  //    予約先 org の UUID なので .eq(organization_id, '') では一致せず 0 件になる。
  //    user.orgId が空のときは org フィルタを掛けず、customer_id 一致だけで安全に絞る。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let directReservations: any[] = []
  if (customer) {
    let q = database
      .from('reservations')
      .select('id, schedule_event_id, organization_id')
      .eq('customer_id', customer.id)
      .in('status', ['confirmed', 'checked_in'])
    if (user.orgId) q = q.eq('organization_id', user.orgId)
    const { data, error } = await q
    if (error) return res.status(500).json({ error: '予約を取得できませんでした' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    directReservations = (data as any[]) ?? []
  }

  // 2. 貸切公演の参加メンバーとしての予約
  // SECURITY DEFINER RPC は auth.uid() に依存するためサーバ側からは使えない。
  // 同等のクエリをサーバで明示的に組み、結果を必ず本人の user_id + 自組織で再検証する。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const privateGroupReservations: Array<{ reservation_id: string; schedule_event_id: string | null; reservation_status: string; group_status: string }> = []
  {
    const { data: members, error: membersError } = await database
      .from('private_group_members')
      .select('group_id')
      .eq('user_id', user.userId)
      .eq('status', 'joined')

    if (membersError) return res.status(500).json({ error: '貸切の参加情報を取得できませんでした' })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groupIds = ((members as any[]) ?? []).map((m: any) => m.group_id).filter(Boolean)
    if (groupIds.length > 0) {
      // platform customer は user.orgId='' なので org フィルタを条件付きに
      let groupsQ = database
        .from('private_groups')
        .select('id, reservation_id, status, organization_id')
        .in('id', groupIds)
        .not('reservation_id', 'is', null)
      if (user.orgId) groupsQ = groupsQ.eq('organization_id', user.orgId)
      const { data: groups, error: groupsError } = await groupsQ
      if (groupsError) return res.status(500).json({ error: '貸切の予約を取得できませんでした' })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reservationIds = ((groups as any[]) ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((g: any) => g.reservation_id)
        .filter(Boolean)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const groupStatusByRes = new Map<string, string>(((groups as any[]) ?? []).map((g: any) => [g.reservation_id, g.status]))

      if (reservationIds.length > 0) {
        let resQ = database
          .from('reservations')
          .select('id, schedule_event_id, status, organization_id')
          .in('id', reservationIds)
        if (user.orgId) resQ = resQ.eq('organization_id', user.orgId)
        const { data: reservationRows, error: reservationsError } = await resQ
        if (reservationsError) return res.status(500).json({ error: '予約を取得できませんでした' })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const r of ((reservationRows as any[]) ?? [])) {
          privateGroupReservations.push({
            reservation_id: r.id,
            schedule_event_id: r.schedule_event_id ?? null,
            reservation_status: r.status,
            group_status: groupStatusByRes.get(r.id) ?? '',
          })
        }
      }
    }
  }

  // 3. スタッフ予約（payment_method='staff' or reservation_source='staff_entry'/'staff_participation'）— 組織スコープ
  // platform customer (staffRecord 無し / user.orgId 空) はそもそも staff 予約を持たないのでスキップ
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let staffReservations: any[] = []
  if (staffRecord && user.orgId) {
    const { data, error } = await database
      .from('reservations')
      .select('id, participant_names, schedule_event_id, organization_id')
      .or('payment_method.eq.staff,reservation_source.eq.staff_entry,reservation_source.eq.staff_participation')
      .in('status', ['confirmed', 'checked_in'])
      .eq('organization_id', user.orgId)
    if (error) return res.status(500).json({ error: '予約を取得できませんでした' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    staffReservations = (data as any[]) ?? []
  }

  // schedule_event_id を収集して、一括取得（組織スコープ）
  const eventIds = new Set<string>()
  directReservations.forEach((r) => { if (r.schedule_event_id) eventIds.add(r.schedule_event_id) })
  privateGroupReservations.forEach((r) => { if (r.schedule_event_id) eventIds.add(r.schedule_event_id) })
  staffReservations.forEach((r) => { if (r.schedule_event_id) eventIds.add(r.schedule_event_id) })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventsMap: Record<string, any> = {}
  if (eventIds.size > 0) {
    // platform customer (user.orgId='') の場合、reservation 自体は他組織のものを
    // 既に許可しているので、events 取得時の org フィルタも条件付きにする。
    let evQ = database
      .from('schedule_events')
      .select('id, date, start_time, end_time, scenario, venue, organization_id, category, scenario_master_id, organization_scenario_id, scenario_id, stores!schedule_events_store_id_fkey(name)')
      .in('id', Array.from(eventIds))
    if (user.orgId) evQ = evQ.eq('organization_id', user.orgId)
    const { data: events, error: eventsError } = await evQ
    if (eventsError) return res.status(500).json({ error: '公演情報を取得できませんでした' })
    if (events) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const ev of events as any[]) {
        eventsMap[ev.id] = ev
      }
    }
  }

  // 結果をマージ
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allReservations: Array<{ id: string; event: any }> = []

  for (const r of directReservations) {
    const event = eventsMap[r.schedule_event_id]
    if (event) allReservations.push({ id: r.id, event })
  }

  for (const r of privateGroupReservations) {
    if (r.group_status !== 'confirmed') continue
    if (!['confirmed', 'checked_in'].includes(r.reservation_status)) continue
    const event = r.schedule_event_id ? eventsMap[r.schedule_event_id] : undefined
    if (event && !allReservations.some(existing => existing.id === r.reservation_id)) {
      allReservations.push({ id: r.reservation_id, event })
    }
  }

  const myNames: string[] = []
  if (customer?.name) myNames.push(customer.name)
  if (staffRecord?.name && !myNames.includes(staffRecord.name)) myNames.push(staffRecord.name)

  if (myNames.length > 0) {
    for (const r of staffReservations) {
      const names = r.participant_names as string[] | null
      if (names && names.some((n: string) => myNames.includes(n))) {
        const event = eventsMap[r.schedule_event_id]
        if (event && !allReservations.some(existing => existing.id === r.id)) {
          allReservations.push({ id: r.id, event })
        }
      }
    }
  }

  // 利用予定の確定予約も表示する。実際の利用条件は共通RPCで再確認する。
  const filtered = allReservations
    .filter(({ event }) => event?.date >= todayStr)
    .sort((a, b) => `${a.event.date} ${a.event.start_time}`.localeCompare(`${b.event.date} ${b.event.start_time}`))
    .map(({ id, event }) => ({
      id,
      scenario_title: event.scenario || '不明なシナリオ',
      organization_id: event.organization_id,
      murder_mystery_eligible: ['open', 'private'].includes(event.category) && !!(event.scenario_master_id || event.organization_scenario_id || event.scenario_id),
      store_name: event.stores?.name || event.venue || '不明な店舗',
      date: event.date,
      time: event.start_time.substring(0, 5),
    }))

  return res.status(200).json(filtered)
}
