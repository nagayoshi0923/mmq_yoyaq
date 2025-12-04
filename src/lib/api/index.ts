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

// 以下は旧api.tsからの再エクスポート（段階的に分割予定）
export { staffApi, scheduleApi, memoApi, salesApi } from '../api'

