#!/usr/bin/env node
// 2026-10 本番公開（リリース統合 #1204）の DB 変更を「1 つの取引」にまとめた SQL を作る。
// 目的（2026-10-21 Codex 先行レビュー P1）: 29 本＋reconcile を 1 本ずつ当てると、20261011200000〜20261020210000 の間
//   店舗への申込が店舗の曜日の枠（I2）を見ない本文になり、その間も申込を受け付ける（途中で止まればその状態が続く）。
//   1 つの取引にすれば、ほかの接続からは「公開前（#1202 の検査あり）」か「公開後（reconcile の検査）」のどちらかしか見えない。
// 既存の migration には BEGIN/COMMIT が入っているので、単純に psql -1 -f a -f b … では 1 取引にならない。
//   ここでは SQL を文に分け（文字列・$$ 本文・コメントを正しく読み飛ばす）、最上位の取引の文（BEGIN/COMMIT/END/START TRANSACTION/ROLLBACK）だけを外す。
//   ほかの文は 1 文字も変えない（外した文の一覧と、元のファイルの sha256 を見出しに書く）。
//   psql のメタコマンド（\ で始まる行）・SET ROLE・SET SESSION AUTHORIZATION が最上位にあれば止める。最上位の SET は 1 本ごとに RESET ALL で消す。
// 使い方:
//   node scripts/release-bundle-2026-10.mjs forward  <出力.sql>   # 公開前（本番: 144000 済み）→ 29 本＋reconcile
//   node scripts/release-bundle-2026-10.mjs rollback <出力.sql>   # 公開後 → reconcile と 29 本を戻し、144000 を当て直す
//   --date-aligned-off: 「日程がそろいました」のベル・メールの引き金 private_group_on_date_response（本番に無い。20261010130000 で新設、
//     20261020110000 で作り直し）も無効で作る。既定は有効（手順書のとおり）。社長の判断で使う（2026-10-21 統合の要判断）
//   試験だけ: --test-sleep 0.2（1 本ごとに待つ。取引の途中を外から覗く試験用）／--test-fail-after <版>（その版の後でわざと失敗）
//   試験の印がある SQL は scripts/release-apply-2026-10.sh が手元の DB 以外では流さない。
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

const ROOT = path.resolve(new URL('..', import.meta.url).pathname)
const DOC = path.join(ROOT, 'docs/ops/本番公開の戻し方_2026-10.md')
const HOTFIX_APPLIED = ['20261020100000', '20261021144000'] // 本番で公開前から当たっている版（当てない・戻さない）
const REAPPLY_AFTER_ROLLBACK = '20261021144000'
// 3 関数と #1202 の検査の関数の本文の md5（公開前 = 本番 2026-10-21 読み取り、公開後 = reconcile 後。staging の実物と同じ）
export const MD5 = {
  pre: {
    create_private_booking_request: 'f5ebfb22dc6bd56276a9297252670d86',
    create_private_group_atomic: 'c8704b6826f8f621bad8557782af2e87',
    private_group_set_preferred_stores: '40c5130066af552342bb3bfabf628eb5',
    private_booking_store_slot_rule: '5bb140c7086928097e37d4f4243a2c0a',
  },
  post: {
    create_private_booking_request: 'e9a9b7734feef48aaaa861502d7df13c',
    create_private_group_atomic: 'ee6f42bfc6f950f6b77e00f6bd24e90d',
    private_group_set_preferred_stores: '7789faef2c22581c7a7dbdcb0313342a',
    private_booking_store_slot_rule: null,
  },
}
// 新しく作られる通知（同じ取引の中で無効にする。3 章の 1）
const NEW_CRONS = ['process-web-push', 'private-group-guest-chat-digest', 'private-group-memories-notice']
const NEW_TRIGGERS = [['private_group_messages', 'web_push_on_group_message'], ['user_notifications', 'web_push_on_user_notification']]
const DISABLE_AFTER = {
  '20261010130000': [
    `SELECT cron.alter_job(jobid, active := false) FROM cron.job WHERE jobname IN ('process-web-push', 'private-group-guest-chat-digest');`,
    'ALTER TABLE public.private_group_messages DISABLE TRIGGER web_push_on_group_message;',
    'ALTER TABLE public.user_notifications DISABLE TRIGGER web_push_on_user_notification;',
  ],
  '20261010160000': [
    `SELECT cron.alter_job(jobid, active := false) FROM cron.job WHERE jobname = 'private-group-memories-notice';`,
    'ALTER TABLE public.user_notifications DISABLE TRIGGER web_push_on_user_notification;',
  ],
}

/** SQL を最上位の文に分ける。文字列（'…'・E'…'）・引用識別子・$tag$…$tag$・-- とブロックコメントの中の ; では分けない */
export function splitTopLevel(sql) {
  const out = []; let start = 0; let i = 0; const n = sql.length
  while (i < n) {
    const c = sql[i], d = sql[i + 1]
    if (c === '-' && d === '-') { const e = sql.indexOf('\n', i); i = e < 0 ? n : e + 1; continue }
    if (c === '/' && d === '*') {
      let depth = 1; i += 2
      while (i < n && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') { depth++; i += 2 } else if (sql[i] === '*' && sql[i + 1] === '/') { depth--; i += 2 } else i++
      }
      continue
    }
    if (c === "'") {
      const escaped = i > 0 && /[eE]/.test(sql[i - 1]) && !/[A-Za-z0-9_]/.test(sql[i - 2] ?? ' ')
      i++
      while (i < n) {
        if (escaped && sql[i] === '\\') { i += 2; continue }
        if (sql[i] === "'") { if (sql[i + 1] === "'") { i += 2; continue } i++; break }
        i++
      }
      continue
    }
    if (c === '"') { i++; while (i < n) { if (sql[i] === '"') { if (sql[i + 1] === '"') { i += 2; continue } i++; break } i++ } continue }
    if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i))
      if (m && !/[A-Za-z0-9_]/.test(sql[i - 1] ?? ' ')) {
        const tag = m[0]; const e = sql.indexOf(tag, i + tag.length)
        if (e < 0) throw new Error(`閉じていない ${tag} があります`)
        i = e + tag.length; continue
      }
    }
    if (c === ';') { out.push(sql.slice(start, i + 1)); start = i + 1 }
    i++
  }
  const rest = sql.slice(start)
  if (rest.trim()) out.push(rest)
  return out
}

/** 文の先頭（コメントと空白を除く） */
export function head(stmt) {
  let s = stmt
  for (;;) {
    const t = s.replace(/^\s+/, '')
    if (t.startsWith('--')) { const e = t.indexOf('\n'); s = e < 0 ? '' : t.slice(e + 1); continue }
    if (t.startsWith('/*')) { const e = t.indexOf('*/'); s = e < 0 ? '' : t.slice(e + 2); continue }
    return t
  }
}

const TXN = /^(BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK)(\s+(WORK|TRANSACTION))?\s*;?\s*$/i

/** 1 ファイルを取引の文なしにする。外した文と、最上位の SET の有無を返す */
export function stripTransaction(sql, name) {
  const kept = []; const removed = []; let hasSet = false
  for (const stmt of splitTopLevel(sql)) {
    const h = head(stmt)
    if (!h) { kept.push(stmt); continue }
    if (TXN.test(h)) { removed.push(h.replace(/\s+/g, ' ')); kept.push(stmt.replace(h, `/* release-bundle: 外した取引の文: ${h.replace(/\s+/g, ' ').replace(/\*\//g, '')} */`)); continue }
    if (h.startsWith('\\')) throw new Error(`${name}: psql のメタコマンドがあります: ${h.slice(0, 40)}`)
    if (/^SET\s+(ROLE|SESSION\s+AUTHORIZATION)\b/i.test(h)) throw new Error(`${name}: SET ROLE／SESSION AUTHORIZATION があります`)
    if (/^(SET|RESET)\b/i.test(h)) hasSet = true
    kept.push(stmt)
  }
  // 外した文以外が元と同じことを確かめる
  const again = splitTopLevel(kept.join('')).map(head).filter(h => h && TXN.test(h))
  if (again.length) throw new Error(`${name}: 取引の文が残っています`)
  return { sql: kept.join(''), removed, hasSet }
}

/** 1 章の表（適用順）を読む */
export function releaseList() {
  const doc = readFileSync(DOC, 'utf8')
  const rows = [...doc.matchAll(/^\| [0-9]+ \| `([0-9]{14}_[^`]+)\.sql`/gm)].map(m => m[1])
  if (rows.length !== 31) throw new Error(`1 章の表が 31 行ではありません（${rows.length}）`)
  return rows.filter(b => !HOTFIX_APPLIED.includes(b.slice(0, 14)))
}

const sha = s => createHash('sha256').update(s).digest('hex')
const q = s => `'${s.replace(/'/g, "''")}'`
const fileOf = (dir, v) => {
  const f = readdirSync(path.join(ROOT, 'supabase', dir)).find(x => x.startsWith(`${v}_`) && x.endsWith('.sql'))
  if (!f) throw new Error(`supabase/${dir}/${v}_*.sql が無い`)
  return path.join('supabase', dir, f)
}

function md5Check(label, want) {
  const rows = Object.entries(want).map(([fn, md5]) => md5
    ? `  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = ${q(fn)} AND pronamespace = 'public'::regnamespace) IS DISTINCT FROM ${q(md5)} THEN RAISE EXCEPTION '${label}: % の本文が想定と違う', ${q(fn)}; END IF;`
    : `  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = ${q(fn)} AND pronamespace = 'public'::regnamespace) THEN RAISE EXCEPTION '${label}: % が残っている', ${q(fn)}; END IF;`)
  return `DO $release_check$\nBEGIN\n${rows.join('\n')}\nEND $release_check$;\n`
}

function settings(opts) {
  return `SET LOCAL lock_timeout = ${q(opts.lockTimeout)};\nSET LOCAL statement_timeout = ${q(opts.statementTimeout)};\nSET LOCAL idle_in_transaction_session_timeout = '0';\n`
}

const DATE_ALIGNED_OFF = 'ALTER TABLE public.private_group_date_responses DISABLE TRIGGER private_group_on_date_response;'

export function build(mode, opts = {}) {
  opts = { lockTimeout: '5s', statementTimeout: '120s', testSleep: null, testFailAfter: null, dateAlignedOff: false, ...opts }
  const list = releaseList()
  const versions = list.map(b => b.slice(0, 14))
  const test = opts.testSleep || opts.testFailAfter
  const parts = []; const manifest = []
  const add = (dir, base, extra = []) => {
    const rel = fileOf(dir, base.slice(0, 14)); const src = readFileSync(path.join(ROOT, rel), 'utf8')
    const { sql, removed, hasSet } = stripTransaction(src, rel)
    manifest.push(`--   ${rel} sha256=${sha(src)}${removed.length ? ` 外した文=${removed.join(' / ')}` : ''}${hasSet ? ' 最上位の SET あり' : ''}`)
    parts.push(`\n-- >>> ${rel}\n${sql}\n-- <<< ${rel}\nRESET ALL;\n${settings(opts)}${extra.join('\n')}${extra.length ? '\n' : ''}`)
    if (opts.testSleep) parts.push(`SELECT pg_sleep(${Number(opts.testSleep)});\n`)
    if (opts.testFailAfter && base.startsWith(opts.testFailAfter)) parts.push(`SELECT 1/0 AS release_bundle_test_failure;\n`)
  }
  const vlist = versions.map(q).join(', ')
  let pre, post
  if (mode === 'forward') {
    pre = `DO $release_pre$\nBEGIN\n  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN (${HOTFIX_APPLIED.map(q).join(', ')})) <> ${HOTFIX_APPLIED.length} THEN RAISE EXCEPTION '公開前の確認: hotfix（20261020100000・20261021144000）が当たっていない'; END IF;\n  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN (${vlist})) THEN RAISE EXCEPTION '公開前の確認: 公開分のどれかが既に当たっている'; END IF;\nEND $release_pre$;\n${md5Check('公開前の確認', MD5.pre)}`
    for (const b of list) add('migrations', b, [...(DISABLE_AFTER[b.slice(0, 14)] ?? []),
      ...(opts.dateAlignedOff && ['20261010130000', '20261020110000'].includes(b.slice(0, 14)) ? [DATE_ALIGNED_OFF] : []),
      `INSERT INTO supabase_migrations.schema_migrations(version, name) VALUES (${q(b.slice(0, 14))}, ${q(b.slice(15))});`])
    post = `${md5Check('公開後の確認', MD5.post)}DO $release_post$\nBEGIN\n  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname IN (${NEW_CRONS.map(q).join(', ')}) AND active) THEN RAISE EXCEPTION '公開後の確認: 新しい定期実行が有効になっている'; END IF;\n${NEW_TRIGGERS.map(([t, g]) => `  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = ${q(g)} AND tgrelid = 'public.${t}'::regclass AND tgenabled <> 'D') THEN RAISE EXCEPTION '公開後の確認: % が有効', ${q(g)}; END IF;`).join('\n')}\n  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN (${vlist})) <> ${versions.length} THEN RAISE EXCEPTION '公開後の確認: 履歴が ${versions.length} 本ではない'; END IF;\nEND $release_post$;\n`
  } else if (mode === 'rollback') {
    pre = `DO $release_pre$\nBEGIN\n  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN (${vlist})) <> ${versions.length} THEN RAISE EXCEPTION '戻す前の確認: 公開分 ${versions.length} 本が全部は当たっていない（一部だけの戻しはこの SQL では扱わない）'; END IF;\nEND $release_pre$;\n${md5Check('戻す前の確認', MD5.post)}`
    for (const b of [...list].reverse()) add('rollbacks', b)
    add('migrations', fileOf('migrations', REAPPLY_AFTER_ROLLBACK).split('/').pop().replace(/\.sql$/, ''))
    parts.push(`DELETE FROM supabase_migrations.schema_migrations WHERE version IN (${vlist});\n`)
    post = `${md5Check('戻した後の確認', MD5.pre)}DO $release_post$\nBEGIN\n  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN (${vlist})) THEN RAISE EXCEPTION '戻した後の確認: 履歴が残っている'; END IF;\n  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN (${HOTFIX_APPLIED.map(q).join(', ')})) <> ${HOTFIX_APPLIED.length} THEN RAISE EXCEPTION '戻した後の確認: hotfix の履歴が無い'; END IF;\nEND $release_post$;\n`
  } else throw new Error('forward か rollback を指定してください')
  const body = `${parts.join('')}`
  return `-- release-bundle-2026-10 ${mode}${test ? ' TEST-BUNDLE（試験用。本番では流さない）' : ''}${opts.dateAlignedOff ? ' date-aligned-off' : ''}
-- 生成: node scripts/release-bundle-2026-10.mjs ${mode}。手で直さない。流し方は scripts/release-apply-2026-10.sh
-- 1 つの取引で当てる（途中で失敗すれば全部取り消され、ほかの接続からは前か後の状態しか見えない）。
-- lock_timeout=${opts.lockTimeout}（ほかの接続の鍵を待つのはここまで。超えたら全体を取り消す）、statement_timeout=${opts.statementTimeout}
-- 元のファイル（${manifest.length} 本）:
${manifest.join('\n')}
-- psql のメタコマンドは入れない（scripts/release-apply-2026-10.sh が全体を 1 回の問い合わせ〈psql -c〉で送り、往復の回数で取引が長引かないようにするため）
BEGIN;
${settings(opts)}${pre}${body}${post}COMMIT;
`
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [mode, out, ...rest] = process.argv.slice(2)
  const opts = {}
  for (let i = 0; i < rest.length; i += 2) {
    if (rest[i] === '--test-sleep') opts.testSleep = rest[i + 1]
    else if (rest[i] === '--test-fail-after') opts.testFailAfter = rest[i + 1]
    else if (rest[i] === '--date-aligned-off') { opts.dateAlignedOff = true; i-- }
    else if (rest[i] === '--lock-timeout') opts.lockTimeout = rest[i + 1]
    else if (rest[i] === '--statement-timeout') opts.statementTimeout = rest[i + 1]
    else throw new Error(`知らない指定: ${rest[i]}`)
  }
  if (!out) { console.error('使い方: node scripts/release-bundle-2026-10.mjs <forward|rollback> <出力.sql> [--test-sleep 秒] [--test-fail-after 版]'); process.exit(2) }
  const sql = build(mode, opts)
  writeFileSync(out, sql)
  console.log(`${out} sha256=${sha(sql)}（${mode}${opts.testSleep || opts.testFailAfter ? '、試験用' : ''}）`)
}
