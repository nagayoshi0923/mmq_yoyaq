/**
 * 型定義のバレル（re-export）
 *
 * 実体はドメイン別ファイルにある。既存の `@/types` import はそのまま動く。
 * 新しい型は対応するドメインファイルに追加すること。
 */
export * from './organization'
export * from './license'
export * from './store'
export * from './staff'
export * from './scenario'
export * from './scheduleEvent'
export * from './user'
export * from './sales'
export * from './customer'
export * from './reservation'
export * from './kit'
export * from './coupon'
export * from './privateGroup'
export * from './survey'
export * from './blog'
