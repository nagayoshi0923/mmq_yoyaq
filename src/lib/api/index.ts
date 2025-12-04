/**
 * API モジュール
 * 
 * 各APIを個別ファイルから再エクスポート
 */

// 共通型
export * from './types'

// 各API
export { storeApi } from './storeApi'
export { authorApi, type Author } from './authorApi'
export { scenarioApi } from './scenarioApi'
export { staffApi } from './staffApi'
export { memoApi } from './memoApi'
export { salesApi } from './salesApi'

// scheduleApiは大きいため、旧api.tsに残す（段階的に分割予定）
export { scheduleApi } from '../api'

