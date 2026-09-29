import { LegacyApprovalError } from './private-approval-legacy.ts'

// 外部リソース作成前に、予約に保存された公演と店舗だけを採用する。
export async function loadPrivateDiscordProvisionContext(supabase:any, reservation:{status:string;schedule_event_id:string|null;organization_id:string}, existing:{schedule_event_id:string}|null) {
    if (!['confirmed', 'gm_confirmed', 'checked_in', 'completed'].includes(reservation.status)
      || !reservation.schedule_event_id) {
      throw new LegacyApprovalError('確定済みの予約と公演が必要です')
    }
    const eventId = reservation.schedule_event_id
    const { data: event, error: eventError } = await supabase
      .from('schedule_events')
      .select('id, date, start_time, store_id, gms, scenario_master_id, is_cancelled')
      .eq('id', eventId)
      .eq('organization_id', reservation.organization_id)
      .maybeSingle()
    if (eventError) throw eventError
    if (!event?.date || !event.start_time || event.is_cancelled !== false) {
      throw new LegacyApprovalError('有効な公演がありません')
    }
    const { data: store, error: storeError } = await supabase.from('stores')
      .select('name, short_name').eq('id', event.store_id)
      .eq('organization_id', reservation.organization_id).maybeSingle()
    if (storeError) throw storeError
    if (!store) throw new LegacyApprovalError('公演の店舗が一致しません')
    if (existing && existing.schedule_event_id !== eventId) {
      throw new LegacyApprovalError('Discordの準備後に公演が変更されています')
    }

 return {event,store}
}
