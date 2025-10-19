import { ReactNode, memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'

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
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          読み込み中...
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-1">
      {/* ヘッダー行 */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center h-[50px] bg-muted/30">
            {columns.map((column) => (
              <div
                key={column.key}
                className={`flex-shrink-0 ${column.width} px-3 py-2 border-r font-medium text-sm ${
                  column.sortable ? 'cursor-pointer hover:bg-muted/50' : ''
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
        </CardContent>
      </Card>

      {/* データ行 */}
      {data.length > 0 ? (
        <div className="space-y-1">
          {data.map((item) => (
            <Card key={getRowKey(item)}>
              <CardContent className="p-0">
                <div className="flex items-center min-h-[60px]">
                  {columns.map((column) => (
                    <div
                      key={column.key}
                      className={`flex-shrink-0 ${column.width} px-3 py-2 border-r ${column.cellClassName || ''}`}
                    >
                      {column.render(item)}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {emptyMessage}
          </CardContent>
        </Card>
      )}
    </div>
  )
}) as <T>(props: DataTableProps<T>) => JSX.Element
