#!/usr/bin/env node
/**
 * 公演中止判定 RPC（supabase/rpcs 正規ソース）の退行ガード。
 * 20260409110000 系の既知バグ（>= 1 判定・participants_count 列名）を再導入しない。
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const RPCS = path.join(ROOT, 'supabase', 'rpcs')

const FILES = [
  'check_performances_day_before.sql',
  'check_performances_four_hours_before.sql',
]

function fail(msg) {
  console.error(`[check:cancellation-rpcs] ${msg}`)
  process.exit(1)
}

for (const name of FILES) {
  const p = path.join(RPCS, name)
  if (!fs.existsSync(p)) {
    fail(`missing ${p} — 中止判定RPCは supabase/rpcs に置くこと`)
  }
  const sql = fs.readFileSync(p, 'utf8')

  if (sql.includes('participants_count')) {
    fail(`${name}: performance_cancellation_logs には current_participants（participants_count は無効）`)
  }

  if (name === 'check_performances_four_hours_before.sql') {
    if (!/\bIF\s+v_current\s*>=\s*v_max\s+THEN\b/.test(sql)) {
      fail(`${name}: 満席判定は「IF v_current >= v_max THEN」必須（募集延長の4時間前）`)
    }
    if (/\bIF\s+v_current\s*>=\s*1\s+THEN\b/.test(sql)) {
      fail(`${name}: 「IF v_current >= 1 THEN」は禁止（満席でなくても確定してしまう退行）`)
    }
  }

  if (name === 'check_performances_day_before.sql') {
    if (!/\bIF\s+v_current\s*>=\s*v_max\s+THEN\b/.test(sql)) {
      fail(`${name}: 満席分岐（v_current >= v_max）が必要`)
    }
    if (!/\bELSIF\s+v_current\s*>=\s*v_half\s+THEN\b/.test(sql)) {
      fail(`${name}: 過半数延長分岐（ELSIF v_current >= v_half）が必要`)
    }
    if (!/\bv_result\s*:=\s*'cancelled'\s*;/.test(sql)) {
      fail(`${name}: 過半数未満中止（v_result := 'cancelled'）が必要`)
    }
  }
}

console.log('[check:cancellation-rpcs] OK')
