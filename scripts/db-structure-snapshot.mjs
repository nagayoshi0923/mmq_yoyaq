#!/usr/bin/env node
// scripts/db-structure-snapshot.mjs
// DB 構造（表・列・制約・索引・RLS・ポリシー・関数・トリガー）を正規化した JSON に写し取る。
// 用途: supabase/structure/<env>.json を正本にして、本番/staging とのずれ（drift）を検知する。
// 読み取り専用。db-url は db-status.mjs と同じ Keychain 参照で組み立てる。パスワードは出力しない。
//
// 使い方:
//   node scripts/db-structure-snapshot.mjs prod            # 標準出力に JSON
//   node scripts/db-structure-snapshot.mjs staging --write # supabase/structure/staging.json へ保存
//   node scripts/db-structure-snapshot.mjs prod --diff     # supabase/structure/prod.json と比較し、差があれば exit 1
//   DB_URL=postgresql://... node scripts/db-structure-snapshot.mjs custom --diff-against supabase/structure/prod.json
//   SUPABASE_ACCESS_TOKEN=... node scripts/db-structure-snapshot.mjs prod --via-api --diff   # CI 用（Management API 経由、直接接続不要）

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'

const ENVIRONMENTS = {
  staging: { keychainService: 'supabase-db-staging', host: 'db.lavutzztfqbdndjiwluc.supabase.co', projectRef: 'lavutzztfqbdndjiwluc' },
  prod: { keychainService: 'supabase-db-prod', host: 'db.cznpcewciwywcqcxktba.supabase.co', projectRef: 'cznpcewciwywcqcxktba' },
}

const [env, ...flags] = process.argv.slice(2)
if (!env) { console.error('usage: db-structure-snapshot.mjs <prod|staging|custom> [--write] [--diff] [--diff-against <file>]'); process.exit(2) }

// 接続情報はコマンドラインに載せない（エラー出力にパスワードが混ざらないようにする）。
function connection() {
  if (process.env.DB_URL) return { args: [process.env.DB_URL], envExtra: {} }
  const e = ENVIRONMENTS[env]
  if (!e) throw new Error(`unknown env ${env} (set DB_URL for custom)`)
  const pw = execFileSync('security', ['find-generic-password', '-s', e.keychainService, '-a', 'postgres', '-w'], { encoding: 'utf8' }).trim()
  return { args: ['-h', e.host, '-p', '5432', '-U', 'postgres', '-d', 'postgres'], envExtra: { PGPASSWORD: pw } }
}

const SQL = `
WITH tables AS (
  SELECT c.oid, c.relname AS table_name, c.relrowsecurity AS rls
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
),
columns AS (
  SELECT a.attrelid AS oid, jsonb_agg(jsonb_build_object(
      'name', a.attname,
      'type', format_type(a.atttypid, a.atttypmod),
      'not_null', a.attnotnull,
      'default', pg_get_expr(d.adbin, d.adrelid)
    ) ORDER BY a.attnum) AS cols
  FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attnum > 0 AND NOT a.attisdropped AND a.attrelid IN (SELECT oid FROM tables)
  GROUP BY a.attrelid
),
constraints AS (
  SELECT conrelid AS oid, jsonb_agg(jsonb_build_object('name', conname, 'type', contype, 'def', pg_get_constraintdef(c.oid)) ORDER BY conname) AS cons
  FROM pg_constraint c WHERE conrelid IN (SELECT oid FROM tables) GROUP BY conrelid
),
indexes AS (
  SELECT i.indrelid AS oid, jsonb_agg(jsonb_build_object('name', ic.relname, 'def', pg_get_indexdef(i.indexrelid)) ORDER BY ic.relname) AS idx
  FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid WHERE i.indrelid IN (SELECT oid FROM tables) GROUP BY i.indrelid
),
policies AS (
  SELECT p.polrelid AS oid, jsonb_agg(jsonb_build_object(
      'name', p.polname, 'cmd', p.polcmd, 'permissive', p.polpermissive,
      'roles', (SELECT array_agg(r.rolname ORDER BY r.rolname) FROM pg_roles r WHERE r.oid = ANY(p.polroles)),
      'using', pg_get_expr(p.polqual, p.polrelid), 'check', pg_get_expr(p.polwithcheck, p.polrelid)
    ) ORDER BY p.polname) AS pols
  FROM pg_policy p WHERE p.polrelid IN (SELECT oid FROM tables) GROUP BY p.polrelid
),
triggers AS (
  SELECT t.tgrelid AS oid, jsonb_agg(jsonb_build_object('name', t.tgname, 'def', pg_get_triggerdef(t.oid)) ORDER BY t.tgname) AS trg
  FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN (SELECT oid FROM tables) GROUP BY t.tgrelid
),
table_json AS (
  SELECT t.table_name, jsonb_build_object(
    'rls', t.rls, 'columns', COALESCE(c.cols, '[]'::jsonb), 'constraints', COALESCE(k.cons, '[]'::jsonb),
    'indexes', COALESCE(i.idx, '[]'::jsonb), 'policies', COALESCE(p.pols, '[]'::jsonb), 'triggers', COALESCE(g.trg, '[]'::jsonb)
  ) AS j
  FROM tables t LEFT JOIN columns c ON c.oid = t.oid LEFT JOIN constraints k ON k.oid = t.oid
  LEFT JOIN indexes i ON i.oid = t.oid LEFT JOIN policies p ON p.oid = t.oid LEFT JOIN triggers g ON g.oid = t.oid
),
views AS (
  SELECT jsonb_object_agg(c.relname, jsonb_build_object('kind', c.relkind, 'def', pg_get_viewdef(c.oid, true))) AS j
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('v','m')
),
functions AS (
  SELECT jsonb_object_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', jsonb_build_object(
      'returns', pg_get_function_result(p.oid), 'language', l.lanname, 'security_definer', p.prosecdef,
      'body_md5', md5(p.prosrc),
      'acl', (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(COALESCE(p.proacl, ARRAY[]::aclitem[])) a(a))
    ) ORDER BY p.proname) AS j
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang
  WHERE n.nspname = 'public' AND p.prokind IN ('f','p')
),
enums AS (
  SELECT jsonb_object_agg(t.typname, (SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = t.oid)) AS j
  FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e'
)
SELECT jsonb_build_object(
  'tables', (SELECT jsonb_object_agg(table_name, j ORDER BY table_name) FROM table_json),
  'views', COALESCE((SELECT j FROM views), '{}'::jsonb),
  'functions', COALESCE((SELECT j FROM functions), '{}'::jsonb),
  'enums', COALESCE((SELECT j FROM enums), '{}'::jsonb)
)::text;
`

async function viaApi() {
  // GitHub Actions からは直接 DB 接続が通らない（IPv6）ため、Supabase Management API の query エンドポイントを使う。
  const e = ENVIRONMENTS[env]
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!e || !token) throw new Error('--via-api needs a known env and SUPABASE_ACCESS_TOKEN')
  const res = await fetch(`https://api.supabase.com/v1/projects/${e.projectRef}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: SQL.replace(/::text;\s*$/, '::text AS snapshot;') }),
  })
  if (!res.ok) throw new Error(`Management API ${res.status} for ${env}`)
  const rows = await res.json()
  const first = Array.isArray(rows) ? rows[0] : rows
  const text = first?.snapshot ?? first?.jsonb_build_object ?? Object.values(first ?? {})[0]
  return typeof text === 'string' ? text : JSON.stringify(text)
}

function viaPsql() {
  const conn = connection()
  try {
    return execFileSync('psql', [...conn.args, '-At', '-v', 'ON_ERROR_STOP=1', '-c', SQL], {
      encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, ...conn.envExtra }, stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (err) {
    // コマンド本文（接続情報を含む）は出さず、psql のエラーメッセージだけを出す
    const msg = String(err.stderr || '').split('\n').filter((l) => /ERROR|FATAL|HINT|LINE/.test(l)).join('\n')
    console.error(`db-structure-snapshot: psql failed for ${env}\n${msg}`)
    process.exit(1)
  }
}

const raw = flags.includes('--via-api') ? await viaApi() : viaPsql()
const snapshot = JSON.parse(raw.trim())
const body = { tables: snapshot.tables, views: snapshot.views, functions: snapshot.functions, enums: snapshot.enums }
const digest = createHash('sha256').update(JSON.stringify(body)).digest('hex')
const out = { meta: { env, captured_at: new Date().toISOString(), table_count: Object.keys(body.tables).length, function_count: Object.keys(body.functions).length, digest }, ...body }
const text = JSON.stringify(out, null, 1) + '\n'

function summarize(a, b) {
  const diffs = []
  const walk = (x, y, path) => {
    if (JSON.stringify(x) === JSON.stringify(y)) return
    if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x) && !Array.isArray(y)) {
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
        if (!(k in x)) diffs.push(`+ ${path}${k}`)
        else if (!(k in y)) diffs.push(`- ${path}${k}`)
        else walk(x[k], y[k], `${path}${k}.`)
      }
      return
    }
    diffs.push(`~ ${path.replace(/\.$/, '')}`)
  }
  walk(a, b, '')
  return diffs
}

if (flags.includes('--write')) {
  mkdirSync('supabase/structure', { recursive: true })
  writeFileSync(`supabase/structure/${env}.json`, text)
  console.log(`wrote supabase/structure/${env}.json (${out.meta.table_count} tables, ${out.meta.function_count} functions, digest ${digest.slice(0, 12)})`)
} else if (flags.includes('--diff') || flags.includes('--diff-against')) {
  const file = flags.includes('--diff-against') ? flags[flags.indexOf('--diff-against') + 1] : `supabase/structure/${env}.json`
  const base = JSON.parse(readFileSync(file, 'utf8'))
  const diffs = summarize({ tables: base.tables, views: base.views, functions: base.functions, enums: base.enums }, body)
  if (diffs.length === 0) { console.log(`no drift: ${env} matches ${file} (${out.meta.table_count} tables)`); process.exit(0) }
  console.log(`DRIFT: ${env} differs from ${file} in ${diffs.length} place(s):`)
  for (const d of diffs.slice(0, 200)) console.log('  ' + d)
  process.exit(1)
} else {
  process.stdout.write(text)
}
