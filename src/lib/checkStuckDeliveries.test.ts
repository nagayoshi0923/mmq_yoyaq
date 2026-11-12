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
