/**
 * 承認画面の「申込者の変更履歴」（主催者の引き継ぎ、マイページ改修 段階 3）の 1 行の組み立て。
 * Supabase に触れない純粋な関数（テストで Supabase の接続設定を読まないよう、フックから分けた）。
 */
export interface ApplicantChange {
  id: string
  reservation_id: string
  responded_at: string
  from_name: string
  to_name: string
}

export interface ApplicantChangeRow {
  id: string
  reservation_id: string | null
  responded_at: string | null
  previous_customer: { customer_name?: string | null; display_name?: string | null } | null
  accepted_contact: { name?: string | null } | null
}

export function toApplicantChange(row: ApplicantChangeRow): ApplicantChange | null {
  if (!row.reservation_id || !row.responded_at) return null
  return {
    id: row.id,
    reservation_id: row.reservation_id,
    responded_at: row.responded_at,
    from_name: row.previous_customer?.customer_name || row.previous_customer?.display_name || '不明',
    to_name: row.accepted_contact?.name || '不明',
  }
}
