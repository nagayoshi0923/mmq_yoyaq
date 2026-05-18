import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'
import { requireAuth, requireStaff, ApiError, type AuthUser } from './_lib/auth.js'

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

// ─── ヘルパ: page_id が自組織のものか検証し、そのページ row を返す ─────
async function assertPageOwnedByOrg(
  pageId: string,
  orgId: string
): Promise<{ id: string; organization_id: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('manual_pages')
    .select('id, organization_id')
    .eq('id', pageId)
    .maybeSingle()
  if (error) throw new ApiError(500, `manual_page 取得失敗: ${error.message}`)
  if (!data) throw new ApiError(404, 'マニュアルページが見つかりません')
  if (data.organization_id !== orgId) {
    throw new ApiError(403, '他組織のマニュアルページは操作できません')
  }
  return data
}

/** block_id が自組織のページに属するか検証 */
async function assertBlockOwnedByOrg(blockId: string, orgId: string): Promise<{ id: string; page_id: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('manual_blocks')
    .select('id, page_id, manual_pages:page_id(organization_id)')
    .eq('id', blockId)
    .maybeSingle()
  if (error) throw new ApiError(500, `manual_block 取得失敗: ${error.message}`)
  if (!data) throw new ApiError(404, 'ブロックが見つかりません')
  const pageOrg = (data.manual_pages as { organization_id?: string } | null)?.organization_id
  if (pageOrg !== orgId) {
    throw new ApiError(403, '他組織のブロックは操作できません')
  }
  return { id: data.id, page_id: data.page_id }
}

// ─── GET ────────────────────────────────────────────────────────────────────
async function handleGet(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const type = req.query.type as string | undefined
  const pageId = req.query.page_id as string | undefined

  if (type === 'with_blocks') {
    if (!pageId) return res.status(400).json({ error: 'page_id が必要です' })
    await assertPageOwnedByOrg(pageId, user.orgId)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: page, error: pageError } = await (db as any)
      .from('manual_pages')
      .select('*')
      .eq('id', pageId)
      .eq('organization_id', user.orgId)
      .single()
    if (pageError) {
      return res.status(500).json({ error: 'ページ取得に失敗', detail: pageError.message })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: blocks, error: blocksError } = await (db as any)
      .from('manual_blocks')
      .select('*')
      .eq('page_id', pageId)
      .order('display_order', { ascending: true })
    if (blocksError) {
      return res.status(500).json({ error: 'ブロック取得に失敗', detail: blocksError.message })
    }

    return res.status(200).json({ ...page, blocks: blocks ?? [] })
  }

  // デフォルト: アクティブな組織のマニュアル一覧
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('manual_pages')
    .select('*')
    .eq('organization_id', user.orgId)
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  if (error) {
    console.error('[manuals] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// ─── POST: page 作成 / block 作成 / hardcoded コンテンツ保存 / block reorder ─
async function handlePost(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const type = (req.query.type ?? req.body?.type) as string | undefined
  const action = (req.query.action ?? req.body?.action) as string | undefined
  const body = req.body ?? {}

  if (type === 'block' || action === 'create_block') {
    const { page_id, block_type, content, display_order } = body as {
      page_id?: string
      block_type?: string
      content?: unknown
      display_order?: number
    }
    if (!page_id || !block_type || display_order === undefined) {
      return res.status(400).json({ error: 'page_id / block_type / display_order が必要です' })
    }
    await assertPageOwnedByOrg(page_id, user.orgId)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('manual_blocks')
      .insert({ page_id, block_type, content: content ?? {}, display_order })
      .select()
      .single()
    if (error) {
      console.error('[manuals] block create error:', error)
      return res.status(500).json({ error: 'ブロック作成に失敗しました', detail: error.message })
    }
    return res.status(200).json(data)
  }

  if (action === 'reorder_blocks') {
    const { items } = body as { items?: { id: string; display_order: number }[] }
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items が必要です' })
    // 各 block の所有検証
    for (const it of items) {
      await assertBlockOwnedByOrg(it.id, user.orgId)
    }
    // 更新（並列ではなく直列で実施しエラー時に途中で止める）
    for (const { id, display_order } of items) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db as any)
        .from('manual_blocks')
        .update({ display_order })
        .eq('id', id)
      if (error) {
        console.error('[manuals] block reorder error:', error)
        return res.status(500).json({ error: 'ブロック並び替えに失敗しました', detail: error.message })
      }
    }
    return res.status(200).json({ ok: true })
  }

  if (action === 'save_hardcoded') {
    const { slug, content } = body as { slug?: string; content?: unknown }
    if (!slug) return res.status(400).json({ error: 'slug が必要です' })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing, error: fetchError } = await (db as any)
      .from('manual_pages')
      .select('id')
      .eq('organization_id', user.orgId)
      .eq('slug', slug)
      .maybeSingle()
    if (fetchError) {
      return res.status(500).json({ error: '既存ページ検索に失敗', detail: fetchError.message })
    }

    if (existing) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db as any)
        .from('manual_pages')
        .update({ page_content: content })
        .eq('id', existing.id)
        .eq('organization_id', user.orgId)
      if (error) {
        return res.status(500).json({ error: '保存に失敗', detail: error.message })
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db as any)
        .from('manual_pages')
        .insert({
          organization_id: user.orgId,
          slug,
          title: slug,
          category: 'staff',
          page_content: content,
        })
      if (error) {
        return res.status(500).json({ error: '作成に失敗', detail: error.message })
      }
    }
    return res.status(200).json({ ok: true })
  }

  // default: page 作成
  const { title, slug, description, category, icon_name, display_order } = body as {
    title?: string
    slug?: string
    description?: string | null
    category?: 'staff' | 'admin'
    icon_name?: string
    display_order?: number
  }
  if (!title || !slug || !category) {
    return res.status(400).json({ error: 'title / slug / category が必要です' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('manual_pages')
    .insert({
      organization_id: user.orgId,
      title,
      slug,
      description: description ?? null,
      category,
      icon_name: icon_name ?? 'FileText',
      display_order: display_order ?? 999,
    })
    .select()
    .single()
  if (error) {
    console.error('[manuals] page create error:', error)
    return res.status(500).json({ error: 'ページ作成に失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
}

// ─── PATCH: page / block 更新 ──────────────────────────────────────────────
async function handlePatch(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const type = (req.query.type ?? req.body?.type) as string | undefined
  const body = req.body ?? {}

  if (type === 'block') {
    const { id, content, display_order, block_type } = body as {
      id?: string
      content?: unknown
      display_order?: number
      block_type?: string
    }
    if (!id) return res.status(400).json({ error: 'id が必要です' })
    await assertBlockOwnedByOrg(id, user.orgId)

    const updates: Record<string, unknown> = {}
    if (content !== undefined) updates.content = content
    if (display_order !== undefined) updates.display_order = display_order
    if (block_type !== undefined) updates.block_type = block_type
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: '更新内容が空です' })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('manual_blocks')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) {
      console.error('[manuals] block update error:', error)
      return res.status(500).json({ error: 'ブロック更新に失敗しました', detail: error.message })
    }
    return res.status(200).json(data)
  }

  // default: page 更新
  const { id, ...rest } = body as { id?: string } & Record<string, unknown>
  if (!id) return res.status(400).json({ error: 'id が必要です' })
  await assertPageOwnedByOrg(id, user.orgId)

  // 更新を許可するキーのみ通す
  const allowed: Record<string, true> = {
    title: true,
    slug: true,
    description: true,
    category: true,
    icon_name: true,
    display_order: true,
    is_active: true,
    page_content: true,
  }
  const updates: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(rest)) {
    if (allowed[k]) updates[k] = v
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: '更新内容が空です' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('manual_pages')
    .update(updates)
    .eq('id', id)
    .eq('organization_id', user.orgId)
    .select()
    .single()
  if (error) {
    console.error('[manuals] page update error:', error)
    return res.status(500).json({ error: 'ページ更新に失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
}

// ─── DELETE: page / block 削除 ──────────────────────────────────────────────
async function handleDelete(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const type = (req.query.type ?? req.body?.type) as string | undefined
  const id = (req.query.id ?? req.body?.id) as string | undefined
  if (!id) return res.status(400).json({ error: 'id が必要です' })

  if (type === 'block') {
    await assertBlockOwnedByOrg(id, user.orgId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any).from('manual_blocks').delete().eq('id', id)
    if (error) {
      console.error('[manuals] block delete error:', error)
      return res.status(500).json({ error: 'ブロック削除に失敗しました', detail: error.message })
    }
    return res.status(200).json({ ok: true })
  }

  // page 削除
  await assertPageOwnedByOrg(id, user.orgId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('manual_pages')
    .delete()
    .eq('id', id)
    .eq('organization_id', user.orgId)
  if (error) {
    console.error('[manuals] page delete error:', error)
    return res.status(500).json({ error: 'ページ削除に失敗しました', detail: error.message })
  }
  return res.status(200).json({ ok: true })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  try {
    const user = await requireAuth(req)
    requireStaff(user)

    if (req.method === 'GET') return await handleGet(req, res, user)
    if (req.method === 'POST') return await handlePost(req, res, user)
    if (req.method === 'PATCH') return await handlePatch(req, res, user)
    if (req.method === 'DELETE') return await handleDelete(req, res, user)

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[manuals] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}
