#!/usr/bin/env node
// 本番公開後の構造照合（docs/ops/本番公開の戻し方_2026-10.md の 2 章 5）。
// 写した構造（既定 supabase/structure/prod.json）の関数を expected-function-overrides.json と比べる。
//   値が null の項目 = migration で消したはずの関数: 実際に残っていれば NG、無ければ OK。
//   それ以外 = その関数があり、本文の md5 と権限（acl）が一致していれば OK。
// scripts/check-db-baseline.sh の null の扱い（期待構造から外す）と同じ考え方（2026-10-21 Codex 第 3 回レビュー N2）。
// 使い方: node scripts/check-function-overrides.mjs [構造の JSON] [期待差分の JSON]   （NG があれば終了コード 1）
import { readFileSync } from 'node:fs'

const structurePath = process.argv[2] || 'supabase/structure/prod.json'
const overridesPath = process.argv[3] || 'supabase/structure/expected-function-overrides.json'
const actual = JSON.parse(readFileSync(structurePath, 'utf8')).functions || {}
const expected = JSON.parse(readFileSync(overridesPath, 'utf8'))

export function compareFunctionOverrides(actualFunctions, expectedOverrides) {
  const ng = []
  for (const [name, want] of Object.entries(expectedOverrides)) {
    const got = actualFunctions[name]
    if (want === null) {
      if (got) ng.push(`NG ${name}: 消えているはずの関数が残っている`)
      continue
    }
    if (!got) { ng.push(`NG ${name}: 関数が無い`); continue }
    if (got.body_md5 !== want.body_md5) ng.push(`NG ${name}: 本文の md5 が違う（実際 ${got.body_md5}／期待 ${want.body_md5}）`)
    if (JSON.stringify(got.acl ?? null) !== JSON.stringify(want.acl ?? null)) ng.push(`NG ${name}: 権限が違う（実際 ${JSON.stringify(got.acl)}／期待 ${JSON.stringify(want.acl)}）`)
  }
  return ng
}

const ng = compareFunctionOverrides(actual, expected)
const removed = Object.values(expected).filter(v => v === null).length
if (ng.length) { console.log(ng.join('\n')); process.exit(1) }
console.log(`OK ${Object.keys(expected).length} 件（うち消えているはずの関数 ${removed} 件が無いことも確認）`)
