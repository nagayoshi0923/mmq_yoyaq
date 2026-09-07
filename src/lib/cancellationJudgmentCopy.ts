/** 公演中止判定のお客向け文言。RPC（check_performances_day_before / four_hours）と同じ内容。設定では変えない。 */

export type CancellationJudgmentCopyRule = {
  id: string
  timing: string
  condition: string
  result: string
}

export const CANONICAL_CANCELLATION_JUDGMENT_RULES: CancellationJudgmentCopyRule[] = [
  { id: '1', timing: '前日 23:59', condition: '最低開催人数の半分に満たない場合', result: '中止' },
  { id: '2', timing: '前日 23:59', condition: '最低開催の半分以上だが最低開催人数未満の場合', result: '公演4時間前まで募集を延長' },
  { id: '3', timing: '前日 23:59', condition: '最低開催人数以上の場合', result: '開催確定（募集受付は継続）' },
  { id: '4', timing: '公演4時間前（延長された場合）', condition: '最低開催人数に満たない場合', result: '中止' },
]

export function groupCancellationJudgmentRulesByTiming(
  rules: CancellationJudgmentCopyRule[] = CANONICAL_CANCELLATION_JUDGMENT_RULES
): Record<string, CancellationJudgmentCopyRule[]> {
  return rules.reduce<Record<string, CancellationJudgmentCopyRule[]>>((grouped, rule) => {
    grouped[rule.timing] ||= []
    grouped[rule.timing].push(rule)
    return grouped
  }, {})
}
