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
  'check_performances_with_recruitment_deadlines.sql',
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

  // 本番の最低開催人数基準を検証する。定員は上限であり開催人数とは別。
  if (!sql.includes('v_min > v_max') || !/v_min\s*:=\s*GREATEST/.test(sql)) fail(`${name}: 最低開催人数を1以上・定員以下に制約すること`)

  if (name !== 'check_performances_day_before.sql') {
    if (!sql.includes("public.get_performance_judgment_deadline(")) fail(`${name}: 最終判断時刻は継承設定から解決すること`)
    if (!/\bIF\s+v_current\s*>=\s*v_min\s+THEN\b/.test(sql)) {
      fail(`${name}: 開催判定は「IF v_current >= v_min THEN」必須（設定された最低開催人数）`)
    }
    if (/\bIF\s+v_current\s*>=\s*1\s+THEN\b/.test(sql)) {
      fail(`${name}: 「IF v_current >= 1 THEN」は禁止（最低開催人数未満でも確定してしまう退行）`)
    }
  }

  if (name === 'check_performances_day_before.sql') {
    if (!/\b(?:IF|ELSIF)\s+v_current\s*>=\s*v_min\s+THEN\b/.test(sql)) {
      fail(`${name}: 最低開催人数の分岐（v_current >= v_min）が必要`)
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
