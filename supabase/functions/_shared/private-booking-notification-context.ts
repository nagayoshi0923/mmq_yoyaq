/** 通知の内容・組織は呼び出し元の本文ではなく保存済み予約から確定する。 */
export async function loadPrivateBookingNotificationContext(db: any, reservationId: string, callerUserId: string | null) {
  if (!reservationId) throw new Error('Reservation ID is required')
  const result = await db.from('reservations').select('id,organization_id,scenario_master_id,scenario_id,title,customer_name,customer_email,customer_phone,participant_count,candidate_datetimes,customer_notes,created_at,reservation_source,reservation_type,status').eq('id', reservationId).maybeSingle()
  if (result.error) throw result.error
  const booking = result.data
  if (!booking?.organization_id) throw new Error('Reservation not found')
  if (!['private_booking', 'private'].includes(booking.reservation_type) || ['cancelled', 'completed'].includes(booking.status)) throw new Error('Reservation is not accepting GM responses')
  if (callerUserId) {
    const caller = await db.from('users').select('organization_id,role').eq('id', callerUserId).maybeSingle()
    if (caller.error) throw caller.error
    if (caller.data?.organization_id !== booking.organization_id || !['admin', 'license_admin', 'owner'].includes(caller.data?.role)) {
      throw new Error('Forbidden')
    }
    const staff = await db.from('staff').select('status').eq('user_id', callerUserId).eq('organization_id', booking.organization_id)
    if (staff.error) throw staff.error
    if (staff.data?.length && staff.data.every((row: any) => ['inactive', 'resigned'].includes(row.status))) throw new Error('Forbidden')
  }
  let masterId = booking.scenario_master_id
  if (!masterId && booking.scenario_id) {
    const legacy = await db.from('organization_scenarios').select('scenario_master_id').eq('id', booking.scenario_id).eq('organization_id', booking.organization_id).maybeSingle()
    if (legacy.error) throw legacy.error
    masterId = legacy.data?.scenario_master_id ?? booking.scenario_id
  }
  if (!masterId) throw new Error('Scenario not found')
  const scenario = await db.from('organization_scenarios').select('scenario_master_id').eq('scenario_master_id', masterId).eq('organization_id', booking.organization_id).maybeSingle()
  if (scenario.error) throw scenario.error
  if (!scenario.data) throw new Error('Scenario not found in reservation organization')
  return { ...booking, scenario_title: (booking.title ?? '').replace(/^【貸切希望】\s*/, ''), notes: booking.customer_notes, scenario_master_id: masterId, scenario_id: masterId }
}

/** 未回答行の作成対象も通知対象も、同じ有効な担当者集合を使う。 */
export async function loadPrivateBookingAssignedStaff(db: any, organizationId: string, scenarioMasterId: string) {
  const assignments = await db.from('staff_scenario_assignments').select('staff_id')
    .eq('organization_id', organizationId).eq('scenario_master_id', scenarioMasterId)
    .or('can_main_gm.eq.true,can_sub_gm.eq.true')
  if (assignments.error) throw assignments.error
  const ids = [...new Set((assignments.data ?? []).map((row: any) => row.staff_id))]
  if (!ids.length) return []
  const staff = await db.from('staff').select('id,name,discord_channel_id,discord_user_id')
    .in('id', ids).eq('organization_id', organizationId).eq('status', 'active')
  if (staff.error) throw staff.error
  return staff.data ?? []
}
