// @ts-check
/**
 * Resend に残っているメール履歴を email_logs テーブルに backfill するスクリプト
 *
 * 使い方:
 *   RESEND_API_KEY=<Full access key> \
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role> \
 *   node scripts/rescue_resend_emails.mjs
 *
 * 動作:
 *   1. Resend の GET /emails をカーソルページングで全件取得
 *   2. email_logs に provider_message_id が既に存在する分はスキップ
 *   3. 新規分は GET /emails/{id} で本文を取得
 *   4. to_email から customers / users を逆引きして organization_id / customer_id を推定
 *   5. subject から reservation_number / 種別を regex 推定
 *   6. email_logs に insert
 *
 * 安全策:
 *   - dry run モード: DRY_RUN=1 で insert せずレポートだけ出す
 *   - 既存レコードは絶対に変更しない
 *   - 1 ループごとに 200ms sleep（Resend rate limit 配慮）
 */

import { createClient } from '@supabase/supabase-js'

const RESEND_API_KEY            = process.env.RESEND_API_KEY
const SUPABASE_URL              = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN                   = process.env.DRY_RUN === '1'

if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('必要な環境変数が足りません: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ─── Resend API ──────────────────────────────────────────────────────────────

async function fetchResendList(after) {
  const url = new URL('https://api.resend.com/emails')
  url.searchParams.set('limit', '100')
  if (after) url.searchParams.set('after', after)
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  })
  if (!res.ok) throw new Error(`Resend list ${res.status} ${await res.text()}`)
  return res.json()
}

async function fetchResendDetail(id, maxRetry = 4) {
  let delay = 600
  for (let attempt = 0; attempt < maxRetry; attempt++) {
    const res = await fetch(`https://api.resend.com/emails/${id}`, {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    })
    if (res.ok) return res.json()
    if (res.status === 429) {
      await sleep(delay)
      delay *= 2
      continue
    }
    throw new Error(`Resend get ${id} ${res.status}`)
  }
  throw new Error(`Resend get ${id} 429 exhausted`)
}

// ─── 推定ロジック ────────────────────────────────────────────────────────────

const TYPE_RULES = [
  { re: /公演中止|中止のお知らせ/,             type: 'performance_cancellation' },
  { re: /キャンセル待ち|空席.*お知らせ|キャンセル待ち.*繰り上がり/, type: 'waitlist_confirmed' },
  { re: /キャンセル(?!待ち)/,                  type: 'reservation_cancelled' },
  { re: /変更.*完了|予約変更|変更のご確認/,    type: 'reservation_changed' },
  { re: /予約完了|予約確定|ご予約ありがとう|【予約】/, type: 'reservation_confirmed' },
  { re: /公演希望|貸切.*希望|貸切.*リクエスト|貸切.*受付/, type: 'reservation_request' },
  { re: /募集延長/,                            type: 'reservation_request' },
  { re: /リマインド|前日.*お知らせ|当日.*ご案内|公演前日/, type: 'reminder' },
  { re: /\bPIN\b|認証コード|貸切.*PIN/i,       type: 'guest_pin' },
  // メールアドレス確認・パスワードリセットは email_type に該当区分なし → other
  { re: /お問い合わせ/,                        type: 'contact_inquiry' },
  { re: /ライセンス.*レポート/,                type: 'license_report' },
  { re: /スタッフ.*招待|GM.*招待/,             type: 'staff_invitation' },
  { re: /GM.*通知|GM.*確定|GM.*アサイン/,      type: 'gm_notification' },
]

function inferType(subject) {
  for (const r of TYPE_RULES) if (r.re.test(subject)) return r.type
  return 'other'
}

function mapStatus(lastEvent) {
  switch (lastEvent) {
    case 'delivered':         return 'delivered'
    case 'sent':              return 'sent'
    case 'opened':            return 'opened'
    case 'clicked':           return 'clicked'
    case 'bounced':           return 'bounced'
    case 'complained':        return 'complained'
    case 'delivery_delayed':  return 'delivery_delayed'
    case 'failed':            return 'failed'
    default:                  return 'sent'
  }
}

async function lookupCustomer(toEmail) {
  // email_logs.customer_id は users(id) を参照する FK のため、users.id を取得する
  const { data: user } = await supabase
    .from('users')
    .select('id, organization_id, display_name')
    .eq('email', toEmail)
    .limit(1)
    .maybeSingle()
  if (user) {
    // organization_id が NULL でも customers から補完を試みる
    let orgId = user.organization_id
    let name  = user.display_name
    if (!orgId || !name) {
      const { data: customer } = await supabase
        .from('customers')
        .select('organization_id, name')
        .eq('email', toEmail)
        .limit(1)
        .maybeSingle()
      orgId = orgId ?? customer?.organization_id ?? null
      name  = name  ?? customer?.name ?? null
    }
    return { customerId: user.id, organizationId: orgId, name }
  }

  // users に居なくても customers のみのケース（古いデータ）は customer_id を埋めない
  const { data: customer } = await supabase
    .from('customers')
    .select('organization_id, name')
    .eq('email', toEmail)
    .limit(1)
    .maybeSingle()
  if (customer) return { customerId: null, organizationId: customer.organization_id, name: customer.name }

  return { customerId: null, organizationId: null, name: null }
}

async function lookupReservation(subject) {
  // 予約番号フォーマット (例: 260517-N9N9) があるか
  const m = subject.match(/\b\d{6}-[A-Z0-9]{4}\b/)
  if (!m) return null
  const { data } = await supabase
    .from('reservations')
    .select('id, organization_id')
    .eq('reservation_number', m[0])
    .limit(1)
    .maybeSingle()
  return data ?? null
}

// ─── メイン ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`▶︎ ${DRY_RUN ? 'DRY RUN' : 'EXECUTE'} (target: ${SUPABASE_URL})`)

  // Phase 1: Resend から全件 ID 取得
  const all = []
  let after
  let page = 0
  while (true) {
    const res = await fetchResendList(after)
    const items = res?.data ?? []
    all.push(...items)
    page++
    console.log(`  list page ${page}: +${items.length} (total ${all.length}), has_more=${res.has_more}`)
    if (!res.has_more || items.length === 0) break
    after = items[items.length - 1].id
    await sleep(200)
  }
  console.log(`✓ Resend total: ${all.length} emails`)

  if (all.length === 0) {
    console.log('  対象なし、終了')
    return
  }

  // Phase 2: 既存 provider_message_id をチャンク取得
  const existing = new Set()
  const ids = all.map((e) => e.id)
  const CHUNK = 200
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK)
    const { data, error } = await supabase
      .from('email_logs')
      .select('provider_message_id')
      .in('provider_message_id', slice)
    if (error) throw error
    for (const r of data ?? []) existing.add(r.provider_message_id)
  }
  let newOnes = all.filter((e) => !existing.has(e.id))
  console.log(`✓ 既存: ${existing.size}件 / 新規 backfill 対象: ${newOnes.length}件`)

  const LIMIT = Number(process.env.LIMIT || 0)
  if (LIMIT > 0) {
    newOnes = newOnes.slice(0, LIMIT)
    console.log(`  → LIMIT=${LIMIT} 適用、${newOnes.length}件のみ処理`)
  }

  if (newOnes.length === 0) return

  // Phase 3: 新規分について detail + lookup + insert（並列バッチで実行）
  let inserted = 0, skipped = 0, failed = 0
  // Resend rate limit は 2 req/s 程度。concurrency 2 + 500ms sleep で安全側
  const CONCURRENCY = 2
  const BATCH = 50

  async function processOne(e) {
    try {
      const detail = await fetchResendDetail(e.id)
      const toEmail = Array.isArray(detail.to) ? detail.to[0] : (detail.to ?? '')
      const subject = detail.subject ?? ''
      const cust = await lookupCustomer(toEmail)
      const reservation = await lookupReservation(subject)
      const orgId = reservation?.organization_id ?? cust.organizationId
      const status = mapStatus(detail.last_event)
      const createdAt = detail.created_at

      const row = {
        organization_id:     orgId,
        reservation_id:      reservation?.id ?? null,
        customer_id:         cust.customerId,
        email_type:          inferType(subject),
        to_email:            toEmail,
        to_name:             cust.name,
        subject,
        body_html:           detail.html ?? null,
        body_text:           detail.text ?? null,
        provider:            'resend',
        provider_message_id: e.id,
        status,
        sent_at:             createdAt,
        delivered_at:        ['delivered','opened','clicked'].includes(detail.last_event) ? createdAt : null,
        opened_at:           ['opened','clicked'].includes(detail.last_event) ? createdAt : null,
        bounced_at:          detail.last_event === 'bounced' ? createdAt : null,
        complained_at:       detail.last_event === 'complained' ? createdAt : null,
        created_at:          createdAt,
      }

      if (DRY_RUN) {
        skipped++
        console.log(`  [dry] ${e.id} | ${toEmail.padEnd(35)} | ${row.email_type.padEnd(25)} | ${status.padEnd(10)} | org=${(orgId??'-').slice(0,8)} | res=${reservation?.id ? 'Y' : '-'} | ${subject.slice(0,45)}`)
        return null
      }
      return row
    } catch (err) {
      console.warn(`  ❌ ${e.id}:`, err.message)
      failed++
      return null
    }
  }

  for (let i = 0; i < newOnes.length; i += BATCH) {
    const batch = newOnes.slice(i, i + BATCH)
    // 並列で detail+lookup
    const rows = []
    for (let j = 0; j < batch.length; j += CONCURRENCY) {
      const slice = batch.slice(j, j + CONCURRENCY)
      const results = await Promise.all(slice.map(processOne))
      for (const r of results) if (r) rows.push(r)
    }
    // per-row insert（FK 違反等で 1件失敗しても他は通す）
    if (!DRY_RUN && rows.length > 0) {
      for (let k = 0; k < rows.length; k += 10) {
        const slice = rows.slice(k, k + 10)
        const results = await Promise.all(
          slice.map((row) => supabase.from('email_logs').insert(row).select('id').then((r) => r))
        )
        for (let idx = 0; idx < results.length; idx++) {
          const { error } = results[idx]
          if (error) {
            console.warn(`  ❌ insert ${slice[idx].provider_message_id}:`, error.message.slice(0, 120))
            failed++
          } else {
            inserted++
          }
        }
      }
    }
    console.log(`  ${Math.min(i+BATCH, newOnes.length)}/${newOnes.length} processed (inserted: ${inserted}, failed: ${failed})`)
    await sleep(500)
  }

  console.log(`\n=== 結果 ===`)
  console.log(`  total Resend: ${all.length}`)
  console.log(`  既存スキップ: ${existing.size}`)
  console.log(`  新規 inserted: ${inserted}`)
  console.log(`  dry skipped:   ${skipped}`)
  console.log(`  failed:        ${failed}`)
}

main().catch((err) => {
  console.error('💥', err)
  process.exit(1)
})
