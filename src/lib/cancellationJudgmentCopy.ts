/**
 * 公開のキャンセル規定に出す「中止判定のルール」（#714、社長判断 2026-10-04）。
 * 設定画面で自由に書く文ではなく、実際の判定（開催判断の時刻・追加募集の有無と条件・期限）と同じ設定から作る。
 * 判定の本体は DB の check_performances_with_recruitment_deadlines。値は get_public_performance_judgment で読む。
 */
export type PublicPerformanceJudgment = {
  judgment_minutes: number
  extension_enabled: boolean
  target_mode: 'percent' | 'count' | string
  target_value: number
  extension_deadline_minutes: number
}

export type JudgmentCopyRule = { id: string; timing: string; condition: string; result: string }

/** 「公演開始の◯時間前」「◯分前」 */
export function formatMinutesBeforeStart(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '公演開始時'
  if (minutes % 60 === 0) return `公演開始の${minutes / 60}時間前`
  if (minutes > 60) return `公演開始の${Math.floor(minutes / 60)}時間${minutes % 60}分前`
  return `公演開始の${minutes}分前`
}

/** 追加募集の対象になる不足の条件（DB の recruitment_missing_limit と同じ解釈） */
export function formatMissingCondition(mode: string, value: number): string {
  if (mode === 'percent') return `最低開催人数まで、不足が最低開催人数の${value}%以内の場合`
  return `最低開催人数まであと${value}人以内の場合`
}

export function buildJudgmentRules(j: PublicPerformanceJudgment): JudgmentCopyRule[] {
  const judgment = `${formatMinutesBeforeStart(j.judgment_minutes)}（開催判断）`
  const extensionDeadline = formatMinutesBeforeStart(j.extension_deadline_minutes)
  const rules: JudgmentCopyRule[] = [
    { id: 'confirmed', timing: judgment, condition: '最低開催人数に達している場合', result: '開催確定' },
  ]
  if (j.extension_enabled) {
    rules.push(
      { id: 'extended', timing: judgment, condition: formatMissingCondition(j.target_mode, j.target_value), result: `${extensionDeadline}まで追加募集` },
      { id: 'cancelled', timing: judgment, condition: '上記以外で最低開催人数に満たない場合', result: '中止' },
      { id: 'deadline', timing: `${extensionDeadline}（追加募集の期限）`, condition: '最低開催人数に満たない場合', result: '中止（達した場合は開催確定）' },
    )
  } else {
    rules.push({ id: 'cancelled', timing: judgment, condition: '最低開催人数に満たない場合', result: '中止' })
  }
  return rules
}

/** 作品・公演の個別設定で変わることがあるため、規定に添える注記 */
export const JUDGMENT_RULES_NOTE = '作品・公演によって、判定の時刻や追加募集の条件が異なる場合があります。予約時のご案内もあわせてご確認ください。'
