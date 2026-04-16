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
import type { RpcGetAuthorByNameParams, RpcUpsertAuthorParams } from '@/lib/rpcTypes'
import type { Author, AuthorPerformanceReport, AuthorSummary } from '@/types'

// 旧形式の互換性のため
export type { Author }

// NOTE: Supabase の型推論（select parser）の都合で、select 文字列は literal に寄せる
const AUTHOR_SELECT_FIELDS = 'id, name, email, notes, created_at, updated_at' as const

// ============================================================
// notes フィールドへの license_organization_name エンコード
// PostgRESTスキーマキャッシュが更新されないため、新規カラムを
// 直接使えない。notes に JSON で格納して回避する暫定実装。
// 形式: {"__org__":"会社名","memo":"振込先情報..."} または プレーンテキスト（旧形式）
// ============================================================
const ORG_NOTES_KEY = '__org__'
const SENT_YM_KEY = '__sent_ym__'

function parseAuthorNotes(rawNotes: string | null | undefined): { orgName: string | null; memo: string | null; sentYm: string | null } {
  if (!rawNotes) return { orgName: null, memo: null, sentYm: null }
  try {
    const parsed = JSON.parse(rawNotes)
    if (parsed && typeof parsed === 'object' && ORG_NOTES_KEY in parsed) {
      return {
        orgName: (parsed[ORG_NOTES_KEY] as string) || null,
        memo: (parsed.memo as string) || null,
        sentYm: (parsed[SENT_YM_KEY] as string) || null,
      }
    }
  } catch { /* 非JSON = 旧来のプレーンテキスト */ }
  return { orgName: null, memo: rawNotes, sentYm: null }
}

function encodeAuthorNotes(orgName: string | null, memo: string | null, sentYm?: string | null): string | null {
  if (!orgName && !memo && !sentYm) return null
  if (!orgName && !sentYm) return memo  // org名もsentYmもない場合はプレーンテキストのまま維持
  return JSON.stringify({
    [ORG_NOTES_KEY]: orgName || '',
    memo: memo || '',
    ...(sentYm ? { [SENT_YM_KEY]: sentYm } : {}),
  })
}

/** RPC/DBから返された生のauthorデータを Author 型に変換（notesデコード込み） */
function decodeAuthor(raw: Record<string, unknown>): Author {
  const { orgName, memo, sentYm } = parseAuthorNotes(raw.notes as string | null)
  return {
    id: raw.id as string,
    name: raw.name as string,
    email: raw.email as string | null ?? null,
    // license_organization_name は notes から復元（カラムがキャッシュにあればそちらも使う）
    license_organization_name: orgName ?? (raw.license_organization_name as string | null) ?? null,
    notes: memo,
    last_email_sent_ym: sentYm,
    created_at: raw.created_at as string,
    updated_at: raw.updated_at as string,
  }
}
const AUTHOR_PERFORMANCE_REPORT_SELECT_FIELDS =
  'author_email, author_name, scenario_master_id, scenario_title, organization_id, organization_name, report_id, performance_date, performance_count, participant_count, venue_name, report_status, reported_at, license_amount, calculated_license_fee' as const
const AUTHOR_SUMMARY_SELECT_FIELDS =
  'author_email, total_scenarios, total_approved_reports, total_performance_count, total_license_fee, organizations_count' as const

export const authorApi = {
  // ================================================
  // 作者テーブル操作（RPC関数経由でRLSをバイパス）
  // ================================================
  
  // 全作者を取得
  async getAll(): Promise<Author[]> {
    const { data, error } = await supabase.rpc('get_all_authors')

    if (error) {
      logger.warn('get_all_authors error:', error)
      return []
    }

    // RPC関数はJSONB配列を返す。notesをデコードして license_organization_name を復元
    if (Array.isArray(data)) {
      return (data as Record<string, unknown>[]).map(decodeAuthor)
    }
    return []
  },

  // 作者を名前で取得
  async getByName(name: string): Promise<Author | null> {
    const getAuthorParams: RpcGetAuthorByNameParams = { p_name: name }
    const { data, error } = await supabase.rpc('get_author_by_name', getAuthorParams)

    if (error) {
      logger.warn('get_author_by_name error:', error)
      return null
    }

    // RPC関数は { found: boolean, ...author } を返す
    if (data && data.found) {
      return decodeAuthor(data as Record<string, unknown>)
    }
    return null
  },

  // 作者を作成
  async create(author: Omit<Author, 'id' | 'created_at' | 'updated_at'>): Promise<Author> {
    return this.upsertByName(author.name, {
      email: author.email,
      notes: author.notes
    })
  },

  // 作者を更新
  async update(id: string, updates: Partial<Omit<Author, 'id' | 'created_at' | 'updated_at'>>): Promise<Author> {
    // idから名前を取得して更新（RPC関数はname指定）
    const { data, error } = await supabase
      .from('authors')
      .select('name')
      .eq('id', id)
      .single()
    
    if (error || !data) {
      throw new Error('Author not found')
    }
    
    return this.upsertByName(data.name, updates)
  },

  // 名前で更新または作成（upsert）- RPC関数を使用
  async upsertByName(name: string, updates: Partial<Omit<Author, 'id' | 'name' | 'created_at' | 'updated_at'>>): Promise<Author> {
    const upsertAuthorParams: RpcUpsertAuthorParams = {
      p_name: name,
      p_email: updates.email ?? null,
      p_notes: updates.notes ?? null,
      p_license_organization_name: updates.license_organization_name ?? null
    }
    const { data, error } = await supabase.rpc('upsert_author', upsertAuthorParams)
    
    if (error) {
      logger.error('upsert_author error:', error)
      throw error
    }
    
    if (!data?.success) {
      throw new Error(data?.error || 'Failed to upsert author')
    }
    
    // 更新後のデータを取得して返す
    const author = await this.getByName(name)
    if (!author) {
      throw new Error('Failed to retrieve updated author')
    }
    return author
  },

  // 作者のライセンス組織名（会社名）を設定する専用メソッド
  // license_organization_name カラムの代わりに notes フィールドにエンコードして保存
  async setOrganizationName(authorName: string, organizationName: string, memo?: string | null): Promise<void> {
    // memo が undefined の場合は既存のメモを保持
    let currentMemo = memo
    let currentSentYm: string | null = null
    if (memo === undefined) {
      const current = await this.getByName(authorName)
      currentMemo = current?.notes ?? null
      currentSentYm = current?.last_email_sent_ym ?? null
    }

    const encodedNotes = encodeAuthorNotes(organizationName, currentMemo ?? null, currentSentYm)

    const { error } = await supabase
      .from('authors')
      .update({ notes: encodedNotes })
      .eq('name', authorName)

    if (error) {
      logger.error('authors update (setOrganizationName) error:', error)
      throw error
    }
  },

  // メール送信済みを記録する（notesのJSONに __sent_ym__ として保存）
  async markEmailSent(authorName: string, year: number, month: number): Promise<void> {
    const sentYm = `${year}-${String(month).padStart(2, '0')}`
    const current = await this.getByName(authorName)
    const encodedNotes = encodeAuthorNotes(
      current?.license_organization_name ?? null,
      current?.notes ?? null,
      sentYm
    )

    const { error } = await supabase
      .from('authors')
      .update({ notes: encodedNotes })
      .eq('name', authorName)

    if (error) {
      logger.error('authors update (markEmailSent) error:', error)
      throw error
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
    // scenario_masters から作者のシナリオを取得
    const { data: masters, error: mastersError } = await supabase
      .from('scenario_masters')
      .select('id, title, author, author_email')
      .eq('author_email', email)
      .order('title')
    
    if (mastersError) {
      if (mastersError.code === 'PGRST204' || mastersError.message?.includes('author_email')) {
        logger.warn('author_email カラムが存在しません')
        return []
      }
      throw mastersError
    }
    
    if (!masters || masters.length === 0) return []
    
    // organization_scenarios から play_count を集計
    const masterIds = masters.map(m => m.id)
    const { data: orgScenarios } = await supabase
      .from('organization_scenarios')
      .select('scenario_master_id, play_count')
      .in('scenario_master_id', masterIds)
    
    const playCountMap = new Map<string, number>()
    orgScenarios?.forEach(os => {
      const current = playCountMap.get(os.scenario_master_id) || 0
      playCountMap.set(os.scenario_master_id, current + (os.play_count || 0))
    })
    
    return masters.map(m => ({
      id: m.id,
      title: m.title,
      author: m.author || '',
      author_email: m.author_email,
      play_count: playCountMap.get(m.id) || 0
    }))
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
