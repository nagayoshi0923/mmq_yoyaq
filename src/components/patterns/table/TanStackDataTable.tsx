import { ReactNode, memo, useMemo, useState, useEffect, useCallback } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  ColumnDef,
  flexRender,
  ColumnOrderState,
} from '@tanstack/react-table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { HelpCircle, GripVertical } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// TanStack Table のカスタム meta 型
interface ColumnMetaCustom {
  width?: string
  align?: 'left' | 'center' | 'right'
  headerClassName?: string
  cellClassName?: string
}

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
   * ソート用の値を返す関数（オプション、指定しない場合はkeyで取得）
   */
  sortValue?: (item: T) => string | number | null | undefined
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
  /**
   * カラムのヘルプテキスト（ホバーでツールチップ表示）
   */
  helpText?: string
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
  /**
   * ドラッグ&ドロップでカラム並び替えを有効にするか
   */
  enableColumnReorder?: boolean
  /**
   * カラム順序をlocalStorageに保存するためのキー
   * 指定するとリロード後もカラム順序が維持される
   */
  columnOrderKey?: string
}

/**
 * ドラッグ可能なヘッダーセル
 */
interface SortableHeaderProps {
  id: string
  children: ReactNode
  className: string
  onClick?: (event: unknown) => void
  enableReorder: boolean
}

function SortableHeader({ id, children, className, onClick, enableReorder }: SortableHeaderProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !enableReorder })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : 'auto',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${className} ${isDragging ? 'shadow-lg' : ''}`}
      onClick={(e) => onClick?.(e)}
    >
      {enableReorder && (
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing flex-shrink-0 text-gray-300 hover:text-gray-500 -ml-0.5 mr-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-3 h-3" />
        </span>
      )}
      {children}
    </div>
  )
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
 *   enableColumnReorder={true}
 *   columnOrderKey="my-table-columns"
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
  stickyHeaderContent,
  enableColumnReorder = false,
  columnOrderKey
}: DataTableProps<T>) {
  // ヘルプテキスト付きヘッダーをレンダリングする関数
  const renderHeaderWithHelp = (col: Column<T>) => {
    if (col.renderHeader) {
      return col.renderHeader()
    }
    
    if (col.helpText) {
      return (
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help border-b border-dotted border-gray-400">
                {col.header}
              </span>
            </TooltipTrigger>
            <TooltipContent 
              side="bottom" 
              align="start"
              sideOffset={8}
              className="z-[100] max-w-xs p-3 text-xs bg-white text-gray-700 border border-gray-200 rounded-lg shadow-lg"
            >
              <div className="flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="leading-relaxed">{col.helpText}</p>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }
    
    return col.header
  }

  // カラム順序の初期値を取得（localStorageから復元）
  const getInitialColumnOrder = useCallback((): string[] => {
    const defaultOrder = columns.map(col => col.key)
    if (!columnOrderKey) return defaultOrder
    
    try {
      const saved = localStorage.getItem(`column-order-${columnOrderKey}`)
      if (saved) {
        const parsed = JSON.parse(saved) as string[]
        // 保存されたカラムが現在のカラムと一致するか確認
        const currentKeys = new Set(defaultOrder)
        const savedKeys = new Set(parsed)
        
        // 全てのカラムが含まれているか確認
        if (parsed.length === defaultOrder.length && 
            parsed.every(key => currentKeys.has(key))) {
          return parsed
        }
      }
    } catch (e) {
      // パースエラー時はデフォルト
    }
    return defaultOrder
  }, [columns, columnOrderKey])

  // カラム順序の状態
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(getInitialColumnOrder)

  // columnsが変わった時にカラム順序をリセット（新しいカラムが追加された場合など）
  useEffect(() => {
    const currentKeys = columns.map(col => col.key)
    const hasNewColumns = currentKeys.some(key => !columnOrder.includes(key))
    const hasMissingColumns = columnOrder.some(key => !currentKeys.includes(key))
    
    if (hasNewColumns || hasMissingColumns) {
      setColumnOrder(getInitialColumnOrder())
    }
  }, [columns, columnOrder, getInitialColumnOrder])

  // カラム順序をlocalStorageに保存
  useEffect(() => {
    if (columnOrderKey && columnOrder.length > 0) {
      localStorage.setItem(`column-order-${columnOrderKey}`, JSON.stringify(columnOrder))
    }
  }, [columnOrder, columnOrderKey])

  // dnd-kitセンサー
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px動かしてからドラッグ開始
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // ドラッグ終了時のハンドラ
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    
    if (over && active.id !== over.id) {
      setColumnOrder((current) => {
        const oldIndex = current.indexOf(active.id as string)
        const newIndex = current.indexOf(over.id as string)
        return arrayMove(current, oldIndex, newIndex)
      })
    }
  }, [])

  // カラム順序に基づいてカラムを並び替え
  const orderedColumns = useMemo(() => {
    if (!enableColumnReorder) return columns
    
    const columnMap = new Map(columns.map(col => [col.key, col]))
    return columnOrder
      .map(key => columnMap.get(key))
      .filter((col): col is Column<T> => col !== undefined)
  }, [columns, columnOrder, enableColumnReorder])

  // Column定義をTanStack Table形式に変換（順序適用済み）
  const tanStackColumns = useMemo<ColumnDef<T>[]>(
    () =>
      orderedColumns.map((col) => ({
        id: col.key,
        // sortValueがある場合はソート用の値を返す、なければ行のkeyプロパティを使用
        accessorFn: (row) => {
          if (col.sortValue) {
            return col.sortValue(row)
          }
          // デフォルトはkeyでプロパティを取得
          return (row as Record<string, unknown>)[col.key]
        },
        header: () => renderHeaderWithHelp(col),
        cell: ({ row }) => col.render(row.original),
        enableSorting: col.sortable ?? false,
        sortingFn: col.sortValue ? 'auto' : 'alphanumeric',
        meta: {
          width: col.width,
          align: col.align,
          headerClassName: col.headerClassName,
          cellClassName: col.cellClassName,
        },
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- orderedColumnsのみ依存
    [orderedColumns]
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
      <div>
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

  // ヘッダー行のコンテンツをレンダリング
  const renderHeaders = () => {
    return table.getHeaderGroups().map((headerGroup) =>
      headerGroup.headers.map((header, headerIndex) => {
        const meta = header.column.columnDef.meta as ColumnMetaCustom | undefined
        const isSortable = header.column.getCanSort()
        const alignClass = meta?.align === 'center' ? 'text-center' : meta?.align === 'right' ? 'text-right' : 'text-left'
        const widthClass = getWidthClass(meta)
        const isLastHeader = headerIndex === headerGroup.headers.length - 1
        const shouldShowBorder = !isLastHeader || stickyHeaderContent
        
        const headerClassName = `${widthClass} px-1 sm:px-2 py-1.5 sm:py-2 ${shouldShowBorder ? 'border-r border-gray-200' : ''} font-medium text-xs sm:text-xs ${alignClass} bg-gray-100 ${
          isSortable ? 'cursor-pointer hover:bg-gray-200' : ''
        } ${meta?.headerClassName || ''} flex items-center ${alignClass === 'text-center' ? 'justify-center' : alignClass === 'text-right' ? 'justify-end' : 'justify-start'} whitespace-nowrap`
        
        if (enableColumnReorder) {
          return (
            <SortableHeader
              key={header.id}
              id={header.id}
              className={headerClassName}
              onClick={isSortable ? header.column.getToggleSortingHandler() : undefined}
              enableReorder={enableColumnReorder}
            >
              {flexRender(header.column.columnDef.header, header.getContext())}
              {isSortable && getSortIcon(header.id)}
            </SortableHeader>
          )
        }
        
        return (
          <div
            key={header.id}
            className={headerClassName}
            onClick={isSortable ? header.column.getToggleSortingHandler() : undefined}
          >
            {flexRender(header.column.columnDef.header, header.getContext())}
            {isSortable && getSortIcon(header.id)}
          </div>
        )
      })
    )
  }

  return (
    <div className="-mx-2 sm:mx-0">
      {/* 横スクロール可能なコンテナ */}
      <div className="overflow-x-auto overflow-y-hidden">
        {/* ヘッダー行 */}
        <div className={stickyHeader ? 'sm:sticky sm:top-0 z-40' : ''}>
          {enableColumnReorder ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={columnOrder}
                strategy={horizontalListSortingStrategy}
              >
                <div className="flex items-stretch min-h-[40px] sm:min-h-[45px] md:min-h-[50px] bg-gray-100 border-b border-gray-200 min-w-max">
                  {renderHeaders()}
                  {stickyHeaderContent && (
                    <div className="hidden md:flex items-center px-4 border-l border-gray-200 bg-gray-100 flex-shrink-0">
                      {stickyHeaderContent}
                    </div>
                  )}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="flex items-stretch min-h-[40px] sm:min-h-[45px] md:min-h-[50px] bg-gray-100 border-b border-gray-200 min-w-max">
              {renderHeaders()}
              {stickyHeaderContent && (
                <div className="hidden md:flex items-center px-4 border-l border-gray-200 bg-gray-100 flex-shrink-0">
                  {stickyHeaderContent}
                </div>
              )}
            </div>
          )}
        </div>

        {/* データ行 */}
        {table.getRowModel().rows.length > 0 ? (
          <div>
            {table.getRowModel().rows.map((row, index) => (
              <div 
                key={getRowKey(row.original)}
                className={`flex items-stretch h-[40px] sm:h-[45px] md:h-[50px] border-b border-gray-200 last:border-b-0 hover:bg-gray-50 min-w-max ${
                  index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                }`}
              >
                {row.getVisibleCells().map((cell, cellIndex) => {
                  const meta = cell.column.columnDef.meta as ColumnMetaCustom | undefined
                  const alignClass = meta?.align === 'center' ? 'text-center' : meta?.align === 'right' ? 'text-right' : 'text-left'
                  const widthClass = getWidthClass(meta)
                  const isLastCell = cellIndex === row.getVisibleCells().length - 1
                  const shouldShowBorder = !isLastCell || stickyHeaderContent
                  return (
                    <div
                      key={cell.id}
                      className={`${widthClass} px-1 sm:px-2 py-1.5 sm:py-2 ${shouldShowBorder ? 'border-r border-gray-200' : ''} text-xs sm:text-xs ${alignClass} ${
                        meta?.cellClassName || ''
                      } flex items-center ${alignClass === 'text-center' ? 'justify-center' : alignClass === 'text-right' ? 'justify-end' : 'justify-start'}`}
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

