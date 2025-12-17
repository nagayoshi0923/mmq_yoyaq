/**
 * 作者関連API
 * 
 * シナリオ著者の管理および作者ポータル機能を提供
 */
import { supabase } from '../supabase'
import type { Author, AuthorPerformanceReport, AuthorSummary } from '@/types'

// 旧形式の互換性のため
export type { Author }

export const authorApi = {
  // 全作者を取得
  async getAll(): Promise<Author[]> {
    const { data, error } = await supabase
      .from('authors')
      .select('*')
      .order('name', { ascending: true })
    
    if (error) {
      // テーブルが存在しない場合は空配列を返す
      if (error.code === 'PGRST205' || error.code === 'PGRST116') {
        return []
      }
      throw error
    }
    return data || []
  },

  // 作者を名前で取得
  async getByName(name: string): Promise<Author | null> {
    const { data, error } = await supabase
      .from('authors')
      .select('*')
      .eq('name', name)
      .single()
    
    if (error) {
      // テーブルが存在しない場合、またはレコードが見つからない場合はnullを返す
      if (error.code === 'PGRST116' || error.code === 'PGRST205') {
        return null
      }
      throw error
    }
    return data
  },

  // 作者を作成
  async create(author: Omit<Author, 'id' | 'created_at' | 'updated_at'>): Promise<Author> {
    const { data, error } = await supabase
      .from('authors')
      .insert([author])
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // 作者を更新
  async update(id: string, updates: Partial<Omit<Author, 'id' | 'created_at' | 'updated_at'>>): Promise<Author> {
    const { data, error } = await supabase
      .from('authors')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // 名前で更新または作成（upsert）
  async upsertByName(name: string, updates: Partial<Omit<Author, 'id' | 'name' | 'created_at' | 'updated_at'>>): Promise<Author> {
    const existing = await this.getByName(name)
    
    if (existing) {
      return this.update(existing.id, updates)
    } else {
      // テーブルが存在しない場合はエラーを投げる（createでPGRST205が発生する）
      return this.create({
        name,
        ...updates,
        email: updates.email ?? null,
        notes: updates.notes ?? null
      })
    }
  },

  // 作者を削除
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('authors')
      .delete()
      .eq('id', id)
    
    if (error) throw error
  },

  // ================================================
  // 作者ポータル向け機能
  // ================================================

  // ログイン中のユーザーに紐付いた作者情報を取得
  async getCurrentAuthor(): Promise<Author | null> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('authors')
      .select('*')
      .eq('user_id', user.id)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data
  },

  // 作者のシナリオ一覧を取得
  async getAuthorScenarios(authorId: string): Promise<{ id: string; title: string; author: string; play_count: number }[]> {
    const { data: author } = await supabase
      .from('authors')
      .select('name')
      .eq('id', authorId)
      .single()
    
    if (!author) return []

    // author_id または author名で検索
    const { data, error } = await supabase
      .from('scenarios')
      .select('id, title, author, play_count')
      .or(`author_id.eq.${authorId},author.eq.${author.name}`)
      .order('title')
    
    if (error) throw error
    return data || []
  },

  // 作者への公演報告一覧を取得
  async getAuthorReports(authorId: string, options?: {
    status?: 'pending' | 'approved' | 'rejected'
    startDate?: string
    endDate?: string
  }): Promise<AuthorPerformanceReport[]> {
    // author_performance_reports ビューを使用
    let query = supabase
      .from('author_performance_reports')
      .select('*')
      .eq('author_id', authorId)
      .order('reported_at', { ascending: false })
    
    if (options?.status) {
      query = query.eq('report_status', options.status)
    }
    if (options?.startDate) {
      query = query.gte('performance_date', options.startDate)
    }
    if (options?.endDate) {
      query = query.lte('performance_date', options.endDate)
    }

    const { data, error } = await query
    
    if (error) {
      // ビューが存在しない場合は空配列を返す
      if (error.code === 'PGRST204') return []
      throw error
    }
    return data || []
  },

  // 作者のサマリー情報を取得
  async getAuthorSummary(authorId: string): Promise<AuthorSummary> {
    const author = await this.getById(authorId)
    if (!author) throw new Error('Author not found')

    // シナリオ数を取得
    const { count: scenarioCount } = await supabase
      .from('scenarios')
      .select('*', { count: 'exact', head: true })
      .or(`author_id.eq.${authorId},author.eq.${author.name}`)

    // 承認済み報告を取得
    const reports = await this.getAuthorReports(authorId, { status: 'approved' })
    
    // 今月の報告を計算
    const now = new Date()
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    const thisMonthReports = reports.filter(r => r.performance_date >= thisMonthStart)

    // ユニークな組織数を計算
    const uniqueOrgs = new Set(reports.map(r => r.organization_id))

    return {
      author_id: authorId,
      total_scenarios: scenarioCount || 0,
      total_approved_reports: reports.length,
      total_performance_count: reports.reduce((sum, r) => sum + r.performance_count, 0),
      total_license_fee: reports.reduce((sum, r) => sum + r.calculated_license_fee, 0),
      this_month_reports: thisMonthReports.length,
      this_month_license_fee: thisMonthReports.reduce((sum, r) => sum + r.calculated_license_fee, 0),
      organizations_count: uniqueOrgs.size
    }
  },

  // IDで作者を取得
  async getById(id: string): Promise<Author | null> {
    const { data, error } = await supabase
      .from('authors')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data
  },

  // 作者プロフィールを更新
  async updateProfile(id: string, updates: {
    display_name?: string
    bio?: string
    website_url?: string
    twitter_url?: string
    avatar_url?: string
  }): Promise<Author> {
    const { data, error } = await supabase
      .from('authors')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // 作者の通知設定を更新
  async updateNotificationSettings(id: string, settings: {
    email_on_report?: boolean
    email_summary?: 'daily' | 'weekly' | 'monthly' | 'none'
  }): Promise<Author> {
    const { data, error } = await supabase
      .from('authors')
      .update({ notification_settings: settings })
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // 作者アカウントを作成（ユーザー登録と紐付け）
  async registerAuthor(params: {
    name: string
    email: string
    display_name?: string
    bio?: string
  }): Promise<Author> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { data, error } = await supabase
      .from('authors')
      .insert([{
        user_id: user.id,
        name: params.name,
        email: params.email,
        display_name: params.display_name || params.name,
        bio: params.bio,
        is_verified: false,
        is_active: true
      }])
      .select()
      .single()
    
    if (error) throw error
    return data
  }
}

