import { ReactNode, memo } from 'react'

export interface Column<T> {
  /**
   * 列のキー
   */
  key: string
  /**
   * 列のヘッダーラベル
   */
  label: string
  /**
   * 列の幅（Tailwindクラス）
   */
  width: string
  /**
   * ソート可能か
   */
  sortable?: boolean
  /**
   * セルのレンダリング関数
   */
  render: (item: T) => ReactNode
  /**
   * ヘッダーのカスタムレンダリング（オプション）
   */
  renderHeader?: () => ReactNode
  /**
   * ヘッダーのクラス名
   */
  headerClassName?: string
  /**
   * セルのクラス名
   */
  cellClassName?: string
}

export interface DataTableProps<T> {
  /**
   * 表示するデータ
   */
  data: T[]
  /**
   * 列定義
   */
  columns: Column<T>[]
  /**
   * 行のキーを取得する関数
   */
  getRowKey: (item: T) => string
  /**
   * ソート状態
   */
  sortState?: {
    field: string
    direction: 'asc' | 'desc'
  }
  /**
   * ソート変更ハンドラ
   */
  onSort?: (field: string) => void
  /**
   * データがない場合のメッセージ
   */
  emptyMessage?: string
  /**
   * ローディング中か
   */
  loading?: boolean
}

/**
 * DataTable - 汎用テーブルコンポーネント
 * 
 * ScenarioManagement のテーブルレイアウトをベースにした共通テーブル
 * 
 * @example
 * ```tsx
 * const columns: Column<Scenario>[] = [
 *   {
 *     key: 'title',
 *     label: 'タイトル',
 *     width: 'w-40',
 *     sortable: true,
 *     render: (item) => <p>{item.title}</p>
 *   }
 * ]
 * 
 * <DataTable
 *   data={scenarios}
 *   columns={columns}
 *   getRowKey={(item) => item.id}
 *   sortState={sortState}
 *   onSort={handleSort}
 * />
 * ```
 */
export const DataTable = memo(function DataTable<T>({
  data,
  columns,
  getRowKey,
  sortState,
  onSort,
  emptyMessage = 'データがありません',
  loading = false
}: DataTableProps<T>) {
  const handleHeaderClick = (column: Column<T>) => {
    if (column.sortable && onSort) {
      onSort(column.key)
    }
  }

  const getSortIcon = (columnKey: string) => {
    if (!sortState || sortState.field !== columnKey) return null
    return sortState.direction === 'asc' ? ' ↑' : ' ↓'
  }

  if (loading) {
    return (
      <div className="border border-gray-300 rounded">
        <div className="py-12 text-center text-muted-foreground">
          読み込み中...
        </div>
      </div>
    )
  }

  return (
    <div className="border border-gray-300 rounded overflow-x-auto -mx-2 sm:mx-0">
      {/* ヘッダー行 */}
      <div className="flex items-center h-[40px] bg-gray-100 border-b border-gray-300">
        {columns.map((column) => (
          <div
            key={column.key}
            className={`flex-shrink-0 ${column.width} px-3 py-2 border-r border-gray-300 font-medium text-sm ${
              column.sortable ? 'cursor-pointer hover:bg-gray-200' : ''
            } ${column.headerClassName || ''}`}
            onClick={() => handleHeaderClick(column)}
          >
            {column.renderHeader ? column.renderHeader() : (
              <>
                {column.label}
                {column.sortable && getSortIcon(column.key)}
              </>
            )}
          </div>
        ))}
      </div>

      {/* データ行 */}
      {data.length > 0 ? (
        <div>
          {data.map((item, index) => (
            <div 
              key={getRowKey(item)} 
              className={`flex items-center min-h-[40px] border-b border-gray-200 hover:bg-gray-50 ${
                index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
              }`}
            >
              {columns.map((column) => (
                <div
                  key={column.key}
                  className={`flex-shrink-0 ${column.width} px-3 py-2 border-r border-gray-200 text-sm ${column.cellClassName || ''}`}
                >
                  {column.render(item)}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="py-12 text-center text-muted-foreground">
          {emptyMessage}
        </div>
      )}
    </div>
  )
}) as <T>(props: DataTableProps<T>) => JSX.Element
