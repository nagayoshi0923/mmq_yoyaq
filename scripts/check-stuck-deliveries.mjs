#!/usr/bin/env node
// 本番の「送れていない通知」を数える毎朝の点検（#1273 の再発防止）。
// 2026-11 に定期送信が 401 で 10 日止まっても誰も気づかなかったため、送信待ち・失敗・
// 定期実行の失敗・Edge Function 呼び出しの失敗を毎朝数え、1 件でもあれば終了コード 1 にする。
// GitHub Actions からは直接 DB に繋がらないので Management API を使う（db-drift.yml と同じ）。
//
//   SUPABASE_ACCESS_TOKEN=... node scripts/check-stuck-deliveries.mjs [prod|staging] [--out report.md]
//
// 出力は件数とエラーの種類だけ。宛先・氏名・本文は出さない。

import { writeFileSync } from 'node:fs'

const PROJECTS = { prod: 'cznpcewciwywcqcxktba', staging: 'lavutzztfqbdndjiwluc' }
const args = process.argv.slice(2)
const env = args.find((a) => PROJECTS[a]) ?? 'prod'
const outIndex = args.indexOf('--out')
const outPath = outIndex >= 0 ? args[outIndex + 1] : null

// 送信待ちを持つ表: [表, 表示名, 作成日時の列（既定 created_at）]
export const DELIVERY_TABLES = [
  ['booking_email_queue', '予約メール'],
  ['cancellation_billing_notices', 'キャンセル料のお知らせ', 'started_at'],
  ['compensated_cancellation_notices', '補償つきキャンセルのお知らせ', 'updated_at'],
  ['customer_notice_emails', 'お客様へのお知らせ（日程確定など）'],
  ['discord_notification_queue', 'Discord 通知'],
  ['performance_recruitment_notices', '追加募集のお知らせ'],
  ['private_booking_approval_deliveries', '貸切の承認通知'],
  ['private_booking_rejection_deliveries', '貸切のお断り'],
  ['private_group_survey_deliveries', '貸切アンケート'],
  ['scheduled_reminder_deliveries', '公演前リマインド'],
  ['waitlist_notification_queue', 'キャンセル待ちの案内'],
  ['web_push_outbox', 'Web Push'],
]
// 送り終えた・送らないと決めた状態。これ以外が長く残っていれば止まっている。
export const DONE_STATUSES = ['sent', 'completed', 'skipped', 'superseded', 'cancelled', 'delivered']
export const FAILED_STATUSES = ['failed', 'uncertain']

const FAILED_LOOKBACK = '14 days'
const STUCK_AFTER = '2 hours'

export function buildSql() {
  const done = DONE_STATUSES.concat(FAILED_STATUSES).map((s) => `'${s}'`).join(',')
  const failed = FAILED_STATUSES.map((s) => `'${s}'`).join(',')
  const parts = DELIVERY_TABLES.map(([t, , at = 'created_at']) => `
  SELECT 'delivery' AS kind, '${t}' AS name, status::text AS detail, count(*)::int AS n, min(${at})::text AS since
    FROM public.${t}
   WHERE (status::text IN (${failed}) AND ${at} > now() - interval '${FAILED_LOOKBACK}')
      OR (status::text NOT IN (${done}) AND ${at} < now() - interval '${STUCK_AFTER}')
   GROUP BY status`)
  parts.push(`
  SELECT 'cron', j.jobname, left(coalesce(d.return_message, ''), 120), count(*)::int, min(d.start_time)::text
    FROM cron.job_run_details d JOIN cron.job j USING (jobid)
   WHERE d.status = 'failed' AND d.start_time > now() - interval '24 hours'
   GROUP BY 2, 3`)
  parts.push(`
  SELECT 'http', coalesce(status_code::text, 'timeout'), CASE WHEN status_code IS NULL THEN '時間切れ・接続失敗' ELSE left(coalesce(content::text, ''), 120) END, count(*)::int, min(created)::text
    FROM net._http_response
   WHERE created > now() - interval '24 hours' AND (status_code IS NULL OR status_code >= 300)
   GROUP BY 2, 3`)
  return parts.join('\n  UNION ALL') + '\n  ORDER BY 1, 2, 3'
}

const LABELS = Object.fromEntries(DELIVERY_TABLES.map(([t, label]) => [t, label]))

export function formatReport(rows, envName) {
  // 呼び出しの時間切れ（status_code なし）は 1 日数件あるので 10 件以上だけ問題にする
  const problems = rows.filter((r) => !(r.kind === 'http' && r.name === 'timeout' && r.n < 10))
  const lines = [`## 送れていない通知の点検（${envName}）`, '']
  if (problems.length === 0) {
    lines.push('問題なし。送信待ちの滞留・失敗・定期実行の失敗・Edge Function 呼び出しの失敗はありません。')
    return { ok: true, text: lines.join('\n') }
  }
  const section = (kind, title, render) => {
    const list = problems.filter((r) => r.kind === kind)
    if (list.length === 0) return
    lines.push(`### ${title}`, '', '| 対象 | 状態・内容 | 件数 | いちばん古いもの |', '|---|---|---:|---|')
    for (const r of list) lines.push(`| ${render(r)} | ${String(r.detail).replace(/\|/g, '/').replace(/\s+/g, ' ')} | ${r.n} | ${r.since ?? ''} |`)
    lines.push('')
  }
  section('delivery', `送信待ち（失敗・判定不能は ${FAILED_LOOKBACK} 以内、送信待ちは ${STUCK_AFTER} 以上前のもの）`, (r) => `${LABELS[r.name] ?? r.name}（${r.name}）`)
  section('cron', '定期実行の失敗（24 時間以内）', (r) => r.name)
  section('http', 'Edge Function 呼び出しの失敗（24 時間以内、net._http_response）', (r) => `HTTP ${r.name}`)
  lines.push('この Issue は毎朝の点検（`.github/workflows/stuck-deliveries.yml`）が自動で更新し、問題がなくなると閉じます。')
  return { ok: false, text: lines.join('\n') }
}

async function query(sql) {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is required')
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECTS[env]}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) throw new Error(`Management API ${res.status} for ${env}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = await query(buildSql())
  const { ok, text } = formatReport(rows, env)
  console.log(text)
  if (outPath) writeFileSync(outPath, text)
  process.exit(ok ? 0 : 1)
}
