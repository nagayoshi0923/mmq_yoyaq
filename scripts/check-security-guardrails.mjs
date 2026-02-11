import fs from 'node:fs'
import path from 'node:path'

const REPO_ROOT = process.cwd()

const FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const SEARCH_ROOTS = [
  path.join(REPO_ROOT, 'src'),
  path.join(REPO_ROOT, 'supabase', 'functions'),
]

const IGNORE_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.next',
  '.vercel',
  '.turbo',
])

const FORBIDDEN_PATHS = [
  // 過去に問題になったテスト用 Edge Function（誤デプロイ防止）
  path.join(REPO_ROOT, 'supabase', 'functions', 'discord-test'),
  path.join(REPO_ROOT, 'supabase', 'functions', 'discord-interactions-test'),
]

const FORBIDDEN_PATTERNS = [
  // select('*') は最小権限に反する + カラム追加時に意図せずデータ露出しやすい
  { name: "select('*')", re: /\.select\(\s*['"]\*['"]\s*\)/g },
]

// RLS が不要な既知テーブル（明示的に許可されたもののみ）
const RLS_EXEMPT_TABLES = new Set([
  'discord_interaction_dedupe',
  'salary_settings_history',
  'schema_migrations',
  'supabase_migrations',
])

function isDirectory(p) {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

function walk(dir, out) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue
    if (IGNORE_DIR_NAMES.has(ent.name)) continue

    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      walk(full, out)
      continue
    }
    const ext = path.extname(ent.name)
    if (FILE_EXTENSIONS.has(ext)) out.push(full)
  }
}

function getLineNumberFromIndex(text, index) {
  // 1-based
  let line = 1
  for (let i = 0; i < index && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++
  }
  return line
}

// ===================================================================
// RLS 検証: マイグレーション内の CREATE TABLE に RLS 有効化があるか
// ===================================================================
function checkMigrationRls() {
  const migrationsDir = path.join(REPO_ROOT, 'supabase', 'migrations')
  if (!isDirectory(migrationsDir)) return []

  const sqlFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  // 全マイグレーションを結合して解析
  let allSql = ''
  for (const file of sqlFiles) {
    allSql += fs.readFileSync(path.join(migrationsDir, file), 'utf8') + '\n'
  }

  // CREATE TABLE で定義されたテーブル名を抽出
  const createTableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?["']?(\w+)["']?/gi
  const enableRlsRe = /ALTER\s+TABLE\s+(?:public\.)?["']?(\w+)["']?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi

  const createdTables = new Set()
  let m
  while ((m = createTableRe.exec(allSql)) !== null) {
    createdTables.add(m[1].toLowerCase())
  }

  const rlsEnabledTables = new Set()
  while ((m = enableRlsRe.exec(allSql)) !== null) {
    rlsEnabledTables.add(m[1].toLowerCase())
  }

  const warnings = []
  for (const table of createdTables) {
    if (RLS_EXEMPT_TABLES.has(table)) continue
    if (!rlsEnabledTables.has(table)) {
      warnings.push(`テーブル "${table}" に ENABLE ROW LEVEL SECURITY がありません`)
    }
  }

  return warnings
}

// ===================================================================
// P1-9: マイグレーション関数の上書きリスク検出
// CREATE OR REPLACE FUNCTION がセキュリティ重要関数を上書きしていないかチェック
// ===================================================================
const SECURITY_CRITICAL_FUNCTIONS = new Set([
  'is_admin',
  'is_org_admin',
  'get_user_organization_id',
  'current_organization_id',
  'is_license_manager',
  'create_reservation_with_lock',
  'create_reservation_with_lock_v2',
  'cancel_reservation_with_lock',
  'initialize_organization_data',
])

function checkFunctionOverwrite() {
  const migrationsDir = path.join(REPO_ROOT, 'supabase', 'migrations')
  if (!isDirectory(migrationsDir)) return []

  const sqlFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  const warnings = []
  const functionDefinitions = new Map() // funcName -> [{ file, line }]

  for (const file of sqlFiles) {
    const text = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    const re = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?["']?(\w+)["']?\s*\(/gi
    let m
    while ((m = re.exec(text)) !== null) {
      const funcName = m[1].toLowerCase()
      const line = getLineNumberFromIndex(text, m.index)
      if (!functionDefinitions.has(funcName)) {
        functionDefinitions.set(funcName, [])
      }
      functionDefinitions.get(funcName).push({ file, line })
    }
  }

  // セキュリティ重要関数が複数のマイグレーションで定義されている場合に警告
  for (const [funcName, defs] of functionDefinitions) {
    if (SECURITY_CRITICAL_FUNCTIONS.has(funcName) && defs.length > 1) {
      const locations = defs.map(d => `${d.file}:${d.line}`).join(', ')
      warnings.push(`セキュリティ関数 "${funcName}" が ${defs.length} 回定義されています: ${locations}`)
    }
  }

  return warnings
}

// ===================================================================
// RLS ポリシー危険パターン検出
// ===================================================================
function checkDangerousRlsPatterns() {
  const migrationsDir = path.join(REPO_ROOT, 'supabase', 'migrations')
  if (!isDirectory(migrationsDir)) return []

  const sqlFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  const warnings = []

  const DANGEROUS_SQL_PATTERNS = [
    { name: 'USING (true)', re: /USING\s*\(\s*true\s*\)/gi },
    { name: 'OR TRUE', re: /OR\s+TRUE/gi },
    // is_admin() を org チェックなしで使用（ただし is_admin() AND organization_id = ... は許可）
    {
      name: 'is_admin() without org check in policy',
      re: /CREATE\s+POLICY[^;]+?USING\s*\([^;]*?\bis_admin\(\)[^;]*?\)/gi,
      validate: (match) => {
        // is_admin() AND organization_id = ... パターンは安全
        if (/is_admin\(\)\s+AND\s+organization_id\s*=\s*get_user_organization_id\(\)/i.test(match)) {
          return false // 安全 → 警告不要
        }
        // is_admin() AND ... organization_id ... パターンも安全
        if (/is_admin\(\)\s+AND\s+[^)]*organization_id/i.test(match)) {
          return false
        }
        return true // 警告が必要
      }
    },
  ]

  for (const file of sqlFiles) {
    const text = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    for (const pat of DANGEROUS_SQL_PATTERNS) {
      pat.re.lastIndex = 0
      let m
      while ((m = pat.re.exec(text)) !== null) {
        const shouldWarn = pat.validate ? pat.validate(m[0]) : true
        if (shouldWarn) {
          const line = getLineNumberFromIndex(text, m.index)
          warnings.push(`${file}:${line} — ${pat.name}`)
        }
      }
    }
  }

  return warnings
}

function main() {
  let exitCode = 0

  // forbidden paths
  const forbiddenPathHits = FORBIDDEN_PATHS.filter(isDirectory)
  if (forbiddenPathHits.length > 0) {
    console.error('[SECURITY_GUARDRAILS] Forbidden directories exist:')
    for (const p of forbiddenPathHits) {
      console.error(`- ${path.relative(REPO_ROOT, p)}`)
    }
    exitCode = 1
  }

  // scan files for forbidden patterns
  const files = []
  for (const root of SEARCH_ROOTS) {
    walk(root, files)
  }

  const hits = []
  for (const file of files) {
    let text
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }

    for (const pat of FORBIDDEN_PATTERNS) {
      pat.re.lastIndex = 0
      let m
      while ((m = pat.re.exec(text)) !== null) {
        const line = getLineNumberFromIndex(text, m.index)
        hits.push({
          file,
          line,
          pattern: pat.name,
          snippet: text.slice(m.index, Math.min(text.length, m.index + 120)).split('\n')[0],
        })
      }
    }
  }

  if (hits.length > 0) {
    console.error(`[SECURITY_GUARDRAILS] Forbidden patterns detected: ${hits.length}`)
    for (const h of hits.slice(0, 200)) {
      console.error(
        `- ${path.relative(REPO_ROOT, h.file)}:${h.line} (${h.pattern}) ${h.snippet.trim()}`
      )
    }
    if (hits.length > 200) {
      console.error(`... and ${hits.length - 200} more`)
    }
    exitCode = 1
  }

  // RLS 検証
  const rlsWarnings = checkMigrationRls()
  if (rlsWarnings.length > 0) {
    console.error(`[RLS_CHECK] RLS が有効でないテーブル: ${rlsWarnings.length}`)
    for (const w of rlsWarnings) {
      console.error(`  ⚠️  ${w}`)
    }
    exitCode = 1
  }

  // 危険な RLS パターン検出（警告のみ、CI は止めない）
  const dangerousPatterns = checkDangerousRlsPatterns()
  if (dangerousPatterns.length > 0) {
    console.warn(`[RLS_CHECK] 危険な RLS パターン検出（要確認）: ${dangerousPatterns.length}`)
    for (const w of dangerousPatterns) {
      console.warn(`  ⚠️  ${w}`)
    }
    // 警告のみ: exitCode は変更しない（将来的にブロックに昇格可能）
  }

  // P1-9: セキュリティ関数の上書き検出
  const overwriteWarnings = checkFunctionOverwrite()
  if (overwriteWarnings.length > 0) {
    console.warn(`[FUNC_OVERWRITE] セキュリティ関数の上書き検出: ${overwriteWarnings.length}`)
    for (const w of overwriteWarnings) {
      console.warn(`  ⚠️  ${w}`)
    }
    // 警告のみ: 意図的な上書きもあるため CI は止めない
  }

  if (exitCode === 0) {
    console.log('[SECURITY_GUARDRAILS] OK')
    console.log('[RLS_CHECK] OK')
  }
  process.exit(exitCode)
}

main()

