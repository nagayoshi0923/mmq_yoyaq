/**
 * 公演スケジュールの下書き自動作成（QW-20261113-001）の読み込み・案づくり・登録。
 * 下書きは「オープン公演・GM未定・予約受付OFF（非公開）」で作る。公開は今までどおり公演ごとに行う。
 */
import { useCallback, useState } from 'react'
import { autoDraftApi, type SlotRuleRow } from '@/lib/api/autoDraftApi'
import { scheduleApi } from '@/lib/api/scheduleApi'
import { timeSlotEnToSchedule, type TimeSlotEn } from '@/lib/timeSlot'
import { addJstDays, jstMonthDateRange, toJstYmd } from '@/utils/jstDate'
import { isJapaneseHoliday } from '@/utils/japaneseHolidays'
import { DEFAULT_MAX_PARTICIPANTS } from '@/constants/game'
import {
  computeDemandScores,
  generateDraftProposals,
  monthDatesFrom,
  type DraftProposal,
  type DraftScenario,
} from '../utils/autoDraft'

/** 予約の入りやすさを見る期間（日） */
const DEMAND_LOOKBACK_DAYS = 120
/** 新作とみなす期間（日） */
const NEW_SCENARIO_DAYS = 60

export const AUTO_DRAFT_NOTE = '自動下書き（GM募集前）'

interface UseAutoDraftOptions {
  organizationId: string | null | undefined
  slotTimes: (date: string, slot: TimeSlotEn) => { start_time: string; end_time: string }
}

export interface AutoDraftStore {
  id: string
  name: string
}

export function useAutoDraft({ organizationId, slotTimes }: UseAutoDraftOptions) {
  const [rules, setRules] = useState<SlotRuleRow[]>([])
  const [rulesLoaded, setRulesLoaded] = useState(false)
  const [proposals, setProposals] = useState<DraftProposal[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadRules = useCallback(async () => {
    if (!organizationId) return
    setError(null)
    try {
      setRules(await autoDraftApi.listSlotRules())
      setRulesLoaded(true)
    } catch (e) {
      setError(`固定枠を読み込めませんでした：${e instanceof Error ? e.message : String(e)}`)
    }
  }, [organizationId])

  const saveStoreRules = useCallback(async (
    storeId: string,
    cells: Array<{ weekday: number; time_slot: TimeSlotEn; is_open: boolean | null }>,
  ) => {
    if (!organizationId) throw new Error('組織が分かりません。再ログインしてください')
    setRules(await autoDraftApi.saveStoreSlotRules(storeId, cells))
  }, [organizationId])

  const generate = useCallback(async (params: { year: number; month: number; storeIds: string[]; customHolidays: string[] }) => {
    if (!organizationId) return
    setIsGenerating(true)
    setError(null)
    try {
      const { start, end } = jstMonthDateRange(params.year, params.month)
      const today = toJstYmd(new Date())
      const dates = monthDatesFrom(start, end, today)
      const demandFrom = addJstDays(today, -DEMAND_LOOKBACK_DAYS)
      const data = await autoDraftApi.getData({ start: addJstDays(start, -7), end: addJstDays(end, 7), demandFrom, demandTo: today })
      const currentRules = data.rules
      const candidates = data.scenarios
      const nearbyEvents = data.nearby_events
      const demandEvents = data.demand_events
      setRules(currentRules)

      const demand = computeDemandScores(demandEvents.map(e => ({
        date: e.date,
        category: e.category ?? '',
        scenario_master_id: e.scenario_master_id,
        current_participants: e.current_participants,
        max_participants: e.max_participants,
      })))
      const playedRecently = new Set(demandEvents.map(e => e.scenario_master_id).filter((id): id is string => !!id))
      const newSince = addJstDays(start, -NEW_SCENARIO_DAYS)

      const scenarios: DraftScenario[] = candidates
        .filter(c => (c.scenario_kind ?? 'regular') === 'regular' && c.title)
        .map(c => {
          const createdOn = c.created_at ? toJstYmd(c.created_at) : null
          const isNew = (c.available_from !== null && c.available_from >= newSince) ||
            (createdOn !== null && createdOn >= newSince && !playedRecently.has(c.id))
          return {
            scenario_master_id: c.id,
            organization_scenario_id: c.org_scenario_id,
            title: c.title ?? '',
            duration_minutes: c.duration ?? 0,
            weekend_duration_minutes: c.weekend_duration,
            max_participants: c.player_count_max ?? DEFAULT_MAX_PARTICIPANTS,
            kit_count: c.kit_count ?? 1,
            available_stores: c.available_stores ?? [],
            available_from: c.available_from,
            available_until: c.available_until,
            main_gm_count: data.main_gm_counts[c.id] ?? 0,
            demand_score: demand.get(c.id) ?? 0,
            is_new: isNew,
          }
        })

      const holidays = new Set<string>([...params.customHolidays, ...dates.filter(d => isJapaneseHoliday(d))])
      setProposals(generateDraftProposals({
        dates,
        storeIds: params.storeIds,
        rules: currentRules,
        holidays,
        existingEvents: nearbyEvents
          .filter(e => e.store_id)
          .map(e => ({ date: e.date, store_id: e.store_id as string, time_slot: e.time_slot, start_time: e.start_time, scenario_master_id: e.scenario_master_id })),
        blockedSlots: data.blocked_slots
          .map(b => ({ date: b.date, store_id: b.store_id, time_slot: b.time_slot as TimeSlotEn })),
        scenarios,
        slotTimes,
      }))
    } catch (e) {
      setError(`下書き案を作れませんでした：${e instanceof Error ? e.message : String(e)}`)
      setProposals([])
    } finally {
      setIsGenerating(false)
    }
  }, [organizationId, slotTimes])

  /**
   * 選んだ下書き案を公演として登録する（オープン・GM未定・予約受付OFF）。
   * 1 件ずつ作り、失敗した枠は理由を返す（ほかの枠は続ける）。
   */
  const createDrafts = useCallback(async (items: Array<{ proposal: DraftProposal; scenario: DraftScenario; storeName: string }>) => {
    setIsCreating(true)
    const failed: Array<{ key: string; message: string }> = []
    let created = 0
    try {
      for (const { proposal, scenario, storeName } of items) {
        try {
          await scheduleApi.create({
            date: proposal.date,
            store_id: proposal.store_id,
            venue: storeName,
            scenario: scenario.title,
            scenario_master_id: scenario.scenario_master_id,
            organization_scenario_id: scenario.organization_scenario_id,
            category: 'open',
            start_time: proposal.start_time,
            end_time: proposal.end_time,
            capacity: scenario.max_participants,
            gms: [],
            gm_roles: {},
            staff_assignment: { gms: [], gm_roles: {}, entries: [] },
            client_request_id: crypto.randomUUID(),
            notes: AUTO_DRAFT_NOTE,
            time_slot: timeSlotEnToSchedule(proposal.time_slot),
            is_reservation_enabled: false,
          })
          created += 1
        } catch (e) {
          failed.push({ key: proposal.key, message: e instanceof Error ? e.message : String(e) })
        }
      }
    } finally {
      setIsCreating(false)
    }
    return { created, failed }
  }, [])

  return {
    rules,
    rulesLoaded,
    loadRules,
    saveStoreRules,
    proposals,
    setProposals,
    generate,
    isGenerating,
    createDrafts,
    isCreating,
    error,
  }
}
