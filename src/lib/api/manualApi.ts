/**
 * マニュアルページ・ブロック CRUD API
 */
import { supabase } from '../supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import type { ManualPage, ManualPageWithBlocks, ManualBlock, BlockType, BlockContentMap } from '@/types/manual'

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------
export const manualPageApi = {
  /** 組織のマニュアルページ一覧（ブロックなし） */
  async list(): Promise<ManualPage[]> {
    const orgId = await getCurrentOrganizationId()
    const { data, error } = await supabase
      .from('manual_pages')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
    if (error) throw error
    return data as ManualPage[]
  },

  /** ページ1件をブロック込みで取得 */
  async getWithBlocks(pageId: string): Promise<ManualPageWithBlocks> {
    const { data: page, error: pageError } = await supabase
      .from('manual_pages')
      .select('*')
      .eq('id', pageId)
      .single()
    if (pageError) throw pageError

    const { data: blocks, error: blocksError } = await supabase
      .from('manual_blocks')
      .select('*')
      .eq('page_id', pageId)
      .order('display_order', { ascending: true })
    if (blocksError) throw blocksError

    return { ...(page as ManualPage), blocks: (blocks ?? []) as ManualBlock[] }
  },

  /** ページ新規作成 */
  async create(input: {
    title: string
    slug: string
    description?: string
    category: 'staff' | 'admin'
    icon_name?: string
    display_order?: number
  }): Promise<ManualPage> {
    const orgId = await getCurrentOrganizationId()
    const { data, error } = await supabase
      .from('manual_pages')
      .insert({
        organization_id: orgId,
        title: input.title,
        slug: input.slug,
        description: input.description ?? null,
        category: input.category,
        icon_name: input.icon_name ?? 'FileText',
        display_order: input.display_order ?? 999,
      })
      .select()
      .single()
    if (error) throw error
    return data as ManualPage
  },

  /** ページ更新 */
  async update(pageId: string, input: Partial<{
    title: string
    slug: string
    description: string | null
    category: 'staff' | 'admin'
    icon_name: string
    display_order: number
    is_active: boolean
  }>): Promise<ManualPage> {
    const { data, error } = await supabase
      .from('manual_pages')
      .update(input)
      .eq('id', pageId)
      .select()
      .single()
    if (error) throw error
    return data as ManualPage
  },

  /** ページ削除（ブロックは CASCADE で削除） */
  async delete(pageId: string): Promise<void> {
    const { error } = await supabase
      .from('manual_pages')
      .delete()
      .eq('id', pageId)
    if (error) throw error
  },

  /** ハードコードページのコンテンツを保存（upsert） */
  async saveHardcodedContent(slug: string, content: unknown): Promise<void> {
    const orgId = await getCurrentOrganizationId()
    const { data: existing } = await supabase
      .from('manual_pages')
      .select('id')
      .eq('organization_id', orgId)
      .eq('slug', slug)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('manual_pages')
        .update({ page_content: content })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('manual_pages')
        .insert({
          organization_id: orgId,
          slug,
          title: slug,
          category: 'staff',
          page_content: content,
        })
    }
  },
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------
export const manualBlockApi = {
  /** ブロック追加 */
  async create<T extends BlockType>(input: {
    page_id: string
    block_type: T
    content: BlockContentMap[T]
    display_order: number
  }): Promise<ManualBlock> {
    const { data, error } = await supabase
      .from('manual_blocks')
      .insert({
        page_id: input.page_id,
        block_type: input.block_type,
        content: input.content,
        display_order: input.display_order,
      })
      .select()
      .single()
    if (error) throw error
    return data as ManualBlock
  },

  /** ブロック更新 */
  async update<T extends BlockType>(blockId: string, input: {
    content?: BlockContentMap[T]
    display_order?: number
    block_type?: T
  }): Promise<ManualBlock> {
    const { data, error } = await supabase
      .from('manual_blocks')
      .update(input)
      .eq('id', blockId)
      .select()
      .single()
    if (error) throw error
    return data as ManualBlock
  },

  /** ブロック削除 */
  async delete(blockId: string): Promise<void> {
    const { error } = await supabase
      .from('manual_blocks')
      .delete()
      .eq('id', blockId)
    if (error) throw error
  },

  /** ブロック表示順を一括更新 */
  async reorder(items: { id: string; display_order: number }[]): Promise<void> {
    await Promise.all(
      items.map(({ id, display_order }) =>
        supabase
          .from('manual_blocks')
          .update({ display_order })
          .eq('id', id)
      )
    )
  },
}
