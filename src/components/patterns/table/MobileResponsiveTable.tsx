import { ReactNode, memo, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  ColumnDef,
  flexRender,
} from '@tanstack/react-table'

export interface MobileColumn<T> {
  /**
   * 列のキー
   */
  key: string
  /**
   * 列のヘッダーラベル
   */
  header: string
  /**
   * モバイルで非表示にするか
   */
  hiddenOnMobile?: boolean
  /**
   * 列の幅（Tailwindクラス）
   */
  width?: string
  /**
   * ソート可能か
   */
  sortable?: boolean
  /**
   * テキスト配置
   */
  align?: 'left' | 'center' | 'right'
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

export interface MobileResponsiveTableProps<T> {
  /**
   * 表示するデータ
   */
  data: T[]
  /**
   * 列定義
   */
  columns: MobileColumn<T>[]
  /**
   * 行のキーを取得する関数
   */
  getRowKey: (item: T) => string
  /**
   * ソート状態
   */
  sortState?: { field: string; direction: 'asc' | 'desc' }
  /**
   * ソート変更時のコールバック
   */
  onSort?: (columnKey: string) => void
  /**
   * 空のメッセージ
   */
  emptyMessage?: string
  /**
   * 読み込み中か
   */
  loading?: boolean
  /**
   * モバイルデバイスでカード表示にするか
   */
  cardViewOnMobile?: boolean
  /**
   * モバイルでの主要列（カードビューで表示する列）
   */
  primaryColumn?: string
  /**
   * モバイルでの副要列（カードビューで表示する列）
   */
  secondaryColumns?: string[]
}

/**
 * MobileResponsiveTable - レスポンシブテーブルコンポーネント
 * 
 * デスクトップではテーブル表示、モバイルではカード表示に自動切り替え
 * 
 * @example
 * ```tsx
 * const columns: MobileColumn<Scenario>[] = [
 *   {
 *     key: 'title',
 *     header: 'タイトル',
 *     width: 'w-40',
 *     sortable: true,
 *     render: (item) => <p>{item.title}</p>
 *   }
 * ]
 * 
 * <MobileResponsiveTable
 *   data={scenarios}
 *   columns={columns}
 *   getRowKey={(item) => item.id}
 *   cardViewOnMobile={true}
 *   primaryColumn="title"
 *   secondaryColumns={["author", "status"]}
 * />
 * ```
 */
export const MobileResponsiveTable = memo(function MobileResponsiveTable<T>({
  data,
  columns,
  getRowKey,
  sortState,
  onSort,
  emptyMessage = 'データがありません',
  loading = false,
  cardViewOnMobile = true,
  primaryColumn,
  secondaryColumns = []
}: MobileResponsiveTableProps<T>) {
  // モバイルビューに表示する列
  const visibleColumns = useMemo(() => {
    return columns.filter(col => !col.hiddenOnMobile)
  }, [columns])

  const handleHeaderClick = (column: MobileColumn<T>) => {
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

  // モバイルカード表示
  if (cardViewOnMobile) {
    return (
      <div className="space-y-3 md:space-y-4">
        {/* デスクトップ表示（hidden on mobile） */}
        <div className="hidden md:block border border-gray-300 rounded overflow-x-auto">
          {/* ヘッダー行 */}
          <div className="flex items-center h-[40px] bg-gray-100 border-b border-gray-300">
            {columns.map((column) => (
              <div
                key={column.key}
                className={`flex-shrink-0 ${column.width || 'w-32'} px-2 sm:px-3 py-2 border-r border-gray-300 font-medium text-xs sm:text-sm ${
                  column.sortable ? 'cursor-pointer hover:bg-gray-200' : ''
                } ${column.headerClassName || ''}`}
                onClick={() => handleHeaderClick(column)}
              >
                {column.renderHeader ? column.renderHeader() : (
                  <>
                    {column.header}
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
                      className={`flex-shrink-0 ${column.width || 'w-32'} px-2 sm:px-3 py-2 border-r border-gray-200 text-xs sm:text-sm ${column.cellClassName || ''}`}
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

        {/* モバイル表示（visible on mobile） */}
        <div className="md:hidden space-y-2">
          {data.length > 0 ? (
            data.map((item) => {
              const primaryCol = primaryColumn
                ? columns.find(c => c.key === primaryColumn)
                : columns[0]
              
              const secondaryCols = secondaryColumns.length > 0
                ? columns.filter(c => secondaryColumns.includes(c.key))
                : columns.slice(1, 3)

              return (
                <div
                  key={getRowKey(item)}
                  className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4"
                >
                  {/* プライマリ情報 */}
                  {primaryCol && (
                    <div className="mb-2">
                      <div className="text-xs text-gray-500 font-medium">
                        {primaryCol.header}
                      </div>
                      <div className="text-sm sm:text-base font-semibold text-gray-900 mt-1">
                        {primaryCol.render(item)}
                      </div>
                    </div>
                  )}

                  {/* セカンダリ情報 */}
                  {secondaryCols.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 sm:gap-3 mt-3 pt-3 border-t border-gray-100">
                      {secondaryCols.map((column) => (
                        <div key={column.key}>
                          <div className="text-[10px] sm:text-xs text-gray-500 font-medium">
                            {column.header}
                          </div>
                          <div className="text-xs sm:text-sm text-gray-700 mt-0.5">
                            {column.render(item)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          ) : (
            <div className="py-12 text-center text-muted-foreground bg-gray-50 rounded-lg">
              {emptyMessage}
            </div>
          )}
        </div>
      </div>
    )
  }

  // 横スクロール表示（cardViewOnMobile = false）
  return (
    <div className="border border-gray-300 rounded overflow-x-auto">
      {/* ヘッダー行 */}
      <div className="flex items-center h-[40px] bg-gray-100 border-b border-gray-300">
        {visibleColumns.map((column) => (
          <div
            key={column.key}
            className={`flex-shrink-0 ${column.width || 'w-32'} px-2 sm:px-3 py-2 border-r border-gray-300 font-medium text-[10px] sm:text-xs ${
              column.sortable ? 'cursor-pointer hover:bg-gray-200' : ''
            } ${column.headerClassName || ''}`}
            onClick={() => handleHeaderClick(column)}
          >
            {column.renderHeader ? column.renderHeader() : (
              <>
                {column.header}
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
              {visibleColumns.map((column) => (
                <div
                  key={column.key}
                  className={`flex-shrink-0 ${column.width || 'w-32'} px-2 sm:px-3 py-2 border-r border-gray-200 text-[10px] sm:text-xs ${column.cellClassName || ''}`}
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
}) as <T extends Record<string, any>>(
  props: MobileResponsiveTableProps<T>
) => JSX.Element

