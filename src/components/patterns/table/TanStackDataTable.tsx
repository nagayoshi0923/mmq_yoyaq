import { ReactNode, memo, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  ColumnDef,
  flexRender,
} from '@tanstack/react-table'
import { Card, CardContent } from '@/components/ui/card'

export interface Column<T> {
  /**
   * 列のキー
   */
  key: string
  /**
   * 列のヘッダーラベル
   */
  header: string
  /**
   * 列の幅（Tailwindクラス、オプション）
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
 * TanStackDataTable - TanStack Tableを使用した高性能テーブルコンポーネント
 * 
 * 既存のDataTableと同じインターフェースを維持しつつ、
 * 内部でTanStack Tableを使用してパフォーマンスと拡張性を向上
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
 * <TanStackDataTable
 *   data={scenarios}
 *   columns={columns}
 *   getRowKey={(item) => item.id}
 *   sortState={sortState}
 *   onSort={handleSort}
 * />
 * ```
 */
export const TanStackDataTable = memo(function TanStackDataTable<T>({
  data,
  columns,
  getRowKey,
  sortState,
  onSort,
  emptyMessage = 'データがありません',
  loading = false
}: DataTableProps<T>) {
  // Column定義をTanStack Table形式に変換
  const tanStackColumns = useMemo<ColumnDef<T>[]>(
    () =>
      columns.map((col) => ({
        id: col.key,
        accessorFn: (row) => row,
        header: () => col.renderHeader?.() || col.header,
        cell: ({ row }) => col.render(row.original),
        enableSorting: col.sortable ?? false,
        meta: {
          width: col.width,
          align: col.align,
          headerClassName: col.headerClassName,
          cellClassName: col.cellClassName,
        },
      })),
    [columns]
  )

  // ソート状態をTanStack Table形式に変換
  const sorting: SortingState = useMemo(
    () =>
      sortState
        ? [
            {
              id: sortState.field,
              desc: sortState.direction === 'desc',
            },
          ]
        : [],
    [sortState]
  )

  // TanStack Tableインスタンスを作成
  const table = useReactTable({
    data,
    columns: tanStackColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
    onSortingChange: (updaterOrValue) => {
      if (!onSort) return

      const newSorting =
        typeof updaterOrValue === 'function'
          ? updaterOrValue(sorting)
          : updaterOrValue

      if (newSorting.length > 0) {
        onSort(newSorting[0].id)
      }
    },
    manualSorting: !!onSort, // 外部でソートを管理する場合
  })

  const getSortIcon = (columnId: string) => {
    if (!sortState || sortState.field !== columnId) return null
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
            {table.getHeaderGroups().map((headerGroup) =>
              headerGroup.headers.map((header) => {
                const meta = header.column.columnDef.meta as any
                const isSortable = header.column.getCanSort()
                const alignClass = meta?.align === 'center' ? 'text-center' : meta?.align === 'right' ? 'text-right' : 'text-left'
                
                return (
                  <div
                    key={header.id}
                    className={`${meta?.width || 'flex-1'} px-3 py-2 border-r font-medium text-sm ${alignClass} ${
                      isSortable ? 'cursor-pointer hover:bg-muted/50' : ''
                    } ${meta?.headerClassName || ''}`}
                    onClick={
                      isSortable
                        ? header.column.getToggleSortingHandler()
                        : undefined
                    }
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                    {isSortable && getSortIcon(header.id)}
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* データ行 */}
      {table.getRowModel().rows.length > 0 ? (
        <div className="space-y-1">
          {table.getRowModel().rows.map((row) => (
            <Card key={getRowKey(row.original)}>
              <CardContent className="p-0">
                <div className="flex items-center min-h-[60px]">
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as any
                    const alignClass = meta?.align === 'center' ? 'text-center' : meta?.align === 'right' ? 'text-right' : 'text-left'
                    return (
                      <div
                        key={cell.id}
                        className={`${meta?.width || 'flex-1'} px-3 py-2 border-r ${alignClass} ${
                          meta?.cellClassName || ''
                        }`}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </div>
                    )
                  })}
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

