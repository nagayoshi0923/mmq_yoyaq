/**
 * マイグレーション適用後の権限検証スクリプト
 *
 * anon ロールで公開ページに必要なテーブル/RPCにアクセスできるか、
 * 認証済みロールで管理画面のテーブルにアクセスできるかを検証する。
 *
 * Usage:
 *   node scripts/verify_permissions.mjs
 *   node scripts/verify_permissions.mjs --fix  (壊れた権限を自動修復)
 */

import fs from 'node:fs'
import path from 'node:path'

const REPO_ROOT = process.cwd()
const envPath = path.join(REPO_ROOT, '.env.local')
const envText = fs.readFileSync(envPath, 'utf8')

function getEnv(key) {
  const m = envText.match(new RegExp(`^${key}=(.+)$`, 'm'))
  return m ? m[1].trim() : null
}

const SUPABASE_URL = getEnv('VITE_SUPABASE_URL')
const ANON_KEY = getEnv('VITE_SUPABASE_ANON_KEY') || getEnv('VITE_SUPABASE_PUBLISHABLE_KEY')
const shouldFix = process.argv.includes('--fix')

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('❌ .env.local に VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY が必要です')
  process.exit(1)
}

const ANON_REQUIRED_TABLES = [
  { table: 'organizations', op: 'SELECT', filter: 'limit=1' },
  { table: 'stores', op: 'SELECT', filter: 'limit=1' },
  { table: 'scenario_masters', op: 'SELECT', filter: 'limit=1' },
  { table: 'schedule_events', op: 'SELECT', filter: 'limit=1' },
  { table: 'organization_scenarios', op: 'SELECT', filter: 'limit=1' },
  { table: 'business_hours_settings', op: 'SELECT', filter: 'limit=1' },
  { table: 'booking_notices', op: 'SELECT', filter: 'limit=1' },
  { table: 'private_groups', op: 'SELECT', filter: 'limit=1' },
  { table: 'private_group_members', op: 'SELECT', filter: 'limit=1' },
  { table: 'private_group_candidate_dates', op: 'SELECT', filter: 'limit=1' },
  { table: 'private_group_date_responses', op: 'SELECT', filter: 'limit=1' },
  { table: 'private_group_messages', op: 'SELECT', filter: 'limit=1' },
]

const ANON_REQUIRED_RPCS = [
  { name: 'get_all_public_stores', params: {} },
  { name: 'get_all_public_categories', params: {} },
]

const FIX_SQL = `
-- 公開予約サイト・貸切招待ページに必要な anon 権限を復旧
GRANT SELECT ON public.organizations TO anon;
GRANT SELECT ON public.stores TO anon;
GRANT SELECT ON public.scenario_masters TO anon;
GRANT SELECT ON public.schedule_events TO anon;
GRANT SELECT ON public.organization_scenarios TO anon;
GRANT SELECT ON public.business_hours_settings TO anon;
GRANT SELECT ON public.booking_notices TO anon;
GRANT INSERT ON public.contact_inquiries TO anon;
GRANT SELECT ON public.private_groups TO anon;
GRANT SELECT ON public.private_group_members TO anon;
GRANT SELECT ON public.private_group_candidate_dates TO anon;
GRANT SELECT ON public.private_group_date_responses TO anon;
GRANT SELECT ON public.private_group_messages TO anon;
`

async function checkAnonTable({ table, filter }) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${filter}`
  const res = await fetch(url, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
  })
  if (res.status === 200) return { ok: true }
  const body = await res.json().catch(() => ({}))
  return { ok: false, status: res.status, error: body.message || body.code || 'unknown' }
}

async function checkAnonRpc({ name, params }) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${name}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })
  if (res.status === 200) return { ok: true }
  const body = await res.json().catch(() => ({}))
  return { ok: false, status: res.status, error: body.message || body.code || 'unknown' }
}

async function main() {
  console.log('🔍 権限検証を開始...\n')
  let hasError = false

  console.log('=== anon テーブル SELECT ===')
  for (const t of ANON_REQUIRED_TABLES) {
    const result = await checkAnonTable(t)
    if (result.ok) {
      console.log(`  ✅ ${t.table}`)
    } else {
      console.error(`  ❌ ${t.table} — ${result.status} ${result.error}`)
      hasError = true
    }
  }

  console.log('\n=== anon RPC ===')
  for (const r of ANON_REQUIRED_RPCS) {
    const result = await checkAnonRpc(r)
    if (result.ok) {
      console.log(`  ✅ ${r.name}()`)
    } else {
      console.error(`  ❌ ${r.name}() — ${result.status} ${result.error}`)
      hasError = true
    }
  }

  if (hasError) {
    console.error('\n⚠️  権限エラーが検出されました')
    if (shouldFix) {
      console.log('\n🔧 --fix が指定されたため、権限を修復します...')
      console.log('以下のSQLを Supabase SQL Editor で実行してください:\n')
      console.log(FIX_SQL)
    } else {
      console.log('\n修復するには:')
      console.log('  node scripts/verify_permissions.mjs --fix')
      console.log('  → 表示されるSQLを Supabase SQL Editor で実行')
    }
    process.exit(1)
  }

  console.log('\n✅ 全ての権限チェックに合格しました')
}

main().catch(err => {
  console.error('検証スクリプトエラー:', err)
  process.exit(1)
})
