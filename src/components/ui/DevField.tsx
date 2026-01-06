/**
 * 開発者向けフィールド表示ユーティリティ
 * license_adminロールでホバー時にテーブル.カラム名を表示
 */

/**
 * 簡易版: data-db属性を返すヘルパー
 * スプレッド演算子で使用可能
 * 
 * @example
 * <span {...devDb('scenarios.title')}>{scenario.title}</span>
 * <Badge {...devDb('scenarios.status')}>{status}</Badge>
 * <div {...devDb('stores.name')}>{store.name}</div>
 */
export function devDb(db: string): { 'data-db': string } {
  return { 'data-db': db }
}

/**
 * 複数フィールドを一括で属性化
 * 
 * @example
 * const attrs = devDbFields('scenarios', ['title', 'status', 'duration'])
 * <span {...attrs.title}>{scenario.title}</span>
 * <span {...attrs.status}>{scenario.status}</span>
 */
export function devDbFields<T extends string>(
  table: string,
  columns: T[]
): Record<T, { 'data-db': string }> {
  return columns.reduce((acc, col) => {
    acc[col] = { 'data-db': `${table}.${col}` }
    return acc
  }, {} as Record<T, { 'data-db': string }>)
}

/**
 * テーブル専用ヘルパーを生成
 * 
 * @example
 * const scenario = createTableHelper('scenarios')
 * <span {...scenario('title')}>{data.title}</span>
 * <span {...scenario('status')}>{data.status}</span>
 */
export function createTableHelper(table: string) {
  return (column: string): { 'data-db': string } => ({
    'data-db': `${table}.${column}`
  })
}
