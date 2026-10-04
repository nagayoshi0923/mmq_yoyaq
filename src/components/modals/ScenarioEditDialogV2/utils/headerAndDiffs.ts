/**
 * 作品編集画面の見出しの作品の選択肢と、マスターとの違い（ScenarioEditDialogV2.tsx から規則を変えずに切り出した関数）。
 */
import type { Scenario } from '@/types'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import type { ScenarioMaster } from '@/lib/api/scenarioMasterApi'
import type { ScenarioFormData } from '../types'

type OrgScenarioRow = { id: string; title?: string | null; scenario_master_id?: string | null; org_scenario_id?: string | null }

/** 見出しで切り替える作品の選択肢（並び順は一覧と同じ。開いている作品が一覧に無ければ先頭に足す） */
export function buildHeaderScenarioOptions(
  orgScenarios: OrgScenarioRow[],
  scenarios: Scenario[],
  sortedScenarioIds: string[] | undefined,
  scenarioId: string | null | undefined,
  formTitle: string,
): { id: string; title: string }[] {
  const titleById = new Map<string, string>()
  for (const row of orgScenarios) {
    if (row.title) {
      if (row.scenario_master_id) titleById.set(row.scenario_master_id, row.title)
      titleById.set(row.id, row.title)
      if (row.org_scenario_id) titleById.set(row.org_scenario_id, row.title)
    }
  }
  for (const row of scenarios) {
    if (!row.title) continue
    if (!titleById.has(row.id)) titleById.set(row.id, row.title)
    if (row.scenario_master_id && !titleById.has(row.scenario_master_id)) {
      titleById.set(row.scenario_master_id, row.title)
    }
  }

  const resolveId = (rawId: string) => {
    const row = orgScenarios.find(
      (s) => s.scenario_master_id === rawId || s.id === rawId || s.org_scenario_id === rawId
    )
    return row?.scenario_master_id || rawId
  }

  const sourceIds = (sortedScenarioIds && sortedScenarioIds.length > 0)
    ? sortedScenarioIds
    : (orgScenarios.length > 0
      ? orgScenarios.map((s) => s.scenario_master_id || s.id)
      : scenarios.map((s) => s.scenario_master_id || s.id))

  const options: { id: string; title: string }[] = []
  const seen = new Set<string>()
  for (const rawId of sourceIds) {
    if (!rawId) continue
    const id = resolveId(rawId)
    if (seen.has(id)) continue
    const title = titleById.get(id) || titleById.get(rawId) || (id === scenarioId ? formTitle : '')
    if (!title) continue
    seen.add(id)
    options.push({ id, title })
  }

  if (scenarioId && formTitle && !seen.has(scenarioId)) {
    options.unshift({ id: scenarioId, title: formTitle })
  }
  return options
}

/** マスターと今の入力の違い（項目ごとの値と、タブごとの件数） */
export function computeMasterDiffs(masterData: ScenarioMaster | null | undefined, formData: ScenarioFormData) {
  if (!masterData) return { count: 0, fields: {} as Record<string, { master: any; current: any }>, byTab: {} as Record<string, number> }
  
  const diffs: Record<string, { master: any; current: any }> = {}
  
  // 比較対象フィールドとタブのマッピング
  const fieldToTab: Record<string, string> = {
    title: 'basic',
    author: 'basic',
    description: 'basic',
    key_visual_url: 'basic',
    duration: 'game',
    player_count_min: 'game',
    player_count_max: 'game',
    genre: 'game',
  }
  
  // 比較対象フィールド
  if (masterData.title !== formData.title) {
    diffs.title = { master: masterData.title, current: formData.title }
  }
  if (masterData.author !== formData.author) {
    diffs.author = { master: masterData.author, current: formData.author }
  }
  if (masterData.description !== formData.description) {
    diffs.description = { master: masterData.description, current: formData.description }
  }
  if (masterData.key_visual_url !== formData.key_visual_url) {
    diffs.key_visual_url = { master: masterData.key_visual_url, current: formData.key_visual_url }
  }
  if (masterData.official_duration !== formData.duration) {
    diffs.duration = { master: masterData.official_duration, current: formData.duration }
  }
  if (masterData.player_count_min !== formData.player_count_min) {
    diffs.player_count_min = { master: masterData.player_count_min, current: formData.player_count_min }
  }
  if (masterData.player_count_max !== formData.player_count_max) {
    diffs.player_count_max = { master: masterData.player_count_max, current: formData.player_count_max }
  }
  if (JSON.stringify(masterData.genre || []) !== JSON.stringify(formData.genre || [])) {
    diffs.genre = { master: masterData.genre, current: formData.genre }
  }
  
  // タブごとの相違件数を計算
  const byTab: Record<string, number> = {}
  for (const field of Object.keys(diffs)) {
    const tab = fieldToTab[field] || 'basic'
    byTab[tab] = (byTab[tab] || 0) + 1
  }
  
  return { count: Object.keys(diffs).length, fields: diffs, byTab }
}

/** 作品の保存に失敗したときの文（重複・入力値の誤り・その他の DB エラー） */
export function scenarioSaveErrorMessage(err: unknown): string {
  let errorMessage = err instanceof Error ? err.message : ''
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const errorObj = err as { code: string; message?: string }
    if (errorObj.code === '23505') {
      // 一意制約違反
      if (errorObj.message?.includes('scenarios_title_unique')) {
        errorMessage = '同じタイトルのシナリオが既に存在します。別のタイトルを入力してください。'
      } else if (errorObj.message?.includes('scenarios_slug')) {
        errorMessage = '同じslugのシナリオが既に存在します。別のslugを入力してください。'
      } else {
        errorMessage = '重複するデータが存在します。'
      }
    } else if (errorObj.code === '23514') {
      // CHECK制約違反
      errorMessage = '入力値が無効です。ステータスなどの設定を確認してください。'
    } else {
      errorMessage = getSafeErrorMessage(err, 'データベースエラーが発生しました')
    }
  }
  return errorMessage
}

/** 作品の公演統計の初期値（読み込み前） */
export function emptyScenarioStats() {
  return {
  performanceCount: 0,
  cancelledCount: 0,
  totalRevenue: 0,
  totalParticipants: 0,
  totalStaffParticipants: 0,
  totalGmCost: 0,
  totalLicenseCost: 0,
  totalVenueCost: 0,
  venueCostPerPerformance: 0,
  firstPerformanceDate: null as string | null,
  performanceDates: [] as Array<{ date: string; category: string; participants: number; demoParticipants: number; staffParticipants: number; revenue: number; licenseCost: number; startTime: string; storeId: string | null; isCancelled: boolean }>,
  futurePerformanceCount: 0,
  futureReservationCount: 0
}
}
