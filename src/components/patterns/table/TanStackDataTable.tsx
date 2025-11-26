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

  // カラム幅クラスを計算する共通関数（ヘッダーとデータ行で完全に同じロジック）
  const getWidthClass = (meta: any): string => {
    if (meta?.width) {
      if (meta.width === 'flex-1') {
        return 'flex-1 min-w-[120px]'
      } else {
        return `flex-shrink-0 ${meta.width}`
      }
    } else {
      return 'flex-1 min-w-[120px]'
    }
  }

  return (
    <div className="border border-gray-300 rounded -mx-2 sm:mx-0">
      {/* 横スクロール可能なコンテナ */}
      <div className="overflow-x-auto overflow-y-hidden">
        {/* ヘッダー行 */}
        <div className={stickyHeader ? 'sticky top-[88px] sm:top-0 z-40' : ''}>
          <div className="flex items-stretch min-h-[40px] sm:min-h-[45px] md:min-h-[50px] bg-gray-100 border-b border-gray-300 min-w-max">
            {table.getHeaderGroups().map((headerGroup) =>
              headerGroup.headers.map((header, headerIndex) => {
                const meta = header.column.columnDef.meta as any
                const isSortable = header.column.getCanSort()
                const alignClass = meta?.align === 'center' ? 'text-center' : meta?.align === 'right' ? 'text-right' : 'text-left'
                const widthClass = getWidthClass(meta)
                const isLastHeader = headerIndex === headerGroup.headers.length - 1
                const shouldShowBorder = !isLastHeader || stickyHeaderContent
                
                return (
                  <div
                    key={header.id}
                    className={`${widthClass} px-1 sm:px-2 py-1.5 sm:py-2 ${shouldShowBorder ? 'border-r border-gray-300' : ''} font-medium text-xs sm:text-xs ${alignClass} bg-gray-100 ${
                      isSortable ? 'cursor-pointer hover:bg-gray-200' : ''
                    } ${meta?.headerClassName || ''} flex items-center ${alignClass === 'center' ? 'justify-center' : alignClass === 'right' ? 'justify-end' : 'justify-start'} whitespace-nowrap`}
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
            {stickyHeaderContent && (
              <div className="hidden md:flex items-center px-4 border-l border-gray-300 bg-gray-100 flex-shrink-0">
                {stickyHeaderContent}
              </div>
            )}
          </div>
        </div>

        {/* データ行 */}
        {table.getRowModel().rows.length > 0 ? (
          <div>
            {table.getRowModel().rows.map((row, index) => (
              <div 
                key={getRowKey(row.original)}
                className={`flex items-stretch h-[40px] sm:h-[45px] md:h-[50px] border-b border-gray-200 hover:bg-gray-50 min-w-max ${
                  index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                }`}
              >
                {row.getVisibleCells().map((cell, cellIndex) => {
                  const meta = cell.column.columnDef.meta as any
                  const alignClass = meta?.align === 'center' ? 'text-center' : meta?.align === 'right' ? 'text-right' : 'text-left'
                  const widthClass = getWidthClass(meta)
                  const isLastCell = cellIndex === row.getVisibleCells().length - 1
                  const shouldShowBorder = !isLastCell || stickyHeaderContent
                  return (
                    <div
                      key={cell.id}
                      className={`${widthClass} px-1 sm:px-2 py-1.5 sm:py-2 ${shouldShowBorder ? 'border-r border-gray-200' : ''} text-xs sm:text-xs ${alignClass} ${
                        meta?.cellClassName || ''
                      } flex items-center ${alignClass === 'center' ? 'justify-center' : alignClass === 'right' ? 'justify-end' : 'justify-start'}`}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-muted-foreground">
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  )
}) as <T>(props: DataTableProps<T>) => JSX.Element

