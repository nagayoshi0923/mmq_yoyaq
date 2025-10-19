import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ReactNode, memo } from 'react'

export interface DataTableColumn<T> {
  /**
   * カラムの一意なキー
   */
  key: string
  /**
   * カラムのヘッダーラベル
   */
  header: string
  /**
   * セルの内容をレンダリングする関数
   */
  cell: (row: T, index: number) => ReactNode
  /**
   * カラムの幅
   */
  width?: string
  /**
   * テキストの配置
   */
  align?: 'left' | 'center' | 'right'
  /**
   * ソート可能か
   */
  sortable?: boolean
}

interface DataTableProps<T> {
  /**
   * カラム定義
   */
  columns: DataTableColumn<T>[]
  /**
   * 表示するデータ
   */
  data: T[]
  /**
   * 行のキーを取得する関数
   */
  getRowKey: (row: T, index: number) => string
  /**
   * ツールバー（検索、フィルターなど）
   */
  toolbar?: ReactNode
  /**
   * 行アクション（各行の右端に表示されるボタンなど）
   */
  rowActions?: (row: T, index: number) => ReactNode
  /**
   * 空の状態の表示
   */
  emptyState?: ReactNode
  /**
   * 読み込み中の表示
   */
  loading?: boolean
  /**
   * 行クリック時のコールバック
   */
  onRowClick?: (row: T, index: number) => void
  /**
   * カスタムスタイル
   */
  className?: string
}

/**
 * DataTable<T> - 汎用的なテーブルコンポーネント
 * 
 * ScenarioTableをベースにした再利用可能なテーブル。
 * 型安全で、カラム定義のみで様々なテーブルを構築できます。
 * 
 * @example
 * ```tsx
 * interface User {
 *   id: string
 *   name: string
 *   email: string
 * }
 * 
 * const columns: DataTableColumn<User>[] = [
 *   {
 *     key: 'name',
 *     header: '名前',
 *     cell: (user) => user.name
 *   },
 *   {
 *     key: 'email',
 *     header: 'メール',
 *     cell: (user) => user.email
 *   }
 * ]
 * 
 * <DataTable
 *   columns={columns}
 *   data={users}
 *   getRowKey={(user) => user.id}
 *   rowActions={(user) => (
 *     <Button onClick={() => handleEdit(user)}>編集</Button>
 *   )}
 * />
 * ```
 */
export const DataTable = memo(function DataTable<T>({
  columns,
  data,
  getRowKey,
  toolbar,
  rowActions,
  emptyState,
  loading = false,
  onRowClick,
  className = ''
}: DataTableProps<T>) {
  const hasRowActions = !!rowActions

  return (
    <div className={`space-y-4 ${className}`}>
      {/* ツールバー */}
      {toolbar && (
        <div className="flex items-center justify-between">
          {toolbar}
        </div>
      )}

      {/* テーブル */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  style={{ width: column.width }}
                  className={`
                    ${column.align === 'center' ? 'text-center' : ''}
                    ${column.align === 'right' ? 'text-right' : ''}
                  `}
                >
                  {column.header}
                </TableHead>
              ))}
              {hasRowActions && (
                <TableHead className="w-[100px] text-right">アクション</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (hasRowActions ? 1 : 0)}
                  className="h-24 text-center"
                >
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    <span className="ml-2 text-muted-foreground">読み込み中...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (hasRowActions ? 1 : 0)}
                  className="h-24 text-center"
                >
                  {emptyState || (
                    <div className="text-muted-foreground">
                      データがありません
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, index) => (
                <TableRow
                  key={getRowKey(row, index)}
                  onClick={onRowClick ? () => onRowClick(row, index) : undefined}
                  className={onRowClick ? 'cursor-pointer hover:bg-muted/50' : ''}
                >
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      className={`
                        ${column.align === 'center' ? 'text-center' : ''}
                        ${column.align === 'right' ? 'text-right' : ''}
                      `}
                    >
                      {column.cell(row, index)}
                    </TableCell>
                  ))}
                  {hasRowActions && (
                    <TableCell className="text-right">
                      {rowActions(row, index)}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}) as <T>(props: DataTableProps<T>) => JSX.Element

