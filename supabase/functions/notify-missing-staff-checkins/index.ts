/**
 * 公演開始55分前の担当GM出勤打刻漏れを、組織の業務連絡チャンネルへ通知する。
 * pg_cronから毎分呼び出され、Discord送信は既存の通知キュー／リトライ経路へ委ねる。
 */

// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getCorsHeaders,
  getServiceRoleKey,
  isCronOrServiceRoleCall,
  errorResponse,
  sanitizeErrorMessage,
} from '../_shared/security.ts'
import { getDiscordSettings, getOrganizationSettings } from '../_shared/organization-settings.ts'
import {
  buildDedupeKey,
  findMissingCheckinCandidates,
  getJstDateRange,
  type CheckinRecord,
  type CheckinStaff,
  type MissingCheckinEvent,
} from './logic.ts'

const NOTIFICATION_TYPE = 'staff_checkin_missing'

function isDiscordChannelId(value: unknown): value is string {
  return typeof value === 'string' && /^\d{15,25}$/.test(value)
}

function formatMessage(candidate: { event: MissingCheckinEvent; staff: CheckinStaff }): Record<string, unknown> {
  const { event, staff } = candidate
  return {
    username: 'MMQ 出勤打刻通知',
    content: [
      '⚠️ 出勤打刻漏れ通知',
      `未打刻: ${staff.name}`,
      `店舗: ${event.store_name || '店舗名未設定'}`,
      `公演開始時刻（JST）: ${event.date} ${event.start_time.slice(0, 5)}`,
      `公演名: ${event.scenario || '公演名未設定'}`,
      `未打刻GM名: ${staff.name}`,
    ].join('\n'),
  }
}

async function enqueueNotification(
  supabase: ReturnType<typeof createClient>,
  candidate: { event: MissingCheckinEvent; staff: CheckinStaff },
  endpoint: string,
): Promise<'queued' | 'duplicate'> {
  const { data, error } = await supabase
    .from('discord_notification_queue')
    .upsert({
      organization_id: candidate.event.organization_id,
      webhook_url: endpoint,
      message_payload: formatMessage(candidate),
      notification_type: NOTIFICATION_TYPE,
      reference_id: candidate.event.id,
      dedupe_key: buildDedupeKey(candidate),
      status: 'pending',
      retry_count: 0,
      max_retries: 3,
      next_retry_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'organization_id,notification_type,dedupe_key',
      ignoreDuplicates: true,
    })
    .select('id')
    .maybeSingle()

  if (error) throw error
  return data?.id ? 'queued' : 'duplicate'
}

async function processOrganization(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  events: MissingCheckinEvent[],
  now: Date,
): Promise<{ queued: number; duplicates: number; skipped: number }> {
  const organizationSettings = await getOrganizationSettings(supabase, organizationId)
  const businessChannelId = organizationSettings?.discord_business_channel_id
  const discord = await getDiscordSettings(supabase, organizationId)
  if (!businessChannelId) return { queued: 0, duplicates: 0, skipped: events.length }

  const channelEndpoint = isDiscordChannelId(businessChannelId)
    ? `https://discord.com/api/v10/channels/${businessChannelId}/messages`
    : null
  const endpoint = discord.botToken ? channelEndpoint : discord.webhookUrl
  if (!endpoint || (discord.botToken && !channelEndpoint)) {
    console.warn(`⏭️ Discord送信設定なし、出勤打刻漏れ通知をスキップ: org=${organizationId}`)
    return { queued: 0, duplicates: 0, skipped: events.length }
  }

  const [{ data: staff, error: staffError }, { data: stores, error: storesError }] = await Promise.all([
    supabase
      .from('staff')
      .select('id, organization_id, name, status')
      .eq('organization_id', organizationId)
      .eq('status', 'active'),
    supabase
      .from('stores')
      .select('id, organization_id, name')
      .eq('organization_id', organizationId),
  ])
  if (staffError) throw staffError
  if (storesError) throw storesError

  const staffIds = (staff ?? []).map((member: CheckinStaff) => member.id)
  const dates = [...new Set(events.map(event => event.date))]
  const sortedDates = dates.sort()
  const firstDate = sortedDates[0]
  const lastDate = sortedDates.at(-1)
  const endDate = lastDate
    ? getJstDateRange(new Date(`${lastDate}T00:00:00+09:00`))[1]
    : null
  const { data: checkins, error: checkinError } = staffIds.length && firstDate && lastDate
    ? await supabase
      .from('staff_checkins')
      .select('staff_id, store_id, organization_id, checked_in_at')
      .eq('organization_id', organizationId)
      .in('staff_id', staffIds)
      .gte('checked_in_at', `${firstDate}T00:00:00+09:00`)
      .lt('checked_in_at', `${endDate}T00:00:00+09:00`)
    : { data: [], error: null }
  if (checkinError) throw checkinError

  const storeById = new Map((stores ?? []).map((store: { id: string; name: string }) => [store.id, store]))
  const enrichedEvents = events.map(event => ({
    ...event,
    store_name: storeById.get(event.store_id)?.name || event.store_name,
  }))
  const candidates = findMissingCheckinCandidates(
    enrichedEvents,
    (staff ?? []) as CheckinStaff[],
    (checkins ?? []) as CheckinRecord[],
    now,
  )

  let queued = 0
  let duplicates = 0
  let skipped = 0
  for (const candidate of candidates) {
    try {
      const result = await enqueueNotification(supabase, candidate, endpoint)
      if (result === 'queued') queued++
      else duplicates++
    } catch (error) {
      skipped++
      console.error(`❌ 出勤打刻漏れ通知キュー登録失敗: org=${organizationId}, event=${candidate.event.id}, staff=${candidate.staff.id}`, error)
    }
  }
  return { queued, duplicates, skipped }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return errorResponse('Method Not Allowed', 405, corsHeaders)
  if (!isCronOrServiceRoleCall(req)) return errorResponse('Unauthorized', 401, corsHeaders)

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', getServiceRoleKey())
    const now = new Date()
    const [today, nextDate] = getJstDateRange(now)
    const { data: rawEvents, error: eventError } = await supabase
      .from('schedule_events')
      .select('id, organization_id, store_id, date, start_time, scenario, gms, status, is_cancelled')
      .in('date', [today, nextDate])
      .not('store_id', 'is', null)
    if (eventError) throw eventError

    const storeIds = [...new Set((rawEvents ?? []).map((event: { store_id: string | null }) => event.store_id).filter(Boolean))]
    const { data: stores, error: storesError } = storeIds.length
      ? await supabase.from('stores').select('id, organization_id, name').in('id', storeIds)
      : { data: [], error: null }
    if (storesError) throw storesError
    const storeByOrgAndId = new Map((stores ?? []).map((store: { id: string; organization_id: string; name: string }) => [`${store.organization_id}:${store.id}`, store]))
    const eventsByOrganization = new Map<string, MissingCheckinEvent[]>()
    for (const rawEvent of rawEvents ?? []) {
      if (!rawEvent.organization_id || !rawEvent.store_id) continue
      const store = storeByOrgAndId.get(`${rawEvent.organization_id}:${rawEvent.store_id}`)
      if (!store) continue
      const event: MissingCheckinEvent = {
        ...rawEvent,
        store_id: rawEvent.store_id,
        store_name: store.name,
      }
      const list = eventsByOrganization.get(event.organization_id) ?? []
      list.push(event)
      eventsByOrganization.set(event.organization_id, list)
    }

    let queued = 0
    let duplicates = 0
    let skipped = 0
    for (const [organizationId, events] of eventsByOrganization) {
      try {
        const result = await processOrganization(supabase, organizationId, events, now)
        queued += result.queued
        duplicates += result.duplicates
        skipped += result.skipped
      } catch (error) {
        skipped += events.length
        console.error(`❌ 組織単位の出勤打刻漏れ通知処理失敗: org=${organizationId}`, error)
      }
    }

    return new Response(JSON.stringify({ success: true, queued, duplicates, skipped, organizations: eventsByOrganization.size }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('❌ 出勤打刻漏れ通知エラー:', error)
    return errorResponse(sanitizeErrorMessage(error?.message || '出勤打刻漏れ通知に失敗しました'), 500, corsHeaders)
  }
})
