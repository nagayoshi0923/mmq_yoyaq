/**
 * 公演の詳細画面の作品の選択肢（担当・出勤の GM を添え、担当かつ出勤 → 担当 → 出勤 → その他、同順位は公演数の多い順）。
 * 配置数（貸切／オープン／GMテスト）と、選択中 → このセルのリクエスト → 新作（90 日以内）→ その他 の並びを足す。
 *
 * 計算は 3 段に分ける（PerformanceModal で段ごとに useMemo する）:
 *   1. buildBaseScenarioOptions … 作品・店舗・スタッフが変わったときだけ
 *   2. decorateScenarioOptions  … 配置数と並びの順位（選択とは無関係）
 *   3. orderScenarioOptions     … 選択中を先頭へ移すだけ（作品を選ぶたびに走るのはここだけ）
 */
import type { Staff as StaffType, Scenario } from '@/types'
import type { SearchableSelectOption } from '@/components/ui/searchable-select'
import { toJstYmd } from '@/utils/jstDate'
import { countScenarioPlacements, placeSelectedFirst, rankScenarioOptions, type ScenarioPlacementContext } from './scenarioOptionPriority'

type BaseOption = SearchableSelectOption & { displayInfo: SearchableSelectOption['displayInfo'] }

export function buildBaseScenarioOptions(scenarios: Scenario[], venue: string, staff: StaffType[], allAvailableStaff: StaffType[]): BaseOption[] {
  const availableIds = new Set(allAvailableStaff.map((a) => a.id))
  return scenarios.map(scenario => {
    // この店舗で公演可能かチェック
    const isAvailableAtCurrentVenue = !venue ||
      !scenario.available_stores ||
      scenario.available_stores.length === 0 ||
      scenario.available_stores.includes(venue)

    // このシナリオの担当GM全員を取得（special_scenarios は scenario_master_id を格納）
    const isAssignedGM = (gm: StaffType) => {
      const specialScenarios = gm.special_scenarios || []
      return specialScenarios.includes(scenario.scenario_master_id || scenario.id) ||
             specialScenarios.includes(scenario.id) ||
             specialScenarios.includes(scenario.title)
    }

    // 担当または出勤のスタッフのみ表示（その他は除外）。並び: 担当+出勤 > 担当のみ > 出勤のみ
    const filteredDisplayGMs = staff
      .filter(gm => gm.status === 'active')
      .map(gm => ({ gm, isAssigned: isAssignedGM(gm), isAvailable: availableIds.has(gm.id) }))
      .filter(({ isAssigned, isAvailable }) => isAssigned || isAvailable)
      .sort((a, b) => ((b.isAssigned ? 2 : 0) + (b.isAvailable ? 1 : 0)) - ((a.isAssigned ? 2 : 0) + (a.isAvailable ? 1 : 0)))

    // 担当かつ出勤のGMがいる: 最優先(0)、担当のみ: 次(1)、出勤のみ: その次(2)、なし: 最後(3)
    let sortPriority = 3
    if (filteredDisplayGMs.some(({ isAssigned, isAvailable }) => isAssigned && isAvailable)) sortPriority = 0
    else if (filteredDisplayGMs.some(({ isAssigned, isAvailable }) => isAssigned && !isAvailable)) sortPriority = 1
    else if (filteredDisplayGMs.some(({ isAssigned, isAvailable }) => !isAssigned && isAvailable)) sortPriority = 2

    // 担当GMのバッジ（担当かつ出勤 → 緑、担当のみ → 青、出勤のみ → 白）
    const gmDisplayInfo = filteredDisplayGMs.length > 0
      ? (
          <span className="flex flex-wrap gap-0.5 items-center">
            {filteredDisplayGMs.map(({ gm, isAssigned, isAvailable }) => {
              if (isAssigned && isAvailable) {
                return <span key={gm.id} className="inline-flex items-center px-1 py-0 rounded ts-10 font-medium bg-green-100 text-green-800 border border-green-300">{gm.name}</span>
              }
              if (isAssigned && !isAvailable) {
                return <span key={gm.id} className="inline-flex items-center px-1 py-0 rounded ts-10 font-medium bg-blue-100 text-blue-700 border border-blue-300">{gm.name}</span>
              }
              return <span key={gm.id} className="inline-flex items-center px-1 py-0 rounded ts-10 bg-white text-gray-400 border border-gray-200">{gm.name}</span>
            })}
          </span>
        )
      : null

    return {
      value: scenario.title,
      label: scenario.title + (!isAvailableAtCurrentVenue ? ' [公演不可]' : ''),
      displayInfo: gmDisplayInfo,
      // 検索用テキストは「出勤かつ担当」のGMのみ
      displayInfoSearchText: filteredDisplayGMs
        .filter(({ isAssigned, isAvailable }) => isAssigned && isAvailable)
        .map(({ gm }) => gm.name).join(', '),
      sortPriority,
      playCount: scenario.play_count ?? 0,
    }
  })
  // 優先度順 → 同一優先度内は公演数の多い順
  .sort((a, b) => a.sortPriority !== b.sortPriority ? a.sortPriority - b.sortPriority : b.playCount - a.playCount)
  .map(({ sortPriority: _p, playCount: _c, ...rest }) => rest)
}

const GROUPS = ['1 このセルの開催リクエスト', '2 新作（90日以内）', '3 その他（既存の表示順）'] as const

/** 配置数の行と並びの順位を足す（選択中の作品とは無関係なので、作品を選んでも作り直さない）。 */
export function decorateScenarioOptions(options: readonly BaseOption[], scenarios: readonly Scenario[], context: ScenarioPlacementContext, today = toJstYmd(new Date())) {
  const counts = countScenarioPlacements(scenarios, context)
  return rankScenarioOptions(options, scenarios, today, context).map((r) => {
    const count = r.scenario ? counts.get(r.scenario.id) : undefined
    const countText = context.ready && count ? `貸切 ${count.private}件／オープン ${count.open}件／GMテスト ${count.gmtest}件` : '配置数を確認できません'
    return {
      ...r,
      option: {
        ...r.option,
        displayInfo: <div className="space-y-0.5">{r.option.displayInfo}<span className="block ts-10 text-muted-foreground">{countText}</span></div>,
      },
    }
  })
}

/** 選択中を先頭へ移し、グループ見出しを付ける。 */
export function orderScenarioOptions(decorated: ReturnType<typeof decorateScenarioOptions>, selectedTitle = ''): SearchableSelectOption[] {
  return placeSelectedFirst(decorated, selectedTitle).map(({ option, rank }) => ({ ...option, group: rank === -1 ? '選択中' : GROUPS[rank] }))
}

/** 互換（試験・他の呼び出し元用）: 3 段を一度に行う。 */
export function buildScenarioSelectOptions(scenarios: Scenario[], venue: string, staff: StaffType[], allAvailableStaff: StaffType[], context?: ScenarioPlacementContext, selectedTitle = ''): SearchableSelectOption[] {
  const base = buildBaseScenarioOptions(scenarios, venue, staff, allAvailableStaff)
  if (!context) return base
  return orderScenarioOptions(decorateScenarioOptions(base, scenarios, context), selectedTitle)
}
