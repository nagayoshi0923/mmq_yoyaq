import { salesGmCostRole } from './salesGmCostRole.js'
export interface HourlyRate {
  hours: number  // 0.5 = 30分、1 = 1時間、1.5 = 1時間30分...
  amount: number
}

export interface SalarySettings {
  gm_base_pay: number
  gm_hourly_rate: number
  gm_test_base_pay: number
  gm_test_hourly_rate: number
  reception_fixed_pay: number
  use_hourly_table: boolean
  hourly_rates: HourlyRate[]
  gm_test_hourly_rates: HourlyRate[]
  updated_at?: string  // 設定の最終更新日時
  effective_from?: string  // 有効開始日
  effective_until?: string | null  // 有効終了日（nullは現在まで有効）
}

/**
 * 時間別テーブルから報酬を取得
 * 完全一致がない場合は、最も近い大きい値を使用
 * @param hours 時間（0.5刻み）
 * @param rates 時間別報酬テーブル
 * @param fallbackRate 見つからない場合のフォールバック時給
 * @param fallbackBase 見つからない場合のフォールバック基本給
 * @returns 報酬額
 */
function getAmountFromHourlyTable(
  hours: number,
  rates: HourlyRate[],
  fallbackRate: number,
  fallbackBase: number
): number {
  // 30分単位に丸める（例: 2.3 → 2.5, 2.7 → 3.0）
  const roundedHours = Math.ceil(hours * 2) / 2

  // 完全一致を検索
  const exactMatch = rates.find(r => r.hours === roundedHours)
  if (exactMatch) {
    return exactMatch.amount
  }

  // 完全一致がない場合、最も近い大きい値を検索
  const sortedRates = [...rates].sort((a, b) => a.hours - b.hours)
  const closestLarger = sortedRates.find(r => r.hours >= roundedHours)
  if (closestLarger) {
    return closestLarger.amount
  }

  // テーブルの最大値を超える場合、最大値の報酬 + 超過分を時給計算
  const maxRate = sortedRates[sortedRates.length - 1]
  if (maxRate) {
    const extraHours = roundedHours - maxRate.hours
    return maxRate.amount + Math.round(fallbackRate * extraHours)
  }

  // テーブルが空の場合は従来の計算式
  return fallbackBase + Math.round(fallbackRate * hours)
}

/**
 * GM給与を計算するユーティリティ関数
 * 時間別テーブル方式と計算式方式の両方に対応
 * @param durationMinutes 公演時間（分）
 * @param isGmTest GMテストかどうか
 * @param settings 給与設定
 * @returns 給与額
 */
export function calculateGmWage(
  durationMinutes: number,
  isGmTest: boolean,
  settings: SalarySettings
): number {
  return calculateGmWageFromSettings(durationMinutes, isGmTest, settings)
}

/**
 * GM給与を計算する内部関数
 */
function calculateGmWageFromSettings(
  durationMinutes: number,
  isGmTest: boolean,
  settings: SalarySettings
): number {
  const hours = durationMinutes / 60

  // 時間別テーブル方式を使用する場合
  if (settings.use_hourly_table) {
    if (isGmTest) {
      return getAmountFromHourlyTable(
        hours,
        settings.gm_test_hourly_rates,
        settings.gm_test_hourly_rate,
        settings.gm_test_base_pay
      )
    }
    return getAmountFromHourlyTable(
      hours,
      settings.hourly_rates,
      settings.gm_hourly_rate,
      settings.gm_base_pay
    )
  }

  // 計算式方式（従来通り）
  if (isGmTest) {
    return settings.gm_test_base_pay + Math.round(settings.gm_test_hourly_rate * hours)
  }
  return settings.gm_base_pay + Math.round(settings.gm_hourly_rate * hours)
}

/**
 * 特定の日付時点で有効だった報酬設定を取得
 * @param performanceDate 公演日（YYYY-MM-DD形式）
 * @returns その日付時点で有効だった報酬設定
 */
export type SalarySettingsResolver = (performanceDate: string) => SalarySettings

/** 履歴が欠けている公演を現在の設定で再計算しない。解決は実際に報酬が必要な時だけ行う。 */
export function createSalarySettingsResolver(history: SalarySettings[]): SalarySettingsResolver {
  const sorted = [...history].sort((a, b) => (b.effective_from ?? '').localeCompare(a.effective_from ?? ''))
  return (performanceDate) => {
    const settings = sorted.find(row => row.effective_from && row.effective_from <= performanceDate)
    if (!settings) throw new Error(`${performanceDate} に有効な給与設定の履歴がありません。給与設定の履歴を確認してください。`)
    const amounts = [settings.gm_base_pay, settings.gm_hourly_rate, settings.gm_test_base_pay,
      settings.gm_test_hourly_rate, settings.reception_fixed_pay]
    const validRates = (rates: HourlyRate[]) => Array.isArray(rates) && rates.every(rate =>
      Number.isFinite(rate.hours) && rate.hours > 0 && Number.isFinite(rate.amount) && rate.amount >= 0)
    if (amounts.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      || typeof settings.use_hourly_table !== 'boolean'
      || (settings.use_hourly_table && (!validRates(settings.hourly_rates) || !validRates(settings.gm_test_hourly_rates)))) {
      throw new Error(`${settings.effective_from} の給与設定の履歴が不完全です。給与設定の履歴を確認してください。`)
    }
    return settings
  }
}


export interface IndividualGmCost { role: string; reward: number; category?: string }
/** 実際の担当1枠の報酬。参加・見学は0円、受付は共通固定額、GMは作品別優先。 */
export function calculateAssignmentPay(
  role: string | undefined, gmOrdinal: number, duration: number, isGmTest: boolean,
  costs: IndividualGmCost[], getSettings: () => SalarySettings,
): number {
  if (role === 'staff' || role === 'observer') return 0
  if (role === 'reception') return getSettings().reception_fixed_pay
  const costRole = salesGmCostRole(role, gmOrdinal)
  const explicit = costs.find(cost => (cost.category ?? 'normal') === (isGmTest ? 'gmtest' : 'normal')
    && cost.role.toLowerCase() === costRole.toLowerCase())
  return explicit?.reward ?? calculateGmWage(duration, isGmTest, getSettings())
}
/** 店舗に設定された、担当店舗以外への出勤に対する1公演分の交通費。 */
export function calculateTransportAllowance(storeId: string, homeStores: string[] | null | undefined, allowance: number | null | undefined): number {
  return homeStores && !homeStores.includes(storeId) ? allowance ?? 0 : 0
}

export function calculateEventGmCost(input: {
  gms: string[]; roles: Record<string, string>; duration: number; isGmTest: boolean;
  costs: IndividualGmCost[]; getSettings: () => SalarySettings;
  storeId: string; homeStores: Map<string, string[]>; transportAllowance?: number | null;
  estimateUnassigned?: boolean; isCancelled?: boolean;
}): number {
  if (input.isCancelled) return 0
  if (!input.gms.length && input.estimateUnassigned) {
    const applicable = input.costs.filter(cost => (cost.category ?? 'normal') === (input.isGmTest ? 'gmtest' : 'normal'))
    return applicable.length ? applicable.reduce((sum, cost) => sum + cost.reward, 0)
      : calculateGmWage(input.duration, input.isGmTest, input.getSettings())
  }
  let ordinal = 0
  return input.gms.reduce((sum, name) => {
    const role = input.roles[name]
    if (role !== 'staff' && role !== 'observer' && role !== 'reception') ordinal++
    return sum + calculateAssignmentPay(role, ordinal, input.duration, input.isGmTest, input.costs, input.getSettings)
      + calculateTransportAllowance(input.storeId, input.homeStores.get(name), input.transportAllowance)
  }, 0)
}
