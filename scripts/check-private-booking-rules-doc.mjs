#!/usr/bin/env node
// 貸切の受付判定に関わるファイルを変えたのに、仕様の正本 docs/product-spec/貸切受付ルール.md が変わっていなければ失敗にする。
// 「判定に関わるファイル」の一覧は文書の <!-- rules-files:start --> 〜 <!-- rules-files:end --> の間（`パス` の箇条書き）から読む。
// 差分の取り方: CI（GITHUB_ACTIONS）は HEAD^1..HEAD（PR はマージ結果の第 1 親＝取り込み先、checkout は fetch-depth: 2）。
//   手元は、ステージ済みの変更があればそれ（pre-commit）、無ければ origin/staging との分岐点からの変更＋未コミット・未追跡の変更。
//   RULES_DIFF_BASE=<ref> で基準を指定できる。
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const DOC = 'docs/product-spec/貸切受付ルール.md'
const root = path.resolve(new URL('..', import.meta.url).pathname)
const git = (...args) => execFileSync('git', ['-c', 'core.quotePath=false', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const lines = text => text.split('\n').map(s => s.trim()).filter(Boolean)
const fail = message => { console.error(`[PRIVATE_BOOKING_RULES] NG: ${message}`); process.exit(1) }

const docPath = path.join(root, DOC)
if (!fs.existsSync(docPath)) fail(`${DOC} がありません`)
const doc = fs.readFileSync(docPath, 'utf8')
const block = doc.match(/<!-- rules-files:start -->([\s\S]*?)<!-- rules-files:end -->/)
if (!block) fail(`${DOC} に「判定に関わるファイル」の一覧（<!-- rules-files:start --> 〜 end）がありません`)
const watched = [...block[1].matchAll(/^\s*-\s*`([^`]+)`/gm)].map(m => m[1])
if (watched.length === 0) fail('「判定に関わるファイル」の一覧が空です')
const missing = watched.filter(p => !p.includes('*') && !fs.existsSync(path.join(root, p)))
if (missing.length) fail(`一覧にあるファイルが見つかりません（移動・改名したら文書の一覧も直す）:\n  - ${missing.join('\n  - ')}`)
const toRegExp = p => new RegExp('^' + p.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$')
const matchers = watched.map(toRegExp)

function changedFiles() {
  try {
    if (process.env.RULES_DIFF_BASE) return lines(git('diff', '--name-only', `${process.env.RULES_DIFF_BASE}...HEAD`)).concat(lines(git('diff', '--name-only', 'HEAD')))
    if (process.env.GITHUB_ACTIONS) return lines(git('diff', '--name-only', 'HEAD^1', 'HEAD'))
    const staged = lines(git('diff', '--name-only', '--cached'))
    if (staged.length) return staged
    let base = null
    try { base = git('merge-base', 'origin/staging', 'HEAD').trim() } catch { /* origin/staging が無い */ }
    return (base ? lines(git('diff', '--name-only', base, 'HEAD')) : [])
      .concat(lines(git('diff', '--name-only', 'HEAD')), lines(git('ls-files', '--others', '--exclude-standard')))
  } catch (error) {
    console.warn(`[PRIVATE_BOOKING_RULES] 差分を取得できないため確認を省略します（${error.message.split('\n')[0]}）`)
    return null
  }
}

const changed = changedFiles()
if (changed === null) process.exit(0)
const unique = [...new Set(changed)]
const touched = unique.filter(f => matchers.some(re => re.test(f)))
if (touched.length && !unique.includes(DOC)) {
  fail(`貸切の受付判定に関わるファイルを変えていますが、${DOC} が変わっていません。\n` +
    `  先に文書を読み、同じ変更で「入力」「判定の手順」「例」を更新してください（例の表を変えたら supabase/tests/private_booking_rules_examples.sql も）。\n` +
    `  変えたファイル:\n  - ${touched.join('\n  - ')}`)
}
console.log(`[PRIVATE_BOOKING_RULES] OK（判定に関わるファイル ${watched.length} 件を確認。今回の変更で該当 ${touched.length} 件）`)
