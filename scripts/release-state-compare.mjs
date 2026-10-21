#!/usr/bin/env node
// scripts/release-state-snapshot.sql の前後を比べる（2026-10 リリース統合の前後照合）。
//   forward : 既存の定期実行・app_config・引き金・バケット・storage のポリシーは 1 件も変わらない／消えない。
//             増えてよいのは新しいものだけ。新しい定期実行は active=false、新しい通知の引き金 3 本は enabled=D（どれかが無ければ NG）。
//   rollback: 公開で増えたものが消えるだけ。残っているものは変わらない／増えない。
//   same    : 完全に同じ（公開前 → 当てて戻した後、など）。
// 種類 migration・function_md5 は差を一覧に出すだけ（判定は適用の SQL の中で行う）。終了コード 1 = NG。
// same で「増えたが想定どおり」のものは環境変数 ALLOW_ADDED に「種類 名前」を ; 区切りで渡す
//   （例: 戻した後に残る空のバケット 'bucket private-group-photos'。SQL からはバケットを消せない。手順書 (c) の 1）。
import { readFileSync } from 'node:fs'
const [mode, beforePath, afterPath] = process.argv.slice(2)
if (!['forward', 'rollback', 'same'].includes(mode) || !afterPath) { console.error('使い方: node scripts/release-state-compare.mjs <forward|rollback|same> 前.tsv 後.tsv'); process.exit(2) }
const read = p => new Map(readFileSync(p, 'utf8').split('\n').filter(l => l.includes('\t')).map(l => { const [k, n, ...v] = l.split('\t'); return [`${k}\t${n}`, v.join('\t')] }))
const a = read(beforePath), b = read(afterPath)
const INFO = new Set(['migration', 'function_md5'])
const ALLOW_ADDED = new Set((process.env.ALLOW_ADDED || '').split(';').map(x => x.trim()).filter(Boolean))
// 新しく作る通知の引き金（必ず D で作る）: ウェブプッシュ 2 本と「日程がそろいました」1 本（2026-10-21 Codex 独立試験 P1-1）
const NEW_NOTIFY_TRIGGERS = ['public.private_group_messages.web_push_on_group_message', 'public.user_notifications.web_push_on_user_notification', 'public.private_group_date_responses.private_group_on_date_response']
const ng = [], info = []
for (const key of new Set([...a.keys(), ...b.keys()])) {
  const [kind, name] = key.split('\t'); const x = a.get(key), y = b.get(key)
  if (x === y) continue
  const line = `${kind} ${name}: ${x ?? '(無し)'} → ${y ?? '(無し)'}`
  if (INFO.has(kind)) { info.push(line); continue }
  if (mode === 'same') { if (x === undefined && ALLOW_ADDED.has(`${kind} ${name}`)) info.push(`増えた（想定どおり） ${line}`); else ng.push(line); continue }
  if (x !== undefined && y !== undefined) { ng.push(`変わった ${line}`); continue }
  if (mode === 'forward') {
    if (x !== undefined) { ng.push(`消えた ${line}`); continue }
    if (kind === 'cron' && !y.includes('active=false')) { ng.push(`新しい定期実行が有効 ${line}`); continue }
    if (kind === 'trigger' && NEW_NOTIFY_TRIGGERS.includes(name) && y !== 'enabled=D') { ng.push(`新しい通知の引き金が有効 ${line}`); continue }
    if (kind === 'app_config') { ng.push(`app_config が増えた ${line}`); continue }
    info.push(`増えた ${line}`)
  } else {
    if (y !== undefined) { ng.push(`増えた ${line}`); continue }
    info.push(`消えた ${line}`)
  }
}
if (mode === 'forward') for (const t of NEW_NOTIFY_TRIGGERS) if (b.get(`trigger\t${t}`) !== 'enabled=D') ng.push(`新しい通知の引き金が D ではない／無い trigger ${t}: ${b.get(`trigger\t${t}`) ?? '(無し)'}`)
const count = k => [...b.keys()].filter(x => x.startsWith(`${k}\t`)).length
console.log(`照合（${mode}）: 定期実行 ${count('cron')} 件（有効 ${[...b.entries()].filter(([k, v]) => k.startsWith('cron\t') && v.includes('active=true')).length}）・app_config ${count('app_config')} 件・引き金 ${count('trigger')} 件・バケット ${count('bucket')} 件・storage のポリシー ${count('storage_policy')} 件`)
for (const l of info) console.log(`  ${l}`)
if (ng.length) { console.log('NG:'); for (const l of ng) console.log(`  ${l}`); process.exit(1) }
console.log('OK')
