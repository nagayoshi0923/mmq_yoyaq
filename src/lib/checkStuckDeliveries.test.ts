import { describe, expect, it } from 'vitest'
// @ts-expect-error JS モジュール（scripts/）を直接読み込む
import { buildSql, DELIVERY_TABLES, formatReport } from '../../scripts/check-stuck-deliveries.mjs'

describe('送れていない通知の毎朝の点検（#1273）', () => {
  it('送信待ちの表・定期実行・Edge 呼び出しをすべて数える SQL を作る', () => {
    const sql = buildSql()
    for (const [table] of DELIVERY_TABLES) expect(sql).toContain(`FROM public.${table}`)
    expect(sql).toContain('cron.job_run_details')
    expect(sql).toContain('net._http_response')
    expect(sql).toContain('min(started_at)')
    expect(sql).toContain('FROM public.private_group_survey_reminders')
    // 失敗は最後に変わった日時で見る（古い行の再試行の失敗も拾う）
    expect(sql).toMatch(/private_booking_rejection_deliveries[\s\S]*?status::text IN \('failed','uncertain'\) AND updated_at >/)
    // 意図して送らない状態は滞留に数えない
    expect(sql).toContain("'expired'")
    expect(sql).toContain('FROM public.waitlist_notice_events')
  })

  it('問題がなければ ok', () => {
    expect(formatReport([], 'prod').ok).toBe(true)
  })

  it('時間切れが少数なら問題にしない', () => {
    expect(formatReport([{ kind: 'http', name: 'timeout', detail: '時間切れ・接続失敗', n: 3, since: 'x' }], 'prod').ok).toBe(true)
  })

  it('401 や失敗した送信があれば表にして ok=false', () => {
    const { ok, text } = formatReport([
      { kind: 'delivery', name: 'private_booking_rejection_deliveries', detail: 'uncertain', n: 9, since: '2026-11-05' },
      { kind: 'http', name: '401', detail: '{"message":"Legacy API keys are disabled"}', n: 484, since: '2026-11-12' },
    ], 'prod')
    expect(ok).toBe(false)
    expect(text).toContain('貸切のお断り')
    expect(text).toContain('| HTTP 401 |')
  })
})
