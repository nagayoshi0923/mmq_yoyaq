/**
 * API モジュール（後方互換性維持用）
 * 
 * 新規コードでは src/lib/api/ からの直接インポートを推奨
 */

// 分割済みAPIを再エクスポート（後方互換性維持）
export { storeApi } from './api/storeApi'
export { authorApi, type Author } from './api/authorApi'
export { scenarioApi } from './api/scenarioApi'
export { staffApi } from './api/staffApi'
export { memoApi } from './api/memoApi'
export { salesApi } from './api/salesApi'
export { scheduleApi } from './api/scheduleApi'

// 型定義の再エクスポート
export type { CandidateDateTime, GMAvailabilityResponse, PaginatedResponse } from './api/types'
export type { ScheduleEvent } from './api/types'
