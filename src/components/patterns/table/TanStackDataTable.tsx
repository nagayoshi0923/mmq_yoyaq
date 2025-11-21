import { ReactNode, memo, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  ColumnDef,
  flexRender,
} from '@tanstack/react-table'

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
  onSort?: (sortState: { field: string; direction: 'asc' | 'desc' } | undefined) => void
  /**
   * データがない場合のメッセージ
   */
  emptyMessage?: string
  /**
   * ローディング中か
   */
  loading?: boolean
  /**
   * ヘッダーをスティッキーにするか
   */
  stickyHeader?: boolean
  /**
   * スティッキーヘッダーの右側に表示するコンテンツ
   */
  stickyHeaderContent?: ReactNode
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
  loading = false,
  stickyHeader = false,
  stickyHeaderContent
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
        onSort({
          field: newSorting[0].id,
          direction: newSorting[0].desc ? 'desc' : 'asc'
        })
      } else {
        onSort(undefined)
      }
    },
    manualSorting: !!onSort, // 外部でソートを管理する場合
    debugTable: false, // デバッグモードを無効化
    debugHeaders: false, // ヘッダーデバッグを無効化
    debugColumns: false, // カラムデバッグを無効化
  })

  const getSortIcon = (columnId: string) => {
    if (!sortState || sortState.field !== columnId) return null
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

  // カラム幅をstyle objectに変換
  const getWidthStyle = (meta: any): React.CSSProperties => {
    if (meta?.width) {
      if (meta.width === 'flex-1') {
        return { width: 'auto', minWidth: '120px' } // autoで均等配分だが最小幅を確保
      } else if (meta.width === 'w-56') {
        return { width: '224px', minWidth: '160px' }
      } else if (meta.width === 'w-32') {
        return { width: '128px', minWidth: '100px' }
      } else if (meta.width === 'w-24') {
        return { width: '96px', minWidth: '80px' }
      } else if (meta.width === 'w-20') {
        return { width: '80px', minWidth: '70px' }
      }
    }
    return { width: 'auto', minWidth: '80px' } // デフォルトでも最小幅を確保
  }

  return (
    <div className="border border-gray-300 rounded -mx-2 sm:mx-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[800px]">
          {/* ヘッダー */}
          <thead className={stickyHeader ? 'sticky top-[44px] sm:top-0 z-40' : ''}>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="bg-gray-100 border-b border-gray-300">
                {headerGroup.headers.map((header, headerIndex) => {
                  const meta = header.column.columnDef.meta as any
                  const isSortable = header.column.getCanSort()
                  const alignClass = meta?.align === 'center' ? 'text-center' : meta?.align === 'right' ? 'text-right' : 'text-left'
                  const isLastHeader = headerIndex === headerGroup.headers.length - 1
                  
                  return (
                    <th
                      key={header.id}
                      style={getWidthStyle(meta)}
                      className={`px-1 sm:px-2 py-1.5 sm:py-2 ${!isLastHeader ? 'border-r border-gray-300' : ''} font-medium text-[10px] sm:text-xs md:text-sm ${alignClass} bg-gray-100 ${
                        isSortable ? 'cursor-pointer hover:bg-gray-200' : ''
                      } ${meta?.headerClassName || ''} h-[40px] sm:h-[45px] md:h-[50px]`}
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
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>

          {/* データ行 */}
          <tbody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row, index) => (
                <tr
                  key={getRowKey(row.original)}
                  className={`border-b border-gray-200 hover:bg-gray-50 ${
                    index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                  }`}
                >
                  {row.getVisibleCells().map((cell, cellIndex) => {
                    const meta = cell.column.columnDef.meta as any
                    const alignClass = meta?.align === 'center' ? 'text-center' : meta?.align === 'right' ? 'text-right' : 'text-left'
                    const isLastCell = cellIndex === row.getVisibleCells().length - 1
                    
                    return (
                      <td
                        key={cell.id}
                        style={getWidthStyle(meta)}
                        className={`px-1 sm:px-2 py-1.5 sm:py-2 ${!isLastCell ? 'border-r border-gray-200' : ''} text-[10px] sm:text-xs md:text-sm ${alignClass} ${
                          meta?.cellClassName || ''
                        } h-[40px] sm:h-[45px] md:h-[50px]`}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}) as <T>(props: DataTableProps<T>) => JSX.Element

