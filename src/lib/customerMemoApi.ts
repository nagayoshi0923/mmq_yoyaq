/**
 * 顧客単位の社内専用メモ＋顧客ミニ台帳（来店/遅刻/欠席集計）の API。
 *
 * ・メモは customer_memos テーブル（(customer_id, organization_id) で1件、Step4）。
 *   - 読み取り: RLS（自組織 かつ is_staff_or_admin()）で保護された直 SELECT。
 *     UNIQUE(customer_id, organization_id) ＋ RLS の自組織絞りで、見える行は最大1件。
 *   - 書き込み: upsert_customer_memo RPC（Step5）。org_id はサーバー側導出、created_by は初回保持。
 *   ※ 顧客ロール・匿名には RLS / RPC ガードで一切見せない（社内専用）。
 * ・ミニ台帳は reservations を customer_id で集計（RLS で自組織にスコープされる＝この組織での履歴）。
 */
import { supabase } from './supabase'
import { logger } from '@/utils/logger'

export interface CustomerVisitStats {
  /** 来店回数（status = checked_in） */
  visitCount: number
  /** 遅刻回数（status = checked_in かつ arrived_late） */
  lateCount: number
  /** 欠席回数（status = no_show） */
  noShowCount: number
}

export const EMPTY_VISIT_STATS: CustomerVisitStats = {
  visitCount: 0,
  lateCount: 0,
  noShowCount: 0,
}

export const customerMemoApi = {
  /** 自組織の社内メモを取得（無ければ空文字）。RLS で他組織・顧客ロールには見えない。 */
  async getMemo(customerId: string): Promise<string> {
    const { data, error } = await supabase
      .from('customer_memos')
      .select('memo')
      .eq('customer_id', customerId)
      .maybeSingle()
    if (error) {
      logger.warn('customerMemoApi.getMemo failed:', error)
      return ''
    }
    return data?.memo ?? ''
  },

  /** 社内メモを upsert（自組織分）。RPC が org_id をサーバー側導出し created_by を保持する。 */
  async saveMemo(customerId: string, memo: string): Promise<void> {
    const { error } = await supabase.rpc('upsert_customer_memo', {
      p_customer_id: customerId,
      p_memo: memo,
    })
    if (error) throw error
  },

  /** 顧客ミニ台帳: この組織での 来店/遅刻/欠席 回数。1クエリで取得しクライアント集計。 */
  async getVisitStats(customerId: string): Promise<CustomerVisitStats> {
    const { data, error } = await supabase
      .from('reservations')
      .select('status, arrived_late')
      .eq('customer_id', customerId)
      .in('status', ['checked_in', 'no_show'])
    if (error) {
      logger.warn('customerMemoApi.getVisitStats failed:', error)
      return { ...EMPTY_VISIT_STATS }
    }
    const stats: CustomerVisitStats = { visitCount: 0, lateCount: 0, noShowCount: 0 }
    for (const r of data ?? []) {
      if (r.status === 'checked_in') {
        stats.visitCount += 1
        if (r.arrived_late) stats.lateCount += 1
      } else if (r.status === 'no_show') {
        stats.noShowCount += 1
      }
    }
    return stats
  },
}
