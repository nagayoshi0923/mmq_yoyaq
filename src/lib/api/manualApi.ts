/**
 * マニュアルページ・ブロック CRUD API
 *
 * すべてバックエンド API (/api/manuals) 経由で org_id をサーバー側で強制
 */
import { apiClient } from '@/lib/apiClient'
import type { ManualPage, ManualPageWithBlocks, ManualBlock, BlockType, BlockContentMap } from '@/types/manual'

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------
export const manualPageApi = {
  /** 組織のマニュアルページ一覧（ブロックなし） */
  async list(): Promise<ManualPage[]> {
    return apiClient.get<ManualPage[]>('/api/manuals')
  },

  /** ページ1件をブロック込みで取得 */
  async getWithBlocks(pageId: string): Promise<ManualPageWithBlocks> {
    return apiClient.get<ManualPageWithBlocks>(
      `/api/manuals?type=with_blocks&page_id=${encodeURIComponent(pageId)}`
    )
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
    return apiClient.post<ManualPage>('/api/manuals', input)
  },

  /** ページ更新 */
  async update(
    pageId: string,
    input: Partial<{
      title: string
      slug: string
      description: string | null
      category: 'staff' | 'admin'
      icon_name: string
      display_order: number
      is_active: boolean
    }>
  ): Promise<ManualPage> {
    return apiClient.patch<ManualPage>('/api/manuals', { id: pageId, ...input })
  },

  /** ページ削除（ブロックは CASCADE で削除） */
  async delete(pageId: string): Promise<void> {
    await apiClient.delete(`/api/manuals?id=${encodeURIComponent(pageId)}`)
  },

  /** ハードコードページのコンテンツを保存（upsert） */
  async saveHardcodedContent(slug: string, content: unknown): Promise<void> {
    await apiClient.post('/api/manuals?action=save_hardcoded', { slug, content })
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
    return apiClient.post<ManualBlock>('/api/manuals?type=block', input)
  },

  /** ブロック更新 */
  async update<T extends BlockType>(
    blockId: string,
    input: {
      content?: BlockContentMap[T]
      display_order?: number
      block_type?: T
    }
  ): Promise<ManualBlock> {
    return apiClient.patch<ManualBlock>('/api/manuals?type=block', { id: blockId, ...input })
  },

  /** ブロック削除 */
  async delete(blockId: string): Promise<void> {
    await apiClient.delete(
      `/api/manuals?type=block&id=${encodeURIComponent(blockId)}`
    )
  },

  /** ブロック表示順を一括更新 */
  async reorder(items: { id: string; display_order: number }[]): Promise<void> {
    await apiClient.post('/api/manuals?action=reorder_blocks', { items })
  },
}
