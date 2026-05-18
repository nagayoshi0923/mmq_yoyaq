/**
 * メモ関連API
 *
 * すべてバックエンド API (/api/memos) 経由で org_id をサーバー側で強制
 */
import { apiClient } from '@/lib/apiClient'

interface DailyMemo {
  date: string
  venue_id: string
  memo_text?: string
  organization_id?: string
  stores?: { id: string; name: string; short_name: string } | null
  created_at?: string
  updated_at?: string
}

export const memoApi = {
  // 指定月のメモを取得
  async getByMonth(year: number, month: number, _organizationId?: string): Promise<DailyMemo[]> {
    return apiClient.get<DailyMemo[]>(`/api/memos?year=${year}&month=${month}`)
  },

  // メモを保存（UPSERT）
  async save(date: string, venueId: string, memoText: string) {
    return apiClient.post<DailyMemo[]>('/api/memos', {
      date,
      venue_id: venueId,
      memo_text: memoText,
    })
  },

  // メモを削除（自組織のもののみ）
  async delete(date: string, venueId: string) {
    await apiClient.delete(
      `/api/memos?date=${encodeURIComponent(date)}&venue_id=${encodeURIComponent(venueId)}`
    )
  },
}
