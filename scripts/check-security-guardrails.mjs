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

function main() {
  // forbidden paths
  const forbiddenPathHits = FORBIDDEN_PATHS.filter(isDirectory)
  if (forbiddenPathHits.length > 0) {
    console.error('[SECURITY_GUARDRAILS] Forbidden directories exist:')
    for (const p of forbiddenPathHits) {
      console.error(`- ${path.relative(REPO_ROOT, p)}`)
    }
    process.exit(1)
  }

  // scan files
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
    process.exit(1)
  }

  console.log('[SECURITY_GUARDRAILS] OK')
}

main()

