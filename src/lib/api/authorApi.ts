/**
 * 作者ポータルAPI（メールアドレスベース）
 * 
 * 設計方針:
 * - 作者は自分で登録しない
 * - ログイン中のユーザーのメールアドレスに紐づく報告を取得
 * - 同じメールアドレス宛の全報告が見れる
 */
import { logger } from '@/utils/logger'
import { supabase } from '../supabase'
import type { Author, AuthorPerformanceReport, AuthorSummary } from '@/types'

// 旧形式の互換性のため
export type { Author }

// NOTE: Supabase の型推論（select parser）の都合で、select 文字列は literal に寄せる
const AUTHOR_SELECT_FIELDS = 'id, name, email, notes, created_at, updated_at' as const
const AUTHOR_PERFORMANCE_REPORT_SELECT_FIELDS =
  'author_email, author_name, scenario_id, scenario_title, organization_id, organization_name, report_id, performance_date, performance_count, participant_count, venue_name, report_status, reported_at, license_amount, calculated_license_fee' as const
const AUTHOR_SUMMARY_SELECT_FIELDS =
  'author_email, total_scenarios, total_approved_reports, total_performance_count, total_license_fee, organizations_count' as const

export const authorApi = {
  // ================================================
  // 旧形式の互換性（authors テーブル用）
  // ================================================
  
  // 全作者を取得
  async getAll(): Promise<Author[]> {
    const { data, error } = await supabase
      .from('authors')
      .select(AUTHOR_SELECT_FIELDS)
      .order('name', { ascending: true })
    
    if (error) {
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
      .select(AUTHOR_SELECT_FIELDS)
      .eq('name', name)
      .single()
    
    if (error) {
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
  // 作者ポータル向け機能（メールアドレスベース）
  // ================================================

  // ログイン中のユーザーのメールアドレスを取得
  async getCurrentUserEmail(): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser()
    return user?.email ?? null
  },

  // 作者のシナリオ一覧を取得（メールアドレスベース）
  async getAuthorScenariosByEmail(email: string): Promise<{ id: string; title: string; author: string; author_email: string | null; play_count: number }[]> {
    const { data, error } = await supabase
      .from('scenarios')
      .select('id, title, author, author_email, play_count')
      .eq('author_email', email)
      .order('title')
    
    if (error) {
      // author_email カラムが存在しない場合は空配列を返す
      if (error.code === 'PGRST204' || error.message?.includes('author_email')) {
        logger.warn('author_email カラムが存在しません。マイグレーション007を実行してください。')
        return []
      }
      throw error
    }
    return data || []
  },

  // 作者への公演報告一覧を取得（メールアドレスベース）
  async getReportsByEmail(email: string, options?: {
    status?: 'pending' | 'approved' | 'rejected'
    startDate?: string
    endDate?: string
  }): Promise<AuthorPerformanceReport[]> {
    // author_performance_reports ビューを使用
    let query = supabase
      .from('author_performance_reports')
      .select(AUTHOR_PERFORMANCE_REPORT_SELECT_FIELDS)
      .eq('author_email', email)
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
      if (error.code === 'PGRST204' || error.code === '42P01') return []
      throw error
    }
    return data || []
  },

  // 作者のサマリー情報を取得（メールアドレスベース）
  async getSummaryByEmail(email: string): Promise<AuthorSummary> {
    // author_summary ビューを使用
    const { data, error } = await supabase
      .from('author_summary')
      .select(AUTHOR_SUMMARY_SELECT_FIELDS)
      .eq('author_email', email)
      .single()
    
    if (error) {
      // ビューが存在しない、またはデータがない場合はデフォルト値を返す
      if (error.code === 'PGRST116' || error.code === '42P01') {
        return {
          author_email: email,
          total_scenarios: 0,
          total_approved_reports: 0,
          total_performance_count: 0,
          total_license_fee: 0,
          organizations_count: 0
        }
      }
      throw error
    }
    
    return {
      author_email: data.author_email,
      total_scenarios: data.total_scenarios || 0,
      total_approved_reports: data.total_approved_reports || 0,
      total_performance_count: data.total_performance_count || 0,
      total_license_fee: data.total_license_fee || 0,
      organizations_count: data.organizations_count || 0
    }
  },

  // ログイン中ユーザーの作者ダッシュボードデータを取得
  async getCurrentAuthorDashboard(): Promise<{
    email: string
    summary: AuthorSummary
    reports: AuthorPerformanceReport[]
    scenarios: { id: string; title: string; author: string; author_email: string | null; play_count: number }[]
  } | null> {
    const email = await this.getCurrentUserEmail()
    if (!email) return null

    // 各API呼び出しを個別にエラーハンドリング（ビューが未作成でも動作）
    let summary: AuthorSummary = {
      author_email: email,
      total_scenarios: 0,
      total_approved_reports: 0,
      total_performance_count: 0,
      total_license_fee: 0,
      organizations_count: 0
    }
    let reports: AuthorPerformanceReport[] = []
    let scenarios: { id: string; title: string; author: string; author_email: string | null; play_count: number }[] = []

    // シナリオ一覧は scenarios テーブルから直接取得（確実に動作）
    try {
      scenarios = await this.getAuthorScenariosByEmail(email)
      // summary の total_scenarios を更新
      summary.total_scenarios = scenarios.length
    } catch (e) {
      logger.warn('シナリオ取得エラー:', e)
    }

    // 報告一覧（ビューが必要）
    try {
      reports = await this.getReportsByEmail(email)
    } catch (e) {
      logger.warn('報告取得エラー (ビュー未作成の可能性):', e)
    }

    // サマリー（ビューが必要）
    try {
      const summaryData = await this.getSummaryByEmail(email)
      summary = summaryData
    } catch (e) {
      logger.warn('サマリー取得エラー (ビュー未作成の可能性):', e)
    }

    return { email, summary, reports, scenarios }
  }
}
