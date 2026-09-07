#!/usr/bin/env node
/**
 * 公演中止判定 RPC（supabase/rpcs 正規ソース）の退行ガード。
 * 20260409110000 系の既知バグ（>= 1 判定・participants_count 列名）を再導入しない。
 * 前日: 中止は最低開催の半分（v_half）、開催決定は最低開催人数（v_min）。
 * 4時間前: 最低開催人数。満席必須は退行。
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

  if (!/\bv_min\s*:=\s*GREATEST\(/.test(sql)) {
    fail(`${name}: v_min のクランプ（GREATEST で 1 以上・定員以下）が必要`)
  }
  if (!/override_player_count_min/.test(sql)) {
    fail(`${name}: 最低開催人数は override_player_count_min から始まる COALESCE で取得すること`)
  }

  if (name === 'check_performances_four_hours_before.sql') {
    if (!/\bIF\s+v_current\s*>=\s*v_min\s+THEN\b/.test(sql)) {
      fail(`${name}: 開催確定判定は「IF v_current >= v_min THEN」必須（最低開催人数基準）`)
    }
    if (/\bIF\s+v_current\s*>=\s*v_max\s+THEN\b/.test(sql)) {
      fail(`${name}: 満席必須（IF v_current >= v_max THEN）は禁止（最低人数到達でも中止になる退行）`)
    }
    if (/\bIF\s+v_current\s*>=\s*1\s+THEN\b/.test(sql)) {
      fail(`${name}: 「IF v_current >= 1 THEN」は禁止（最低開催人数を無視する退行）`)
    }
  }

  if (name === 'check_performances_day_before.sql') {
    if (!/\bv_half\s*:=\s*GREATEST\(CEIL\(v_min::NUMERIC \/ 2\)/.test(sql)) {
      fail(`${name}: v_half は最低開催（v_min）の半分`)
    }
    if (!/\b(?:IF|ELSIF)\s+v_current\s*>=\s*v_min\s+THEN\b/.test(sql)) {
      fail(`${name}: 開催確定判定は「IF/ELSIF v_current >= v_min THEN」必須（最低開催人数以上で開催決定）`)
    }
    if (!/\bELSIF\s+v_current\s*>=\s*v_half\s+THEN\b/.test(sql)) {
      fail(`${name}: 募集延長分岐（ELSIF v_current >= v_half）が必要`)
    }
    if (!/\bv_result\s*:=\s*'extended'\s*;/.test(sql)) {
      fail(`${name}: 最低開催の半分以上・最低人数未満は extended（募集延長）`)
    }
    if (!/is_recruitment_extended\s*=\s*TRUE/.test(sql)) {
      fail(`${name}: 募集延長時は is_recruitment_extended = TRUE が必要`)
    }
    if (!/\bv_result\s*:=\s*'cancelled'\s*;/.test(sql)) {
      fail(`${name}: 最低開催の半分未満の中止（v_result := 'cancelled'）が必要`)
    }
    if (!/p_dry_run/.test(sql)) {
      fail(`${name}: 21:00予告用の p_dry_run が必要`)
    }
    if (!/IF NOT COALESCE\(p_dry_run/.test(sql)) {
      fail(`${name}: 書き込みは IF NOT COALESCE(p_dry_run で囲むこと（予告で中止しない）`)
    }
    if (!/v_event\.category IS DISTINCT FROM 'open'/.test(sql)) {
      fail(`${name}: open 以外（貸切・GMテスト等）は人数に関係なく開催決定`)
    }
    for (const cat of ['private', 'gmtest', 'testplay', 'offsite', 'venue_rental', 'package', 'mtg']) {
      if (!sql.includes(`'${cat}'`)) {
        fail(`${name}: 中止判断の対象カテゴリに ${cat} が必要`)
      }
    }
  }
}

console.log('[check:cancellation-rpcs] OK')
