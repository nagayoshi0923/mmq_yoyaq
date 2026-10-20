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
// 2026-10-10 以降の rollback で表を消すものは、消す前に rollback_backup へ退避する（監査 R5、docs/ops/本番公開の戻し方_2026-10.md）
const BACKUP_BASELINE = '20261010100000'
const noBackup = [...rollbacks]
  .filter(f => /^\d{14}_/.test(f) && f.slice(0, 14) >= BACKUP_BASELINE)
  .filter(f => {
    const sql = fs.readFileSync(path.join(rollbacksDir, f), 'utf8').replace(/--.*$/gm, '')
    return /\bDROP\s+TABLE\b/i.test(sql) && !/rollback_backup\./.test(sql)
  })
if (noBackup.length) {
  console.error(`[MIGRATION_ROLLBACKS] NG: 表を消すのに退避が無い rollback が ${noBackup.length} 本あります（${BACKUP_BASELINE} 以降は rollback_backup へ写してから消す）`)
  for (const f of noBackup) console.error(`  - supabase/rollbacks/${f}`)
  process.exit(1)
}
const checked = migrations.filter(f => f.slice(0, 14) >= BASELINE).length
console.log(`[MIGRATION_ROLLBACKS] OK (${checked} 本を確認、${BASELINE} 以降)`)
