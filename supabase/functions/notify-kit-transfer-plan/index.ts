/**
 * キット移動計画 Discord 通知 Edge Function
 *
 * 毎週月曜日と金曜日に pg_cron から呼び出され、
 * 各組織の discord_business_channel_id にキット移動計画を送信する。
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getCorsHeaders,
  isCronOrServiceRoleCall,
  getServiceRoleKey,
  errorResponse,
} from '../_shared/security.ts'
import {
  getDiscordSettings,
  sendDiscordNotificationWithRetry,
} from '../_shared/organization-settings.ts'

// ---------------------------------------------------------------------------
// Kit optimizer (port from src/utils/kitOptimizer.ts for Deno Edge Runtime)
// ---------------------------------------------------------------------------

type KitState = Record<string, Record<number, string>>

interface Demand {
  date: string
  store_id: string
  scenario_id: string
}

interface StoreInfo {
  id: string
  name: string
  short_name?: string | null
  address?: string | null
  region?: string | null
  kit_group_id?: string | null
}

interface ScenarioInfo {
  id: string
  title: string
  kit_count: number
}

interface TransferSuggestion {
  scenario_id: string
  scenario_title: string
  kit_number: number
  from_store_id: string
  from_store_name: string
  to_store_id: string
  to_store_name: string
  transfer_date: string
  performance_date: string
  reason: string
}

const PREFECTURES = [
  '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
  '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
  '新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県',
  '静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県',
  '奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県',
  '徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県',
  '熊本県','大分県','宮崎県','鹿児島県','沖縄県',
]

function extractPrefecture(address: string): string {
  for (const pref of PREFECTURES) {
    if (address.startsWith(pref)) return pref
  }
  return ''
}

function extractCity(address: string): string {
  const prefecture = extractPrefecture(address)
  const afterPref = address.slice(prefecture.length)
  const match = afterPref.match(/^(.+?[市区町村郡])/)
  return match ? match[1] : ''
}

function calculateAddressProximity(a1: string, a2: string): number {
  if (!a1 || !a2) return 0
  const p1 = extractPrefecture(a1)
  const p2 = extractPrefecture(a2)
  if (!p1 || !p2 || p1 !== p2) return 0
  const c1 = extractCity(a1)
  const c2 = extractCity(a2)
  return c1 && c2 && c1 === c2 ? 3 : 2
}

function getPreviousDay(dateStr: string): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

function findNearestTransferDay(targetDateStr: string, allowedDays: number[]): string {
  if (allowedDays.length === 0) return getPreviousDay(targetDateStr)
  const target = new Date(targetDateStr)
  for (let back = 1; back <= 7; back++) {
    const check = new Date(target)
    check.setDate(target.getDate() - back)
    if (allowedDays.includes(check.getDay())) return check.toISOString().split('T')[0]
  }
  return getPreviousDay(targetDateStr)
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function calculateKitTransfers(
  initialState: KitState,
  demands: Demand[],
  scenarios: ScenarioInfo[],
  stores: StoreInfo[],
  allowedTransferDays: number[] = [1, 4],
): TransferSuggestion[] {
  const suggestions: TransferSuggestion[] = []
  const scenarioMap = new Map(scenarios.map(s => [s.id, s]))
  const storeMap = new Map(stores.map(s => [s.id, s]))

  const storeGroupMap = new Map<string, string>()
  for (const store of stores) {
    if (store.kit_group_id) {
      storeGroupMap.set(store.id, store.kit_group_id)
    } else {
      storeGroupMap.set(store.id, store.id)
    }
  }
  const isSameGroup = (a: string, b: string) =>
    (storeGroupMap.get(a) || a) === (storeGroupMap.get(b) || b)

  const state: KitState = JSON.parse(JSON.stringify(initialState))
  const sortedDemands = [...demands].sort((a, b) => a.date.localeCompare(b.date))

  const demandsByDate = new Map<string, Demand[]>()
  for (const d of sortedDemands) {
    if (!demandsByDate.has(d.date)) demandsByDate.set(d.date, [])
    demandsByDate.get(d.date)!.push(d)
  }

  for (const date of [...demandsByDate.keys()].sort()) {
    const dayDemands = demandsByDate.get(date)!
    const storeNeeds = new Map<string, Map<string, number>>()
    for (const d of dayDemands) {
      if (!storeNeeds.has(d.store_id)) storeNeeds.set(d.store_id, new Map())
      const sn = storeNeeds.get(d.store_id)!
      sn.set(d.scenario_id, (sn.get(d.scenario_id) || 0) + 1)
    }

    for (const [storeId, scenarioNeeds] of storeNeeds) {
      for (const [scenarioId, needCount] of scenarioNeeds) {
        const scenario = scenarioMap.get(scenarioId)
        const store = storeMap.get(storeId)
        if (!scenario || !store) continue

        const kitCount = scenario.kit_count || 1
        const scenarioState = state[scenarioId] || {}
        const available = Object.entries(scenarioState)
          .filter(([_, sid]) => isSameGroup(sid, storeId)).length
        const shortage = Math.max(0, needCount - available)

        if (shortage > 0) {
          const otherKits: Array<{ kitNumber: number; fromStoreId: string; transferDate: string }> = []
          const proposedTransferDate = findNearestTransferDay(date, allowedTransferDays)
          const transferDateDemands = demandsByDate.get(proposedTransferDate) || []

          for (let kitNum = 1; kitNum <= kitCount; kitNum++) {
            const currentLocation = scenarioState[kitNum]
            if (currentLocation && !isSameGroup(currentLocation, storeId)) {
              let fromGroupNeedCount = 0
              for (const [cs, cn] of storeNeeds) {
                if (isSameGroup(cs, currentLocation)) fromGroupNeedCount += cn.get(scenarioId) || 0
              }
              let usedOnTransferDate = false
              for (const td of transferDateDemands) {
                if (td.scenario_id === scenarioId && isSameGroup(td.store_id, currentLocation)) {
                  usedOnTransferDate = true
                  break
                }
              }
              if (usedOnTransferDate || fromGroupNeedCount > 0) continue
              const kitsAtFrom = Object.entries(scenarioState)
                .filter(([_, sid]) => isSameGroup(sid, currentLocation)).length
              if (kitsAtFrom > fromGroupNeedCount) {
                otherKits.push({ kitNumber: kitNum, fromStoreId: currentLocation, transferDate: proposedTransferDate })
              }
            }
          }

          const destRegion = store.region || ''
          const destAddr = store.address || ''
          otherKits.sort((a, b) => {
            const sa = storeMap.get(a.fromStoreId)
            const sb = storeMap.get(b.fromStoreId)
            const rA = sa?.region || '', rB = sb?.region || ''
            const aA = sa?.address || '', aB = sb?.address || ''
            const sameA = rA === destRegion && destRegion !== ''
            const sameB = rB === destRegion && destRegion !== ''
            if (sameA && !sameB) return -1
            if (!sameA && sameB) return 1
            const pA = calculateAddressProximity(aA, destAddr)
            const pB = calculateAddressProximity(aB, destAddr)
            if (pA !== pB) return pB - pA
            if (rA && !rB) return -1
            if (!rA && rB) return 1
            return 0
          })

          for (let i = 0; i < shortage && i < otherKits.length; i++) {
            const { kitNumber, fromStoreId, transferDate } = otherKits[i]
            const fromStore = storeMap.get(fromStoreId)
            suggestions.push({
              scenario_id: scenarioId,
              scenario_title: scenario.title,
              kit_number: kitNumber,
              from_store_id: fromStoreId,
              from_store_name: fromStore?.short_name || fromStore?.name || '不明',
              to_store_id: storeId,
              to_store_name: store.short_name || store.name,
              transfer_date: transferDate,
              performance_date: date,
              reason: `${formatDateShort(date)}に${store.short_name || store.name}で公演予定`,
            })
            if (!state[scenarioId]) state[scenarioId] = {}
            state[scenarioId][kitNumber] = storeId
          }
        }
      }
    }
  }

  // deduplicate
  const seen = new Map<string, TransferSuggestion>()
  for (const s of suggestions) {
    seen.set(`${s.scenario_id}-${s.kit_number}-${s.transfer_date}`, s)
  }
  return [...seen.values()]
}

// ---------------------------------------------------------------------------
// JST helpers
// ---------------------------------------------------------------------------

function jstNow(): Date {
  const now = new Date()
  return new Date(now.getTime() + 9 * 60 * 60 * 1000)
}

function formatJSTDate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

function formatDateWithDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const wd = WEEKDAY_NAMES[dt.getDay()]
  return `${m}/${d}(${wd})`
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchOrganizationsWithDiscord(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('organization_settings')
    .select('organization_id, discord_business_channel_id')
    .not('discord_business_channel_id', 'is', null)

  if (error || !data) {
    console.error('組織設定取得エラー:', error)
    return []
  }
  return data.filter((o: { discord_business_channel_id: string | null }) => o.discord_business_channel_id)
}

async function fetchStores(supabase: SupabaseClient, orgId: string): Promise<StoreInfo[]> {
  const { data, error } = await supabase
    .from('stores')
    .select('id, name, short_name, address, region, kit_group_id')
    .eq('organization_id', orgId)

  if (error) {
    console.error(`店舗取得エラー (org=${orgId}):`, error)
    return []
  }
  return data || []
}

async function fetchScenariosWithKits(supabase: SupabaseClient, orgId: string): Promise<ScenarioInfo[]> {
  const { data, error } = await supabase
    .from('organization_scenarios')
    .select('id, scenario_master_id, scenario_masters(id, title, kit_count)')
    .eq('organization_id', orgId)

  if (error) {
    console.error(`シナリオ取得エラー (org=${orgId}):`, error)
    return []
  }

  const results: ScenarioInfo[] = []
  for (const row of data || []) {
    const master = row.scenario_masters as { id: string; title: string; kit_count?: number } | null
    if (master && (master.kit_count ?? 0) > 0) {
      results.push({ id: master.id, title: master.title, kit_count: master.kit_count! })
    }
  }
  return results
}

async function fetchKitLocations(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ scenario_master_id: string; kit_number: number; store_id: string; condition: string }[]> {
  const { data, error } = await supabase
    .from('scenario_kit_locations')
    .select('kit_number, store_id, condition, organization_scenarios!inner(scenario_master_id)')
    .eq('organization_id', orgId)

  if (error) {
    console.error(`キット位置取得エラー (org=${orgId}):`, error)
    return []
  }

  return (data || []).map((row: Record<string, unknown>) => {
    const os = row.organization_scenarios as { scenario_master_id: string } | null
    return {
      scenario_master_id: os?.scenario_master_id ?? '',
      kit_number: row.kit_number as number,
      store_id: row.store_id as string,
      condition: (row.condition as string) || 'good',
    }
  }).filter((r: { scenario_master_id: string }) => r.scenario_master_id)
}

async function fetchScheduleEvents(
  supabase: SupabaseClient,
  orgId: string,
  startDate: string,
  endDate: string,
): Promise<Demand[]> {
  const { data, error } = await supabase
    .from('schedule_events')
    .select('date, store_id, scenario_master_id, is_cancelled')
    .eq('organization_id', orgId)
    .gte('date', startDate)
    .lte('date', endDate)
    .eq('is_cancelled', false)

  if (error) {
    console.error(`スケジュール取得エラー (org=${orgId}):`, error)
    return []
  }

  // scenario_master_id ごとに日×店舗 をユニークに
  const demandSet = new Set<string>()
  const demands: Demand[] = []
  for (const e of data || []) {
    if (!e.scenario_master_id || !e.store_id) continue
    const key = `${e.date}::${e.store_id}::${e.scenario_master_id}`
    if (!demandSet.has(key)) {
      demandSet.add(key)
      demands.push({ date: e.date, store_id: e.store_id, scenario_id: e.scenario_master_id })
    }
  }
  return demands
}

// ---------------------------------------------------------------------------
// Discord message formatting
// ---------------------------------------------------------------------------

function buildMessage(
  suggestions: TransferSuggestion[],
  weekLabel: string,
  dayLabel: string,
): string {
  const lines: string[] = []
  lines.push(`📦 **${weekLabel} キット移動計画** (${dayLabel})`)
  lines.push('')

  if (suggestions.length === 0) {
    lines.push('✅ 移動は不要です（すべてのキットが適切な店舗にあります）')
    return lines.join('\n')
  }

  lines.push(`移動件数: **${suggestions.length}件**`)
  lines.push('')

  // 移動日ごとにグループ化
  const byTransferDate = new Map<string, TransferSuggestion[]>()
  for (const s of suggestions) {
    if (!byTransferDate.has(s.transfer_date)) byTransferDate.set(s.transfer_date, [])
    byTransferDate.get(s.transfer_date)!.push(s)
  }

  for (const [transferDate, items] of [...byTransferDate.entries()].sort()) {
    lines.push(`**🚚 移動日: ${formatDateWithDay(transferDate)}**`)
    for (const s of items) {
      lines.push(
        `  • **${s.scenario_title}** #${s.kit_number}　${s.from_store_name} → ${s.to_store_name}　（${s.reason}）`,
      )
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Date range helpers
// ---------------------------------------------------------------------------

function getWeekDates(baseDate: Date): string[] {
  const day = baseDate.getUTCDay()
  const diff = (day - 1 + 7) % 7
  const weekStart = new Date(baseDate)
  weekStart.setUTCDate(baseDate.getUTCDate() - diff)

  const dates: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setUTCDate(weekStart.getUTCDate() + i)
    dates.push(formatJSTDate(d))
  }
  return dates
}

/**
 * 移動日（月・金）から需要期間を計算
 * 月曜移動 → 火〜金をカバー, 金曜移動 → 土〜翌月曜をカバー
 */
function getDemandDates(weekDates: string[], transferDays: number[]): string[] {
  const sortedTransferDates = transferDays
    .map(dow => {
      const idx = weekDates.findIndex(d => {
        const [y, m, day] = d.split('-').map(Number)
        return new Date(y, m - 1, day).getDay() === dow
      })
      return idx >= 0 ? weekDates[idx] : null
    })
    .filter(Boolean) as string[]

  if (sortedTransferDates.length === 0) return weekDates

  sortedTransferDates.sort()
  const firstDate = sortedTransferDates[0]
  const lastDate = sortedTransferDates[sortedTransferDates.length - 1]

  const parseDate = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const fmt = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  // 最初の移動日の翌日 〜 最後の移動日 + 次の移動日の前日
  const startD = parseDate(firstDate)
  startD.setDate(startD.getDate() + 1)

  // 次の移動サイクル: 最後の移動日から最大7日先の許可された曜日
  const lastD = parseDate(lastDate)
  let endD = new Date(lastD)
  for (let i = 1; i <= 7; i++) {
    const check = new Date(lastD)
    check.setDate(lastD.getDate() + i)
    if (transferDays.includes(check.getDay())) {
      endD = check
      break
    }
  }

  const result: string[] = []
  const cur = new Date(startD)
  while (cur < endD) {
    result.push(fmt(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return result
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!isCronOrServiceRoleCall(req)) {
      return errorResponse('認証が必要です', 401, corsHeaders)
    }
    console.log('✅ システム認証成功')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getServiceRoleKey(),
    )

    const now = jstNow()
    const todayDow = now.getUTCDay() // 0=Sun ... 6=Sat (JST base)
    const todayStr = formatJSTDate(now)

    // 月曜(1)と金曜(5)に移動
    const transferDays = [1, 5]

    const weekDates = getWeekDates(now)
    const demandDates = getDemandDates(weekDates, transferDays)

    // 需要を取るために少し広めの範囲でイベントを取得
    const startDate = weekDates[0]
    const endDateObj = new Date(now)
    endDateObj.setUTCDate(now.getUTCDate() + 10)
    const endDate = formatJSTDate(endDateObj)

    const weekLabel = `${formatDateWithDay(weekDates[0])}〜${formatDateWithDay(weekDates[6])}`
    const dayLabel = `${formatDateWithDay(todayStr)} 配信`

    const orgs = await fetchOrganizationsWithDiscord(supabase)
    if (orgs.length === 0) {
      console.log('通知先の組織がありません')
      return new Response(JSON.stringify({ success: true, message: '通知先なし' }), {
        headers: corsHeaders,
      })
    }

    console.log(`📦 移動計画通知開始: ${orgs.length}組織`)

    let sentCount = 0

    for (const org of orgs) {
      const orgId = org.organization_id as string
      const channelId = org.discord_business_channel_id as string

      try {
        const [stores, scenarios, kitLocs, events] = await Promise.all([
          fetchStores(supabase, orgId),
          fetchScenariosWithKits(supabase, orgId),
          fetchKitLocations(supabase, orgId),
          fetchScheduleEvents(supabase, orgId, startDate, endDate),
        ])

        if (scenarios.length === 0) {
          console.log(`⏭️ org=${orgId}: キット付きシナリオなし、スキップ`)
          continue
        }

        // Build KitState (good condition only)
        const kitState: KitState = {}
        for (const loc of kitLocs) {
          if (loc.condition !== 'good') continue
          if (!kitState[loc.scenario_master_id]) kitState[loc.scenario_master_id] = {}
          kitState[loc.scenario_master_id][loc.kit_number] = loc.store_id
        }

        // Filter events to demand date range
        const demandSet = new Set(demandDates)
        const filteredDemands = events.filter(e => demandSet.has(e.date))

        const transferDaysOfWeek = transferDays
        const suggestions = calculateKitTransfers(
          kitState,
          filteredDemands,
          scenarios,
          stores,
          transferDaysOfWeek,
        )

        const messageContent = buildMessage(suggestions, weekLabel, dayLabel)

        console.log(`📦 org=${orgId}: ${suggestions.length}件の移動計画`)

        const discordSettings = await getDiscordSettings(supabase, orgId)

        if (discordSettings.botToken) {
          const response = await fetch(
            `https://discord.com/api/v10/channels/${channelId}/messages`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bot ${discordSettings.botToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ content: messageContent }),
            },
          )

          if (response.ok) {
            console.log(`✅ 移動計画通知送信完了: org=${orgId}`)
            sentCount++
          } else {
            const errText = await response.text()
            console.error(`❌ 移動計画通知失敗: org=${orgId}`, response.status, errText)
          }
        } else if (discordSettings.webhookUrl) {
          console.log(`⚠️ Botトークン未設定、Webhookフォールバック: org=${orgId}`)
          const ok = await sendDiscordNotificationWithRetry(
            supabase,
            discordSettings.webhookUrl,
            { content: messageContent, username: 'MMQ キット管理' },
            orgId,
            'kit_transfer_plan',
          )
          if (ok) {
            console.log(`✅ 移動計画通知送信完了（Webhook）: org=${orgId}`)
            sentCount++
          }
        } else {
          console.log(`⏭️ org=${orgId}: Discord設定なし、スキップ`)
        }
      } catch (orgError) {
        console.error(`❌ org=${orgId} 処理エラー:`, orgError)
      }
    }

    console.log(`📦 移動計画通知完了: ${sentCount}/${orgs.length}組織に送信`)

    return new Response(
      JSON.stringify({ success: true, sent: sentCount, total: orgs.length }),
      { headers: corsHeaders },
    )
  } catch (error) {
    console.error('❌ 移動計画通知エラー:', error)
    return errorResponse('内部エラーが発生しました', 500, corsHeaders)
  }
})
