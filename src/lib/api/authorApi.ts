/**
 * 作者ポータル / 作者マスタ API
 *
 * 設計方針:
 *   - 直接 supabase クライアントを叩かず、バックエンド API (/api/authors) 経由で操作する
 *   - organization_id は authors テーブルに存在しない（全組織共有マスタ）
 *   - サーバ側で requireStaff により参照・更新権限を保証
 *   - 旧 RPC 経由実装（get_all_authors / get_author_by_name / upsert_author）と
 *     互換のレスポンス形を維持する
 */
import { apiClient } from '@/lib/apiClient'
import { logger } from '@/utils/logger'
import type { Author, AuthorPerformanceReport, AuthorSummary } from '@/types'

// 旧形式の互換性のため
export type { Author }

export const authorApi = {
  // ================================================
  // 作者テーブル操作
  // ================================================

  // 全作者を取得
  async getAll(): Promise<Author[]> {
    try {
      return await apiClient.get<Author[]>('/api/authors?type=list')
    } catch (error) {
      logger.warn('authors:list error:', error)
      return []
    }
  },

  // 作者を名前で取得
  async getByName(name: string): Promise<Author | null> {
    try {
      return await apiClient.get<Author | null>(
        `/api/authors?type=by-name&name=${encodeURIComponent(name)}`
      )
    } catch (error) {
      logger.warn('authors:by-name error:', error)
      return null
    }
  },

  // 作者を作成
  async create(author: Omit<Author, 'id' | 'created_at' | 'updated_at'>): Promise<Author> {
    return this.upsertByName(author.name, {
      email: author.email,
      notes: author.notes,
    })
  },

  // 作者を更新
  async update(
    id: string,
    updates: Partial<Omit<Author, 'id' | 'created_at' | 'updated_at'>>
  ): Promise<Author> {
    return await apiClient.patch<Author>(`/api/authors?type=update`, {
      id,
      email: updates.email ?? null,
      notes: updates.notes ?? null,
      license_organization_name: updates.license_organization_name ?? null,
    })
  },

  // 名前で更新または作成（upsert）
  async upsertByName(
    name: string,
    updates: Partial<Omit<Author, 'id' | 'name' | 'created_at' | 'updated_at'>>
  ): Promise<Author> {
    return await apiClient.post<Author>('/api/authors?type=upsert', {
      name,
      email: updates.email ?? null,
      notes: updates.notes ?? null,
      license_organization_name: updates.license_organization_name ?? null,
    })
  },

  // 作者のライセンス組織名（会社名）を設定する専用メソッド
  async setOrganizationName(
    authorName: string,
    organizationName: string,
    memo?: string | null
  ): Promise<void> {
    // memo が undefined の場合はサーバ側で既存メモを保持する
    const body: Record<string, unknown> = {
      authorName,
      organizationName,
    }
    if (memo !== undefined) body.memo = memo
    await apiClient.patch('/api/authors?type=set-org-name', body)
  },

  // メール送信済みを記録する
  async markEmailSent(authorName: string, year: number, month: number): Promise<void> {
    await apiClient.patch('/api/authors?type=mark-email-sent', {
      authorName,
      year,
      month,
    })
  },

  // 作者を削除
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/api/authors?id=${encodeURIComponent(id)}`)
  },

  // ================================================
  // 作者ポータル向け機能（メールアドレスベース）
  // ================================================

  // ログイン中のユーザーのメールアドレスを取得
  async getCurrentUserEmail(): Promise<string | null> {
    try {
      const result = await apiClient.get<{ email: string | null }>(
        '/api/authors?type=current-email'
      )
      return result?.email ?? null
    } catch (error) {
      logger.warn('authors:current-email error:', error)
      return null
    }
  },

  // 作者のシナリオ一覧を取得（メールアドレスベース）
  async getAuthorScenariosByEmail(
    email: string
  ): Promise<
    { id: string; title: string; author: string; author_email: string | null; play_count: number }[]
  > {
    try {
      return await apiClient.get(
        `/api/authors?type=scenarios-by-email&email=${encodeURIComponent(email)}`
      )
    } catch (error) {
      logger.warn('authors:scenarios-by-email error:', error)
      return []
    }
  },

  // 作者への公演報告一覧を取得（メールアドレスベース）
  async getReportsByEmail(
    email: string,
    options?: {
      status?: 'pending' | 'approved' | 'rejected'
      startDate?: string
      endDate?: string
    }
  ): Promise<AuthorPerformanceReport[]> {
    const params = new URLSearchParams()
    params.set('type', 'reports-by-email')
    params.set('email', email)
    if (options?.status) params.set('status', options.status)
    if (options?.startDate) params.set('startDate', options.startDate)
    if (options?.endDate) params.set('endDate', options.endDate)

    try {
      return await apiClient.get<AuthorPerformanceReport[]>(
        `/api/authors?${params.toString()}`
      )
    } catch (error) {
      logger.warn('authors:reports-by-email error:', error)
      return []
    }
  },

  // 作者のサマリー情報を取得（メールアドレスベース）
  async getSummaryByEmail(email: string): Promise<AuthorSummary> {
    try {
      return await apiClient.get<AuthorSummary>(
        `/api/authors?type=summary-by-email&email=${encodeURIComponent(email)}`
      )
    } catch (error) {
      logger.warn('authors:summary-by-email error:', error)
      return {
        author_email: email,
        total_scenarios: 0,
        total_approved_reports: 0,
        total_performance_count: 0,
        total_license_fee: 0,
        organizations_count: 0,
      }
    }
  },

  // ログイン中ユーザーの作者ダッシュボードデータを取得
  async getCurrentAuthorDashboard(): Promise<{
    email: string
    summary: AuthorSummary
    reports: AuthorPerformanceReport[]
    scenarios: {
      id: string
      title: string
      author: string
      author_email: string | null
      play_count: number
    }[]
  } | null> {
    try {
      return await apiClient.get('/api/authors?type=dashboard')
    } catch (error) {
      logger.warn('authors:dashboard error:', error)
      return null
    }
  },
}
