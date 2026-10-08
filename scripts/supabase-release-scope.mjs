#!/usr/bin/env node
// DBを先行適用したことを検証し、今回変更した関数とその依存先だけを配備対象にする。
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
const base = event.before || (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch'
  ? execFileSync('git', ['rev-parse', 'HEAD^'], { encoding: 'utf8' }).trim() : null)
const head = process.env.GITHUB_SHA
if (!base || !/^[0-9a-f]{40}$/.test(base) || /^0+$/.test(base)) {
  throw new Error('pushの比較元がありません。DB先行適用を確認し、対象関数を指定してCLIから配備してください。')
}
const changed = new Set(execFileSync('git', ['diff', '--name-only', base, head], { encoding: 'utf8' }).trim().split('\n').filter(Boolean))
const migrationVersions = [...changed].filter(p => /^supabase\/migrations\/\d+_.*\.sql$/.test(p)).map(p => path.basename(p).split('_')[0])
// Explicit operator-selected pre-activation phase. Ordinary pushes still require every migration.
const phase=process.env.MMQ_RELEASE_PHASE || 'complete'
if(!['complete','prepare-edges'].includes(phase)) throw new Error('Invalid release phase')
if(phase==='prepare-edges' && process.env.GITHUB_EVENT_NAME!=='workflow_dispatch') throw new Error('prepare-edges requires workflow_dispatch')
const activationDependencies={'20260927120100':'20260927120000','20261007110004':'20261007110001'}
const registeredActivations=process.env.GITHUB_EVENT_NAME==='workflow_dispatch'
 && existsSync('supabase/migrations')
 ? Object.keys(activationDependencies).filter(v=>readdirSync('supabase/migrations').some(file=>file.startsWith(v+'_')&&file.endsWith('.sql')))
 : []
const releaseVersions=[...new Set([...migrationVersions,...registeredActivations,...registeredActivations.map(v=>activationDependencies[v])])]
const deferred=phase==='prepare-edges'?releaseVersions.filter(v=>activationDependencies[v]):[]
const requiredVersions=[...new Set(releaseVersions.filter(v=>!deferred.includes(v)).concat(deferred.map(v=>activationDependencies[v])))]
if(deferred.length) console.log(`Activation deferred until Edge deployment completes: ${deferred.join(', ')}. Apply with the selected migration workflow, then run complete.`)
if (requiredVersions.length) {
  const ref = process.env.SUPABASE_PROJECT_REF
  if (!/^[a-z0-9]{20}$/.test(ref || '')) throw new Error('配備先project refが不正です')
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `SELECT version FROM supabase_migrations.schema_migrations WHERE version IN (${requiredVersions.map(v => `'${v}'`).join(',')})` }),
  })
  if (!response.ok) throw new Error(`DB先行適用の確認に失敗: HTTP ${response.status}`)
  const rows = await response.json()
  const applied = new Set(rows.map(r => r.version))
  const missing = requiredVersions.filter(v => !applied.has(v))
  if (missing.length) throw new Error(`DBへの先行適用が必要です: ${missing.join(', ')}`)
}
const root = 'supabase/functions'
function dependsOnChange(file, seen = new Set()) {
  file = path.normalize(file)
  if (seen.has(file)) return false
  seen.add(file)
  if (changed.has(file)) return true
  if (!existsSync(file)) return false
  const source = readFileSync(file, 'utf8')
  const imports = [...source.matchAll(/(?:from\s*|import\s*\(?\s*)['"](\.[^'"]+)['"]/g)].map(m => m[1])
  return imports.some(p => dependsOnChange(path.join(path.dirname(file), p), seen))
}
let targets = readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('_')).map(d => d.name).filter(name => [...changed].some(p => p.startsWith(`${root}/${name}/`)) || dependsOnChange(`${root}/${name}/index.ts`))
if(phase==='prepare-edges' && deferred.includes('20260927120100')) {
 const approvalFunctions=['process-private-approval-deliveries','reconcile-private-delivery','send-private-booking-confirmation','notify-gm-private-booking-confirmed','provision-private-booking-discord','process-private-survey-deliveries','process-private-rejection-deliveries']
 targets=[...new Set([...targets,...approvalFunctions.filter(name=>existsSync(`${root}/${name}/index.ts`))])]
}
if(phase==='prepare-edges' && deferred.includes('20261007110004')) targets=[...new Set([...targets,'notify-waitlist','process-waitlist-queue'])]
if (targets.some(name => !/^[a-z0-9-]+$/.test(name))) throw new Error('不正な関数名')
writeFileSync(path.join(process.env.RUNNER_TEMP, 'mmq-deploy-functions.txt'), targets.join('\n') + (targets.length ? '\n' : ''))
console.log(`DB先行適用を確認: ${migrationVersions.length}件。対象関数: ${targets.join(', ') || 'なし'}`)
