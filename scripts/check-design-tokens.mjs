#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const REPO_ROOT = process.cwd()
const BASELINE_PATH = path.join(REPO_ROOT, 'scripts', 'design-token-baseline.json')
const SEARCH_ROOTS = [path.join(REPO_ROOT, 'src')]
const FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css'])
const IGNORE_DIR_NAMES = new Set(['node_modules', 'dist', 'build', '.git'])

const PATTERNS = [
  { key: 'textGray', label: 'text-gray-', re: /text-gray-/g },
  { key: 'arbitraryTextSize', label: 'text-[', re: /text-\[/g },
  { key: 'inlineBorderRadius', label: 'style={{ borderRadius', re: /style=\{\{\s*borderRadius/g },
  { key: 'bareRounded', label: 'bare rounded', re: /\brounded(?=[\s"'])/g },
]

function walk(dir, out) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') || IGNORE_DIR_NAMES.has(entry.name)) continue

    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, out)
      continue
    }

    if (FILE_EXTENSIONS.has(path.extname(entry.name))) out.push(fullPath)
  }
}

function countPatterns() {
  const files = []
  for (const root of SEARCH_ROOTS) walk(root, files)

  const counts = Object.fromEntries(PATTERNS.map(({ key }) => [key, 0]))
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    for (const { key, re } of PATTERNS) {
      counts[key] += (source.match(re) ?? []).length
    }
  }
  return counts
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
}

function writeBaseline(counts) {
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(counts, null, 2)}\n`)
}

const current = countPatterns()
const baseline = readBaseline()

if (!baseline) {
  writeBaseline(current)
  console.log('✅ デザインガード: ベースラインを作成しました')
  process.exit(0)
}

const violations = PATTERNS
  .map(({ key, label }) => ({
    key,
    label,
    baseline: baseline[key] ?? 0,
    current: current[key] ?? 0,
  }))
  .filter(({ current: currentCount, baseline: baselineCount }) => currentCount > baselineCount)

if (violations.length > 0) {
  console.error('❌ デザインガード: 禁止対象パターンの出現数が増えています\n')
  for (const violation of violations) {
    console.error(
      `  ${violation.label}: baseline=${violation.baseline}, current=${violation.current}`
    )
  }
  console.error('\n減少は許可されます。新規コードではセマンティックトークンや規約化された radius を使ってください。')
  process.exit(1)
}

writeBaseline(current)
console.log('✅ デザインガード: 禁止対象パターンの出現数は増えていません')
