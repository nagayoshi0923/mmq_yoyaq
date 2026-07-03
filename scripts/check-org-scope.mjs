#!/usr/bin/env node
/**
 * org_scope ガード（クライアント側 organization_id 直フィルタの増加防止）
 *
 * マルチテナント境界はサーバ側 (/api/*) で強制するのが正。クライアント (src/) から
 * `.eq('organization_id', ...)` で直接フィルタするコードは org_scope API 化の後退であり、
 * 数を増やさないことを CI で担保する（既存分はベースラインとして許容）。
 *
 * - src/**\/*.{ts,tsx} を走査し `.eq('organization_id'` / `.eq("organization_id"` の出現数を数える
 * - 実測 > ベースライン → exit 1（増えたファイルの内訳を出す）
 * - 実測 < ベースライン → ベースラインを更新（自動 commit はしない・design-tokens と同じ挙動）
 *
 * api/ 配下はサーバ側の正規の場所なので対象外（走査ルートは src のみ）。
 * 参照: docs/BACKLOG.md M5/M6・org_scope API 化ロードマップ
 */
import fs from 'node:fs'
import path from 'node:path'

const REPO_ROOT = process.cwd()
const BASELINE_PATH = path.join(REPO_ROOT, 'scripts', 'org-scope-baseline.json')
const SEARCH_ROOTS = [path.join(REPO_ROOT, 'src')]
const FILE_EXTENSIONS = new Set(['.ts', '.tsx'])
const IGNORE_DIR_NAMES = new Set(['node_modules', 'dist', 'build', '.git'])

// .eq('organization_id' と .eq("organization_id" の両クォートを数える
const PATTERN = /\.eq\(\s*['"]organization_id['"]/g

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

function countByFile() {
  const files = []
  for (const root of SEARCH_ROOTS) walk(root, files)

  const perFile = []
  let total = 0
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    const matches = source.match(PATTERN)
    const count = matches ? matches.length : 0
    if (count > 0) {
      perFile.push({ file: path.relative(REPO_ROOT, file), count })
      total += count
    }
  }
  perFile.sort((a, b) => b.count - a.count)
  return { total, perFile }
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
}

function writeBaseline(total) {
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify({ eqOrganizationId: total }, null, 2)}\n`)
}

const { total: current, perFile } = countByFile()
const baseline = readBaseline()

if (!baseline) {
  writeBaseline(current)
  console.log(`✅ org_scope ガード: ベースラインを作成しました（eqOrganizationId=${current}）`)
  process.exit(0)
}

const baselineCount = baseline.eqOrganizationId ?? 0

if (current > baselineCount) {
  console.error('❌ org_scope ガード: クライアント側 organization_id 直フィルタが増えています\n')
  console.error(`  .eq('organization_id'): baseline=${baselineCount}, current=${current}\n`)
  console.error('  現在の内訳（src/ の出現数上位）:')
  for (const { file, count } of perFile) {
    console.error(`    ${count}  ${file}`)
  }
  console.error(
    '\nクライアントから organization_id 直フィルタを増やさない。/api/* 経由にする' +
      '（docs/BACKLOG.md M5/M6・org_scope ロードマップ参照）。'
  )
  console.error('減少は許可されます。')
  process.exit(1)
}

if (current < baselineCount) {
  writeBaseline(current)
  console.log(
    `✅ org_scope ガード: 直フィルタが減りました（${baselineCount} → ${current}）。` +
      'ベースラインを更新しました。scripts/org-scope-baseline.json の変更をコミットしてください。'
  )
  process.exit(0)
}

console.log(`✅ org_scope ガード: クライアント側 organization_id 直フィルタは増えていません（${current}）`)
