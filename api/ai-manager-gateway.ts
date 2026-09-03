import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { db, getMissingEnvError } from './_lib/db.js'
import {
  createAiManagerDirectReadPlan,
  createAiManagerFingerprint,
  parseAllowedOperations,
  tokenHashMatches,
  validateAiManagerRequest,
  type AiManagerOperation,
} from './_lib/aiManagerGateway.js'

type ServiceSession = {
  accessToken: string
  userId: string
  expiresAtMs: number
}

let cachedSession: ServiceSession | null = null

class GatewayError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message)
    this.name = 'GatewayError'
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  let requestId: string | null = null
  try {
    const envError = getMissingEnvError()
    if (envError || !db) throw new GatewayError(503, 'DATABASE_UNAVAILABLE', `環境変数が未設定です: ${envError}`)

    const token = bearerToken(req)
    const expectedHash = process.env.AI_MANAGER_GATEWAY_TOKEN_SHA256
    if (!token || !expectedHash || !tokenHashMatches(token, expectedHash)) {
      throw new GatewayError(401, 'AI_MANAGER_TOKEN_INVALID', 'AI Manager認証に失敗しました')
    }

    const operationId = header(req, 'x-ai-manager-operation')
    const allowedOperations = parseAllowedOperations(process.env.AI_MANAGER_ALLOWED_OPERATIONS)
    const validation = validateAiManagerRequest({
      operationId,
      method: req.method ?? '',
      query: req.query,
      body: req.body ?? null,
      allowedOperations,
    })
    if (!validation.operation || validation.errors.length > 0) {
      throw new GatewayError(403, 'AI_MANAGER_OPERATION_DENIED', validation.errors.join(';') || '操作は許可されていません')
    }
    const operation = validation.operation
    const organizationId = requiredEnv('AI_MANAGER_ORGANIZATION_ID')

    if (operation.write) {
      const approvalId = header(req, 'x-ai-manager-approval-id')
      const idempotencyKey = header(req, 'idempotency-key')
      const suppliedFingerprint = header(req, 'x-ai-manager-fingerprint')
      const fingerprint = createAiManagerFingerprint({ operationId, query: req.query, body: req.body ?? null })
      if (!approvalId) throw new GatewayError(400, 'APPROVAL_ID_REQUIRED', '書き込みには承認番号が必要です')
      if (!idempotencyKey) throw new GatewayError(400, 'IDEMPOTENCY_KEY_REQUIRED', '書き込みには冪等性キーが必要です')
      if (!suppliedFingerprint || suppliedFingerprint !== fingerprint) {
        throw new GatewayError(409, 'FINGERPRINT_MISMATCH', '承認した内容と実行内容が一致しません')
      }
      requestId = await reserveWrite({
        organizationId,
        operationId,
        approvalId,
        idempotencyKey,
        fingerprint,
      })
    }

    const session = await getServiceSession(organizationId)
    const directReadPlan = createAiManagerDirectReadPlan({
      operation,
      organizationId,
      query: req.query,
    })
    if (directReadPlan) {
      const data = await executeDirectRead(directReadPlan)
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).json(data)
    }
    const targetUrl = buildTargetUrl(req, operation)
    const upstream = await fetch(targetUrl, {
      method: operation.method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
        ...(operation.write ? { 'Content-Type': 'application/json' } : {}),
      },
      body: operation.write ? JSON.stringify(req.body ?? {}) : undefined,
    })
    const responseBytes = Buffer.from(await upstream.arrayBuffer())
    const contentType = upstream.headers.get('content-type') ?? 'application/json; charset=utf-8'

    if (requestId) {
      await finishWrite(requestId, upstream.ok ? 'succeeded' : 'failed', upstream.status)
    }
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'no-store')
    return res.status(upstream.status).send(responseBytes)
  } catch (error) {
    const gatewayError = error instanceof GatewayError
      ? error
      : new GatewayError(500, 'AI_MANAGER_GATEWAY_ERROR', 'AI Manager接続でサーバーエラーが発生しました')
    if (requestId) await finishWrite(requestId, 'failed', gatewayError.status, gatewayError.code).catch(() => undefined)
    if (!(error instanceof GatewayError)) console.error('[ai-manager-gateway] unexpected error:', error)
    return res.status(gatewayError.status).json({ error: gatewayError.message, code: gatewayError.code })
  }
}

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'null')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', [
    'Authorization', 'Content-Type', 'Idempotency-Key', 'X-AI-Manager-Operation',
    'X-AI-Manager-Approval-Id', 'X-AI-Manager-Fingerprint',
  ].join(', '))
  res.setHeader('Access-Control-Allow-Credentials', 'false')
}

function bearerToken(req: VercelRequest): string {
  const authorization = header(req, 'authorization')
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
}

function header(req: VercelRequest, name: string): string {
  const value = req.headers[name]
  return Array.isArray(value) ? String(value[0] ?? '').trim() : String(value ?? '').trim()
}

function requiredEnv(name: string): string {
  const value = String(process.env[name] ?? '').trim()
  if (!value) throw new GatewayError(503, 'AI_MANAGER_CONFIGURATION_MISSING', `${name}が未設定です`)
  return value
}

async function getServiceSession(expectedOrganizationId: string): Promise<ServiceSession> {
  if (cachedSession && cachedSession.expiresAtMs > Date.now() + 60_000) return cachedSession
  if (!db) throw new GatewayError(503, 'DATABASE_UNAVAILABLE', 'DB接続がありません')

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !publicKey) {
    throw new GatewayError(503, 'SERVICE_AUTH_CONFIGURATION_MISSING', 'サービス認証用のSupabase設定がありません')
  }
  const email = requiredEnv('AI_MANAGER_SERVICE_EMAIL')
  const password = requiredEnv('AI_MANAGER_SERVICE_PASSWORD')
  const authClient = createClient(supabaseUrl, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await authClient.auth.signInWithPassword({ email, password })
  if (error || !data.session || !data.user) {
    throw new GatewayError(503, 'SERVICE_AUTH_FAILED', 'MMQサービスアカウントの認証に失敗しました')
  }

  const { data: profile, error: profileError } = await db
    .from('users')
    .select('organization_id, role')
    .eq('id', data.user.id)
    .single()
  if (profileError || !profile || profile.organization_id !== expectedOrganizationId) {
    throw new GatewayError(403, 'SERVICE_ACCOUNT_ORGANIZATION_MISMATCH', 'サービスアカウントの所属組織が一致しません')
  }
  if (!['admin', 'staff', 'license_admin'].includes(String(profile.role))) {
    throw new GatewayError(403, 'SERVICE_ACCOUNT_ROLE_INVALID', 'サービスアカウントにスタッフ権限がありません')
  }

  cachedSession = {
    accessToken: data.session.access_token,
    userId: data.user.id,
    expiresAtMs: Date.now() + (Number(data.session.expires_in ?? 3600) * 1000),
  }
  return cachedSession
}

function buildTargetUrl(req: VercelRequest, operation: AiManagerOperation): URL {
  if (!operation.pathname) {
    throw new GatewayError(500, 'AI_MANAGER_OPERATION_CONFIGURATION_INVALID', '内部API接続先が未設定です')
  }
  const configured = String(process.env.AI_MANAGER_INTERNAL_BASE_URL ?? '').trim()
  let baseUrl = configured
  if (!baseUrl) {
    const host = header(req, 'x-forwarded-host') || header(req, 'host')
    if (!host || !/^[a-zA-Z0-9.:-]+$/.test(host)) {
      throw new GatewayError(503, 'INTERNAL_BASE_URL_UNAVAILABLE', '内部API接続先を解決できません')
    }
    const protocol = host.startsWith('localhost:') || host.startsWith('127.0.0.1:') ? 'http' : 'https'
    baseUrl = `${protocol}://${host}`
  }
  const target = new URL(operation.pathname, baseUrl)
  for (const [key, raw] of Object.entries(req.query)) {
    for (const value of Array.isArray(raw) ? raw : [raw]) {
      if (value !== undefined && value !== null) target.searchParams.append(key, String(value))
    }
  }
  return target
}

async function executeDirectRead(plan: ReturnType<typeof createAiManagerDirectReadPlan>): Promise<unknown[]> {
  if (!db || !plan) throw new GatewayError(503, 'DATABASE_UNAVAILABLE', 'DB接続がありません')
  // gateway は service role を使うため、RLS任せにせず plan に organization_id を必須注入する。
  const rows: unknown[] = []
  for (let from = 0; from < plan.maxRows; from += plan.pageSize) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (db as any)
      .from(plan.table)
      .select(plan.select)
    for (const filter of plan.filters) query = query.eq(filter.column, filter.value)
    const to = Math.min(from + plan.pageSize, plan.maxRows) - 1
    const { data, error } = await query
      .order(plan.orderBy)
      .range(from, to)
    if (error) {
      console.error('[ai-manager-gateway] direct read error:', {
        table: plan.table,
        code: error.code,
      })
      throw new GatewayError(502, 'AI_MANAGER_DIRECT_READ_FAILED', 'MMQデータの読み取りに失敗しました')
    }
    const page = data ?? []
    rows.push(...page)
    if (page.length < plan.pageSize) break
  }
  return rows
}

async function reserveWrite(input: {
  organizationId: string
  operationId: string
  approvalId: string
  idempotencyKey: string
  fingerprint: string
}): Promise<string> {
  if (!db) throw new GatewayError(503, 'DATABASE_UNAVAILABLE', 'DB接続がありません')
  const { data, error } = await db.rpc('reserve_ai_manager_gateway_write', {
    p_organization_id: input.organizationId,
    p_operation_id: input.operationId,
    p_approval_id: input.approvalId,
    p_idempotency_key: input.idempotencyKey,
    p_fingerprint: input.fingerprint,
  })
  if (error) {
    console.error('[ai-manager-gateway] idempotency reserve error:', error)
    throw new GatewayError(503, 'IDEMPOTENCY_STORE_UNAVAILABLE', '二重実行防止台帳を利用できません')
  }
  const result = Array.isArray(data) ? data[0] : data
  const status = String(result?.reservation_status ?? '')
  if (status === 'RESERVED' && result?.request_id) return String(result.request_id)
  const messages: Record<string, string> = {
    IDEMPOTENCY_KEY_CONFLICT: '同じ冪等性キーが別の内容に使われています',
    DUPLICATE_WRITE_BLOCKED: '同じ書き込みは既に受け付け済みです',
    APPROVAL_NOT_FOUND: '承認台帳に承認番号がありません',
    APPROVAL_MISMATCH: '承認した操作または内容と一致しません',
    APPROVAL_REVOKED: '承認は取り消されています',
    APPROVAL_EXPIRED: '承認の有効期限が切れています',
    APPROVAL_ALREADY_CONSUMED: '承認は既に使用済みです',
  }
  throw new GatewayError(409, status || 'WRITE_RESERVATION_FAILED', messages[status] ?? '書き込み実行枠を確保できません')
}

async function finishWrite(requestId: string, status: 'succeeded' | 'failed', responseStatus: number, errorCode: string | null = null) {
  if (!db) return
  const { error } = await db
    .from('ai_manager_gateway_requests')
    .update({
      request_status: status,
      response_status: responseStatus,
      error_code: errorCode,
      completed_at: new Date().toISOString(),
    })
    .eq('id', requestId)
  if (error) console.error('[ai-manager-gateway] audit completion error:', error)
}
