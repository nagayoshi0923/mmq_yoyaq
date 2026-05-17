import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'
import { requireAuth, requireStaff, requireLicenseAdmin, ApiError, type AuthUser } from './_lib/auth.js'

const ALLOWED_ORIGINS = [
  process.env.ALLOWED_ORIGIN,
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean) as string[]

function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? '*')
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

const REPORT_FIELDS = `
  id,
  scenario_master_id,
  organization_id,
  reported_by,
  performance_date,
  performance_count,
  participant_count,
  venue_name,
  notes,
  status,
  reviewed_by,
  reviewed_at,
  rejection_reason,
  created_at,
  updated_at
`

const REPORT_SELECT_WITH_RELATIONS_MINE = `
  ${REPORT_FIELDS},
  scenario_masters:scenario_master_id (id, title, author),
  reporter:reported_by (id, name),
  reviewer:reviewed_by (id, name)
`

const REPORT_SELECT_WITH_RELATIONS_ALL = `
  ${REPORT_FIELDS},
  scenario_masters:scenario_master_id (id, title, author),
  organizations:organization_id (id, name, slug),
  reporter:reported_by (id, name),
  reviewer:reviewed_by (id, name)
`

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  try {
    const user = await requireAuth(req)

    if (req.method === 'GET') {
      const type = (req.query.type as string | undefined) ?? 'mine'
      if (type === 'mine') return await handleGetMine(res, user)
      if (type === 'all') return await handleGetAll(req, res, user)
      if (type === 'license-summary') return await handleGetLicenseSummary(req, res, user)
      if (type === 'managed-scenarios') return await handleGetManagedScenarios(res, user)
      return res.status(400).json({ error: `unknown type: ${type}` })
    }

    if (req.method === 'POST') {
      return await handleCreate(req, res, user)
    }

    if (req.method === 'PATCH') {
      const action = (req.query.action as string | undefined) ?? 'update'
      const id = req.query.id as string | undefined
      if (!id) return res.status(400).json({ error: 'id クエリパラメータが必要です' })
      if (action === 'approve') return await handleApprove(req, res, user, id)
      if (action === 'reject') return await handleReject(req, res, user, id)
      if (action === 'update') return await handleUpdate(req, res, user, id)
      return res.status(400).json({ error: `unknown action: ${action}` })
    }

    if (req.method === 'DELETE') {
      const id = req.query.id as string | undefined
      if (!id) return res.status(400).json({ error: 'id クエリパラメータが必要です' })
      return await handleDelete(res, user, id)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[external-reports] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}

// 自組織の外部公演報告一覧
async function handleGetMine(res: VercelResponse, user: AuthUser) {
  requireStaff(user)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('external_performance_reports')
    .select(REPORT_SELECT_WITH_RELATIONS_MINE)
    .eq('organization_id', user.orgId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[external-reports:mine] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// 全件取得（license_admin は全組織、その他は自組織のみ）
async function handleGetAll(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  requireStaff(user)

  const status = req.query.status as 'pending' | 'approved' | 'rejected' | undefined
  const startDate = req.query.startDate as string | undefined
  const endDate = req.query.endDate as string | undefined
  const scenarioId = req.query.scenarioId as string | undefined
  const requestedOrgId = req.query.organizationId as string | undefined

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (db as any)
    .from('external_performance_reports')
    .select(REPORT_SELECT_WITH_RELATIONS_ALL)
    .order('created_at', { ascending: false })

  // マルチテナント境界:
  // - license_admin: 全組織を閲覧可能（指定があればそれに絞る）
  // - その他のスタッフ/管理者: 自組織のみ
  if (user.role === 'license_admin') {
    if (requestedOrgId) {
      query = query.eq('organization_id', requestedOrgId)
    }
  } else {
    // 自組織に強制（クライアントの organizationId 指定を無視）
    query = query.eq('organization_id', user.orgId)
  }

  if (status) query = query.eq('status', status)
  if (startDate) query = query.gte('performance_date', startDate)
  if (endDate) query = query.lte('performance_date', endDate)
  if (scenarioId) query = query.eq('scenario_master_id', scenarioId)

  const { data, error } = await query
  if (error) {
    console.error('[external-reports:all] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// ライセンス集計サマリー（license_performance_summary ビュー）
// TODO: ビュー側で組織別フィルタができるか要確認。
// 現状はビューが集計済みなので、license_admin のみ閲覧可とする。
// （旧 RLS では is_license_manager() が必要だったため）
async function handleGetLicenseSummary(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  // license_admin のみアクセス可能（admin も許可した方が業務上望ましいが、
  // 旧挙動は RLS 任せだったため保守的に license_admin に限定）
  // TODO: 業務要件に応じて admin も追加するか検討
  if (user.role !== 'license_admin') {
    return res.status(403).json({ error: 'ライセンス管理者権限が必要です' })
  }

  const authorName = req.query.authorName as string | undefined

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('license_performance_summary')
    .select(
      'scenario_master_id, scenario_title, author, license_amount, internal_performance_count, external_performance_count, total_performance_count, total_license_fee'
    )

  if (error) {
    console.error('[external-reports:summary] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }

  let result = (data ?? []) as Array<{ author: string }>
  if (authorName) {
    result = result.filter((r) => r.author === authorName)
  }
  return res.status(200).json(result)
}

// 管理シナリオ一覧（報告フォーム用）
async function handleGetManagedScenarios(res: VercelResponse, user: AuthUser) {
  requireStaff(user)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('organization_scenarios_with_master')
    .select('id, title, author, license_amount')
    .eq('status', 'available')
    .eq('organization_id', user.orgId)
    .order('title')

  if (error) {
    console.error('[external-reports:managed-scenarios] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// 外部公演報告を作成（自組織として）
async function handleCreate(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  requireStaff(user)
  const body = req.body as {
    scenario_master_id?: string
    reported_by?: string
    performance_date?: string
    performance_count?: number
    participant_count?: number | null
    venue_name?: string | null
    notes?: string | null
  }

  if (!body.scenario_master_id || !body.performance_date || body.performance_count == null) {
    return res.status(400).json({ error: 'scenario_master_id, performance_date, performance_count は必須です' })
  }

  // マルチテナント境界:
  // - organization_id は必ず JWT 経由のユーザ所属組織を使用（フロントから受け取らない）
  // - scenario_master_id が自組織で取り扱い可能かは organization_scenarios_with_master で検証
  //   （ただし license_admin による他組織分の作成は許可しない＝旧挙動と同じ）
  //
  // reported_by はフロントから受け取るが、当該 staff が自組織所属かを最低限検証する
  if (body.reported_by) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: staffRow, error: staffErr } = await (db as any)
      .from('staff')
      .select('id, organization_id')
      .eq('id', body.reported_by)
      .maybeSingle()
    if (staffErr) {
      console.error('[external-reports:create] staff lookup error:', staffErr)
      return res.status(500).json({ error: 'スタッフ情報の取得に失敗しました' })
    }
    if (!staffRow || staffRow.organization_id !== user.orgId) {
      return res.status(403).json({ error: 'reported_by が自組織のスタッフではありません' })
    }
  }

  // scenario_master_id が自組織で扱えるか検証
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: scn, error: scnErr } = await (db as any)
    .from('organization_scenarios_with_master')
    .select('id')
    .eq('id', body.scenario_master_id)
    .eq('organization_id', user.orgId)
    .maybeSingle()
  if (scnErr) {
    console.error('[external-reports:create] scenario lookup error:', scnErr)
    return res.status(500).json({ error: 'シナリオ情報の取得に失敗しました' })
  }
  if (!scn) {
    return res.status(403).json({ error: '指定されたシナリオは自組織で扱えません' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('external_performance_reports')
    .insert({
      scenario_master_id: body.scenario_master_id,
      organization_id: user.orgId, // JWT 経由で必ず上書き
      reported_by: body.reported_by ?? user.userId,
      performance_date: body.performance_date,
      performance_count: body.performance_count,
      participant_count: body.participant_count ?? null,
      venue_name: body.venue_name ?? null,
      notes: body.notes ?? null,
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    console.error('[external-reports:create] DB error:', error)
    return res.status(500).json({ error: '報告の作成に失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
}

// 自組織の pending 報告を更新
async function handleUpdate(req: VercelRequest, res: VercelResponse, user: AuthUser, id: string) {
  requireStaff(user)
  const body = req.body as {
    performance_date?: string
    performance_count?: number
    participant_count?: number | null
    venue_name?: string | null
    notes?: string | null
  }

  // 所属組織を検証してから更新
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: lookupErr } = await (db as any)
    .from('external_performance_reports')
    .select('id, organization_id, status')
    .eq('id', id)
    .maybeSingle()
  if (lookupErr) {
    console.error('[external-reports:update] lookup error:', lookupErr)
    return res.status(500).json({ error: '報告の取得に失敗しました' })
  }
  if (!existing) return res.status(404).json({ error: '報告が見つかりません' })
  if (existing.organization_id !== user.orgId) {
    return res.status(403).json({ error: '他組織の報告は更新できません' })
  }
  if (existing.status !== 'pending') {
    return res.status(409).json({ error: 'pending 状態の報告のみ更新できます' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {}
  if (body.performance_date !== undefined) updates.performance_date = body.performance_date
  if (body.performance_count !== undefined) updates.performance_count = body.performance_count
  if (body.participant_count !== undefined) updates.participant_count = body.participant_count
  if (body.venue_name !== undefined) updates.venue_name = body.venue_name
  if (body.notes !== undefined) updates.notes = body.notes

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('external_performance_reports')
    .update(updates)
    .eq('id', id)
    .eq('status', 'pending')
    .select()
    .single()

  if (error) {
    console.error('[external-reports:update] DB error:', error)
    return res.status(500).json({ error: '報告の更新に失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
}

// 報告を承認（license_admin のみ）
async function handleApprove(req: VercelRequest, res: VercelResponse, user: AuthUser, id: string) {
  requireLicenseAdmin(user)
  const body = req.body as { reviewerId?: string }
  const reviewerId = body.reviewerId ?? user.userId

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('external_performance_reports')
    .update({
      status: 'approved',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[external-reports:approve] DB error:', error)
    return res.status(500).json({ error: '承認に失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
}

// 報告を却下（license_admin のみ）
async function handleReject(req: VercelRequest, res: VercelResponse, user: AuthUser, id: string) {
  requireLicenseAdmin(user)
  const body = req.body as { reviewerId?: string; reason?: string }
  const reviewerId = body.reviewerId ?? user.userId
  const reason = (body.reason ?? '').trim()
  if (!reason) {
    return res.status(400).json({ error: '却下理由 (reason) が必要です' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('external_performance_reports')
    .update({
      status: 'rejected',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[external-reports:reject] DB error:', error)
    return res.status(500).json({ error: '却下に失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
}

// 自組織の pending 報告を削除
async function handleDelete(res: VercelResponse, user: AuthUser, id: string) {
  requireStaff(user)

  // 所属組織を検証
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: lookupErr } = await (db as any)
    .from('external_performance_reports')
    .select('id, organization_id, status')
    .eq('id', id)
    .maybeSingle()
  if (lookupErr) {
    console.error('[external-reports:delete] lookup error:', lookupErr)
    return res.status(500).json({ error: '報告の取得に失敗しました' })
  }
  if (!existing) return res.status(404).json({ error: '報告が見つかりません' })
  if (existing.organization_id !== user.orgId) {
    return res.status(403).json({ error: '他組織の報告は削除できません' })
  }
  if (existing.status !== 'pending') {
    return res.status(409).json({ error: 'pending 状態の報告のみ削除できます' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('external_performance_reports')
    .delete()
    .eq('id', id)
    .eq('status', 'pending')

  if (error) {
    console.error('[external-reports:delete] DB error:', error)
    return res.status(500).json({ error: '削除に失敗しました', detail: error.message })
  }
  return res.status(200).json({ success: true })
}
