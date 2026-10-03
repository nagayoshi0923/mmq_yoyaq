/**
 * API共通の型定義
 */

// 候補日時の型定義
export interface CandidateDateTime {
  order: number
  date: string
  startTime?: string
  endTime?: string
  status?: 'confirmed' | 'pending' | 'rejected'
}

// GM空き状況レスポンスの型定義
export interface GMAvailabilityResponse {
  response_status: 'available' | 'unavailable'
  staff?: {
    name: string
  }
}

// ページネーション用のレスポンス型
export interface PaginatedResponse<T> {
  data: T[]
  count: number
  hasMore: boolean
}

