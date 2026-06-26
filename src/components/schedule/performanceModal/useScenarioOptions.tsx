/**
 * シナリオ選択用オプションのメモ化フック（PerformanceModal から抽出・挙動不変）。
 * 元の scenarioOptions useMemo を逐語移送し、唯一 formData.venue を引数 venue に置換しただけ。
 * ソート順: 担当+出勤GM有 > 担当GM有 > 出勤GM有 > その他（同一優先度内は公演数の多い順）。
 */
import { useMemo } from 'react'
import type { Staff as StaffType, Scenario } from '@/types'

export function useScenarioOptions(
  scenarios: Scenario[],
  venue: string,
  staff: StaffType[],
  allAvailableStaff: StaffType[],
) {
  // シナリオ選択用オプションをメモ化（検索パフォーマンス改善）
  // ソート順: 担当+出勤GM有 > 担当GM有 > 出勤GM有 > その他（タイトル順）
  return useMemo(() => {
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

      // 出勤中かどうかをチェック
      const isAvailableGM = (gm: StaffType) => allAvailableStaff.some(a => a.id === gm.id)

      // 担当または出勤のスタッフのみ表示（その他は除外）
      const filteredDisplayGMs = staff
        .filter(gm => gm.status === 'active')
        .map(gm => ({
          gm,
          isAssigned: isAssignedGM(gm),
          isAvailable: isAvailableGM(gm)
        }))
        // 担当または出勤のみ表示
        .filter(({ isAssigned, isAvailable }) => isAssigned || isAvailable)
        // ソート: 担当+出勤 > 担当のみ > 出勤のみ
        .sort((a, b) => {
          const scoreA = (a.isAssigned ? 2 : 0) + (a.isAvailable ? 1 : 0)
          const scoreB = (b.isAssigned ? 2 : 0) + (b.isAvailable ? 1 : 0)
          return scoreB - scoreA
        })

      // シナリオのソート優先度を計算
      // 担当かつ出勤のGMがいる: 最優先(0)、担当のみ: 次(1)、出勤のみ: その次(2)、なし: 最後(3)
      const hasAssignedAndAvailable = filteredDisplayGMs.some(({ isAssigned, isAvailable }) => isAssigned && isAvailable)
      const hasAssignedOnly = filteredDisplayGMs.some(({ isAssigned, isAvailable }) => isAssigned && !isAvailable)
      const hasAvailableOnly = filteredDisplayGMs.some(({ isAssigned, isAvailable }) => !isAssigned && isAvailable)

      let sortPriority = 3
      if (hasAssignedAndAvailable) sortPriority = 0
      else if (hasAssignedOnly) sortPriority = 1
      else if (hasAvailableOnly) sortPriority = 2

      // 担当GM情報のJSX
      const gmDisplayInfo = filteredDisplayGMs.length > 0
        ? (
            <span className="flex flex-wrap gap-0.5 items-center">
              {filteredDisplayGMs.map(({ gm, isAssigned, isAvailable }) => {
                // 担当かつ出勤 → 緑背景
                if (isAssigned && isAvailable) {
                  return (
                    <span
                      key={gm.id}
                      className="inline-flex items-center px-1 py-0 rounded text-[11px] font-medium bg-green-100 text-green-800 border border-green-300"
                    >
                      {gm.name}
                    </span>
                  )
                }
                // 担当だが出勤なし → 青背景
                if (isAssigned && !isAvailable) {
                  return (
                    <span
                      key={gm.id}
                      className="inline-flex items-center px-1 py-0 rounded text-[11px] font-medium bg-blue-100 text-blue-700 border border-blue-300"
                    >
                      {gm.name}
                    </span>
                  )
                }
                // 担当でないが出勤中 → 白背景・灰色文字
                return (
                  <span
                    key={gm.id}
                    className="inline-flex items-center px-1 py-0 rounded text-[11px] bg-white text-gray-400 border border-gray-200"
                  >
                    {gm.name}
                  </span>
                )
              })}
            </span>
          )
        : null

      const renderedContent = (
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="truncate">{scenario.title}</span>
            {scenario.player_count_max && (
              <span className="text-[10px] text-muted-foreground shrink-0">{scenario.player_count_max}名</span>
            )}
            {!isAvailableAtCurrentVenue && (
              <span className="inline-flex items-center px-1 py-0 rounded text-[10px] font-medium bg-orange-100 text-orange-700 border border-orange-300 flex-shrink-0">
                公演不可
              </span>
            )}
          </div>
          {gmDisplayInfo && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {gmDisplayInfo}
            </div>
          )}
        </div>
      )

      return {
        value: scenario.title,
        label: scenario.title + (!isAvailableAtCurrentVenue ? ' [公演不可]' : ''),
        renderedContent,
        displayInfo: gmDisplayInfo,
        // 検索用テキストは「出勤かつ担当」のGMのみ
        displayInfoSearchText: filteredDisplayGMs
          .filter(({ isAssigned, isAvailable }) => isAssigned && isAvailable)
          .map(({ gm }) => gm.name).join(', '),
        // ソート用の優先度
        sortPriority,
        scenarioTitle: scenario.title,
        playCount: scenario.play_count ?? 0
      }
    })
    // ソート: 優先度順 → 同一優先度内は公演数の多い順
    .sort((a, b) => {
      if (a.sortPriority !== b.sortPriority) {
        return a.sortPriority - b.sortPriority
      }
      return b.playCount - a.playCount
    })
    // ソート後、不要なプロパティを除去
    .map(({ sortPriority, scenarioTitle, playCount, ...rest }) => rest)
  }, [scenarios, venue, staff, allAvailableStaff])
}
