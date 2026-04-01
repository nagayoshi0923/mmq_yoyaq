// @ts-nocheck

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getCorsHeaders,
  errorResponse,
  successResponse,
  sanitizeErrorMessage,
  timingSafeEqualString,
  getServiceRoleKey,
} from '../_shared/security.ts'

// ─── 設定定数 ─────────────────────────────────────────────────────────────

// ラベルは GITHUB_ISSUE_LABELS 環境変数でカンマ区切りにより変更可能
const GITHUB_ISSUE_LABELS: string[] = (
  Deno.env.get('GITHUB_ISSUE_LABELS') ?? 'bug,sentry,production'
)
  .split(',')
  .map((l: string) => l.trim())
  .filter(Boolean)

// 対象 environment（デフォルト: production）
const ALLOWED_ENVIRONMENT: string =
  Deno.env.get('SENTRY_ALLOWED_ENVIRONMENT') ?? 'production'

// ─── 型定義 ───────────────────────────────────────────────────────────────

/**
 * Sentry Alert Rule Webhook の payload（旧形式）
 * https://docs.sentry.io/product/integrations/integration-platform/webhooks/
 */
interface SentryAlertPayload {
  id?: string
  project?: string
  project_name?: string
  culprit?: string
  url?: string
  title?: string
  level?: string
  triggering_rules?: string[]
  event?: {
    event_id?: string
    timestamp?: string
    tags?: Array<[string, string]>
  }
}

/**
 * Sentry ServiceHook / Integration Webhook の payload（新形式）
 * action: "created" | "resolved" | "assigned" | "ignored" など
 */
interface SentryServiceHookPayload {
  action?: string
  data?: {
    issue?: {
      id?: string
      title?: string
      culprit?: string
      status?: string
      level?: string
      count?: string
      userCount?: number
      shortId?: string
      project?: {
        id?: string
        name?: string
        slug?: string
      }
      permalink?: string
    }
    event?: {
      event_id?: string
      timestamp?: string
      tags?: Array<[string, string]>
      environment?: string
    }
  }
  installation?: {
    uuid?: string
  }
}

/** payload を正規化した後の内部表現 */
interface NormalizedSentryEvent {
  sentryIssueId: string
  sentryEventId: string
  sentryProject: string
  sentryEnvironment: string
  title: string
  culprit: string
  level: string
  count: string | null
  userCount: number | null
  sentryUrl: string
  occurredAt: string
}

/** GitHub Issues API のレスポンスから使う最小限のフィールド */
interface GitHubIssueResult {
  number: number
  html_url: string
}

// ─── 環境変数バリデーション ────────────────────────────────────────────────

function getRequiredEnv(name: string): string {
  const val = Deno.env.get(name)
  if (!val) throw new Error(`環境変数 ${name} が未設定です`)
  return val
}

// ─── Sentry HMAC-SHA256 検証 ──────────────────────────────────────────────

/**
 * Sentry Internal Integration が送る sentry-hook-signature ヘッダーを HMAC-SHA256 で検証する。
 *
 * Sentry は rawBody を HMAC-SHA256（Client Secret で署名）した16進数文字列を
 * sentry-hook-signature ヘッダーに付与する。
 *
 * SENTRY_WEBHOOK_SECRET が未設定の場合は警告を出してスキップする（ローカル開発用）。
 * 本番環境では必ず設定すること。
 */
async function verifySentrySignature(req: Request, rawBody: string): Promise<boolean> {
  const clientSecret = Deno.env.get('SENTRY_WEBHOOK_SECRET')
  if (!clientSecret) {
    console.warn('⚠️ SENTRY_WEBHOOK_SECRET 未設定: 署名検証をスキップします（本番では必ず設定してください）')
    return true
  }

  const signature = (req.headers.get('sentry-hook-signature') ?? '').trim()
  if (!signature) {
    console.warn('⚠️ sentry-hook-signature ヘッダーなし: リクエストを拒否します')
    return false
  }

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(clientSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody))
  const computedHex = Array.from(new Uint8Array(mac))
    .map((b: number) => b.toString(16).padStart(2, '0'))
    .join('')

  return timingSafeEqualString(computedHex, signature)
}

// ─── Payload 正規化 ───────────────────────────────────────────────────────

/**
 * Sentry tags 配列または直接指定の文字列から environment を取得する。
 */
function extractEnvironment(
  tags?: Array<[string, string]>,
  directEnv?: string
): string {
  if (directEnv) return directEnv
  if (!tags) return ''
  const envTag = tags.find(([key]) => key === 'environment')
  return envTag?.[1] ?? ''
}

/**
 * Sentry webhook payload を内部形式に正規化する。
 * 旧形式（Alert Rule Webhook）と新形式（ServiceHook/Integration）の両方に対応。
 * 必須フィールド（sentry_issue_id）が取得できない場合は null を返す。
 *
 * 注: "新規 issue 相当" の判定を action === "created" に限定すると、
 *     Sentry のプランやアラートルールの設定によっては動作しないケースがあるため、
 *     ここでは action の判定を行わず、DB 未登録かどうかのみで判定する。
 *     将来的にフィルタリングしたい場合は action フィールドを呼び出し元で参照すること。
 */
function normalizeSentryPayload(
  body: SentryAlertPayload & SentryServiceHookPayload
): NormalizedSentryEvent | null {
  // 新形式: ServiceHook / Integration Webhook
  if (body.data?.issue) {
    const issue = body.data.issue
    const event = body.data.event

    const sentryIssueId = issue.id ?? null
    if (!sentryIssueId) return null

    const environment = extractEnvironment(event?.tags, event?.environment)

    return {
      sentryIssueId,
      sentryEventId: event?.event_id ?? '',
      sentryProject: issue.project?.slug ?? '',
      sentryEnvironment: environment,
      title: issue.title ?? '(no title)',
      culprit: issue.culprit ?? '',
      level: issue.level ?? 'error',
      count: issue.count ?? null,
      userCount: issue.userCount ?? null,
      sentryUrl: issue.permalink ?? '',
      occurredAt: event?.timestamp ?? new Date().toISOString(),
    }
  }

  // 旧形式: Alert Rule Webhook（body.id がトップレベルに存在する）
  if (body.id) {
    const sentryIssueId = String(body.id)
    const event = body.event
    const environment = extractEnvironment(event?.tags)

    return {
      sentryIssueId,
      sentryEventId: event?.event_id ?? '',
      sentryProject: body.project ?? '',
      sentryEnvironment: environment,
      title: body.title ?? '(no title)',
      culprit: body.culprit ?? '',
      level: body.level ?? 'error',
      count: null,
      userCount: null,
      sentryUrl: body.url ?? '',
      occurredAt: event?.timestamp ?? new Date().toISOString(),
    }
  }

  return null
}

// ─── GitHub Issue 生成 ────────────────────────────────────────────────────

/**
 * GitHub Issue の本文を生成する。
 * raw payload は含めない。デバッグに必要な主要項目のみ整形する。
 */
function buildGitHubIssueBody(event: NormalizedSentryEvent): string {
  const rows: Array<[string, string]> = [
    ['Project', `\`${event.sentryProject}\``],
    ['Environment', `\`${event.sentryEnvironment}\``],
    ['Level', `\`${event.level}\``],
    ['Sentry Issue ID', `\`${event.sentryIssueId}\``],
  ]

  if (event.sentryEventId) {
    rows.push(['Sentry Event ID', `\`${event.sentryEventId}\``])
  }
  if (event.culprit) {
    rows.push(['Culprit', `\`${event.culprit}\``])
  }
  if (event.count !== null) {
    rows.push(['発生回数', event.count])
  }
  if (event.userCount !== null) {
    rows.push(['影響ユーザー数', String(event.userCount)])
  }
  rows.push(['発生時刻', event.occurredAt])

  const tableRows = rows.map(([k, v]) => `| **${k}** | ${v} |`).join('\n')

  const lines: string[] = [
    '## Sentry アラート',
    '',
    '| 項目 | 値 |',
    '|------|-----|',
    tableRows,
  ]

  if (event.sentryUrl) {
    lines.push('', '## Sentry リンク', '', `[Sentry Issue を開く](${event.sentryUrl})`)
  }

  lines.push('', '---', '*このIssueはSentry Alertから自動作成されました*')

  return lines.join('\n')
}

/**
 * GitHub Issues API で Issue を作成する。
 * エラー時はトークンをログに出さずに throw する。
 */
async function createGitHubIssue(
  event: NormalizedSentryEvent,
  githubToken: string,
  owner: string,
  repo: string
): Promise<GitHubIssueResult> {
  const title = `[Sentry] ${event.title}`
  const body = buildGitHubIssueBody(event)

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'mmq-sentry-to-github/1.0',
      },
      body: JSON.stringify({ title, body, labels: GITHUB_ISSUE_LABELS }),
    }
  )

  if (!response.ok) {
    // レスポンス本文（エラー理由）はログに出すが、トークンは含まれないため安全
    const text = await response.text().catch(() => '')
    console.error(`❌ GitHub API エラー: status=${response.status}, body=${text.slice(0, 300)}`)
    throw new Error(`GitHub API エラー: ${response.status}`)
  }

  const data = await response.json()
  return { number: data.number, html_url: data.html_url }
}

// ─── DB 操作 ──────────────────────────────────────────────────────────────

/**
 * sentry_issue_id に対応する既存レコードを取得する。
 * レコードがなければ null、エラー時は throw する。
 */
async function findExistingMapping(
  supabase: ReturnType<typeof createClient>,
  sentryIssueId: string
): Promise<{ github_issue_number: number; github_issue_url: string } | null> {
  const { data, error } = await supabase
    .from('sentry_github_issues')
    .select('github_issue_number, github_issue_url')
    .eq('sentry_issue_id', sentryIssueId)
    .maybeSingle()

  if (error) {
    console.error('❌ DB 検索エラー:', error.message)
    throw new Error('DB検索に失敗しました')
  }
  return data
}

/**
 * Sentry Issue と GitHub Issue の対応関係を DB に永続化する。
 * レースコンディションによる unique 制約違反（23505）は警告扱いで継続する。
 */
async function saveMappingToDb(
  supabase: ReturnType<typeof createClient>,
  event: NormalizedSentryEvent,
  githubResult: GitHubIssueResult,
  githubRepo: string
): Promise<void> {
  const { error } = await supabase.from('sentry_github_issues').insert({
    sentry_issue_id: event.sentryIssueId,
    sentry_event_id: event.sentryEventId || null,
    sentry_project: event.sentryProject,
    sentry_environment: event.sentryEnvironment,
    github_issue_number: githubResult.number,
    github_issue_url: githubResult.html_url,
    github_repo: githubRepo,
  })

  if (error) {
    if (error.code === '23505') {
      // 同時リクエストによるレースコンディション — 片方が先に挿入済みなので問題なし
      console.warn('⚠️ DB保存: 重複レコード検出（レースコンディション）、スキップ')
      return
    }
    console.error('❌ DB 保存エラー:', error.message)
    throw new Error('DB保存に失敗しました')
  }
}

// ─── メインハンドラ ───────────────────────────────────────────────────────

serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  // 1. OPTIONS プリフライト
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // 2. POST のみ許可
  if (req.method !== 'POST') {
    return errorResponse('Method Not Allowed', 405, corsHeaders)
  }

  try {
    // 3. raw body をテキストで先読み（HMAC 検証に必要）
    let rawBodyText: string
    try {
      rawBodyText = await req.text()
    } catch {
      return errorResponse('payload の読み取りに失敗しました', 400, corsHeaders)
    }

    // 4. HMAC-SHA256 署名検証（Sentry Internal Integration の sentry-hook-signature ヘッダー）
    const isValid = await verifySentrySignature(req, rawBodyText)
    if (!isValid) {
      console.warn('⚠️ 署名検証失敗: リクエストを拒否します')
      return errorResponse('Unauthorized', 401, corsHeaders)
    }

    // 5. 必須環境変数の取得（未設定なら即座に 500）
    const githubToken = getRequiredEnv('GITHUB_TOKEN')
    const githubOwner = getRequiredEnv('GITHUB_OWNER')
    const githubRepo = getRequiredEnv('GITHUB_REPO')

    // 6. payload parse
    let rawBody: unknown
    try {
      rawBody = JSON.parse(rawBodyText)
    } catch {
      return errorResponse('payload が不正です', 400, corsHeaders)
    }

    // 7. payload 正規化
    const event = normalizeSentryPayload(
      rawBody as SentryAlertPayload & SentryServiceHookPayload
    )
    if (!event) {
      console.warn('⚠️ payload を認識できませんでした（必須フィールド不足）')
      // 400 にすると Sentry がリトライし続けるため、認識不能 payload は 200 でスキップ
      return successResponse({ skipped: true, reason: 'payload_unrecognized' }, corsHeaders)
    }

    console.log(
      `📨 Sentry webhook 受信: project=${event.sentryProject}, issueId=${event.sentryIssueId}, env=${event.sentryEnvironment}`
    )

    // 8. environment フィルタ
    if (event.sentryEnvironment !== ALLOWED_ENVIRONMENT) {
      console.log(
        `⏩ environment スキップ: ${event.sentryEnvironment} (対象: ${ALLOWED_ENVIRONMENT})`
      )
      return successResponse({ skipped: true, reason: 'environment_not_target' }, corsHeaders)
    }

    // 9. Supabase クライアント初期化（service role）
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getServiceRoleKey()
    )

    // 10. 重複チェック（DB）
    const existing = await findExistingMapping(supabase, event.sentryIssueId)
    if (existing) {
      console.log(`⏩ 既存 GitHub Issue あり: #${existing.github_issue_number}、スキップ`)
      return successResponse(
        {
          skipped: true,
          reason: 'already_exists',
          github_issue_number: existing.github_issue_number,
          github_issue_url: existing.github_issue_url,
        },
        corsHeaders
      )
    }

    // 11. GitHub Issue 作成
    let githubResult: GitHubIssueResult
    try {
      githubResult = await createGitHubIssue(event, githubToken, githubOwner, githubRepo)
    } catch (githubError: unknown) {
      const msg = githubError instanceof Error ? githubError.message : '不明なエラー'
      console.error('❌ GitHub Issue 作成失敗:', msg)
      // GitHub API エラーは 500 で返す（Sentry がリトライを試みられるように）
      return errorResponse('GitHub Issue の作成に失敗しました', 500, corsHeaders)
    }

    console.log(`✅ GitHub Issue 作成: #${githubResult.number}`)

    // 12. DB に対応関係を保存
    await saveMappingToDb(
      supabase,
      event,
      githubResult,
      `${githubOwner}/${githubRepo}`
    )

    return successResponse(
      {
        created: true,
        github_issue_number: githubResult.number,
        github_issue_url: githubResult.html_url,
      },
      corsHeaders
    )
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '不明なエラー'
    console.error('❌ 予期しないエラー:', msg)
    return errorResponse(
      sanitizeErrorMessage(error, '処理中にエラーが発生しました'),
      500,
      corsHeaders
    )
  }
})
