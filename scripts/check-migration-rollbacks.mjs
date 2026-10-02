#!/usr/bin/env node
// migration には rollback が対で必要（整備計画 Phase 4、docs/MMQ_SEIBI_PLAN_2026-10.md 第9節の決まり (1)）。
// 2026-10-02 以降に作る migration（version >= BASELINE）は supabase/rollbacks/<同名>.sql が無ければ失敗にする。
// それ以前の migration は過去分として対象外（未整理 563 本、2026-10-02 時点）。
import fs from 'node:fs'
import path from 'node:path'

const BASELINE = '20261002000000'
const root = path.resolve(new URL('..', import.meta.url).pathname)
const migrationsDir = path.join(root, 'supabase', 'migrations')
const rollbacksDir = path.join(root, 'supabase', 'rollbacks')

const migrations = fs.readdirSync(migrationsDir).filter(f => /^\d{14}_.+\.sql$/.test(f))
const rollbacks = new Set(fs.readdirSync(rollbacksDir).filter(f => f.endsWith('.sql')))
const missing = migrations
  .filter(f => f.slice(0, 14) >= BASELINE)
  .filter(f => !rollbacks.has(f))

if (missing.length) {
  console.error(`[MIGRATION_ROLLBACKS] NG: rollback が無い migration が ${missing.length} 本あります（${BASELINE} 以降は対で必要）`)
  for (const f of missing) console.error(`  - supabase/migrations/${f} → supabase/rollbacks/${f} を作る`)
  process.exit(1)
}
const checked = migrations.filter(f => f.slice(0, 14) >= BASELINE).length
console.log(`[MIGRATION_ROLLBACKS] OK (${checked} 本を確認、${BASELINE} 以降)`)
