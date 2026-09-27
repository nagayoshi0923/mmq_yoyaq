import { readPrivateBookingReadiness, type ReadinessReservation } from '../../supabase/functions/_shared/privateBookingReadiness.js'
import { RESERVATION_SOURCE } from '../../src/lib/constants.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError, type AuthUser } from './auth.js'

export async function readGmResponses(database: SupabaseClient, user: AuthUser, query: Record<string, unknown>) {
  const mine = query.mine === 'true'
  const ids = typeof query.reservation_ids === 'string' ? query.reservation_ids.split(',') : []
  if (!mine && (ids.length === 0 || ids.length > 100 || ids.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))) {
    throw new ApiError(400, '予約IDを指定してください（最大100件）')
  }
  let staffId: string | null = null
  let staffName = ''
  if (mine) {
    const { data, error } = await database.from('staff').select('id,name')
      .eq('user_id', user.userId).eq('organization_id', user.orgId).maybeSingle()
    if (error) throw new ApiError(500, 'スタッフ情報を取得できませんでした')
    if (!data) return { responses: [], staffId: null, staffName }
    staffId = data.id
    staffName = data.name || ''
  }
  const responses: unknown[] = []
  for (let offset = 0; ; offset += 1000) {
    let request = database.from('gm_availability_responses').select(`
      id, reservation_id, staff_id, gm_name, response_status, available_candidates,
      selected_candidate_index, notes, notified_at, response_datetime, responded_at,
      updated_at, created_at, response_type, gm_discord_id,
      staff:staff_id!inner(id,name,avatar_color),
      reservations:reservation_id!inner(reservation_number,title,customer_name,candidate_datetimes,status,store_id,created_at,
        stores:store_id(id,name,short_name))
    `).eq('organization_id', user.orgId).eq('staff.organization_id', user.orgId)
      .eq('reservations.organization_id', user.orgId)
      .order('response_datetime', { ascending: false }).order('id', { ascending: true })
    request = mine ? request.eq('staff_id', staffId!) : request.in('reservation_id', ids)
    const { data, error } = await request.range(offset, offset + 999)
    if (error) throw new ApiError(500, 'GM回答を取得できませんでした')
    responses.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return { responses, staffId, staffName }
}

export async function readGmReadiness(database: SupabaseClient, user: AuthUser, query: Record<string, unknown>) {
  const ids = typeof query.reservation_ids === 'string' ? query.reservation_ids.split(',') : []
  if (!ids.length || ids.length > 100 || ids.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) throw new ApiError(400, '予約IDを指定してください（最大100件）')
  const { data, error } = await database.from('reservations').select('id,organization_id,scenario_master_id,candidate_datetimes')
    .eq('organization_id', user.orgId).eq('reservation_source', RESERVATION_SOURCE.WEB_PRIVATE).in('id', ids)
  if (error) throw new ApiError(500, 'GMの担当条件を取得できませんでした')
  return { readiness: await readPrivateBookingReadiness(database, user.orgId, (data || []) as ReadinessReservation[]) }
}

export async function readGmPendingCount(database: SupabaseClient, user: AuthUser) {
  try {
    const reservations: ReadinessReservation[] = []
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await database.from('reservations').select('id,organization_id,scenario_master_id,candidate_datetimes')
        .eq('organization_id', user.orgId).eq('reservation_source', RESERVATION_SOURCE.WEB_PRIVATE)
        .in('status', ['pending', 'pending_gm', 'gm_confirmed', 'pending_store']).order('id').range(offset, offset + 999)
      if (error) throw error
      reservations.push(...((data || []) as ReadinessReservation[]))
      if (!data || data.length < 1000) break
    }
    const readiness = await readPrivateBookingReadiness(database, user.orgId, reservations)
    return { count: Object.values(readiness).filter(Boolean).length }
  } catch {
    throw new ApiError(500, '店舗承認待ち件数を取得できませんでした')
  }
}
