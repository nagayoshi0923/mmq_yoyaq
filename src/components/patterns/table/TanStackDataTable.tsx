import { ReactNode, memo, useMemo, useCallback } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  ColumnDef,
  flexRender,
  VisibilityState,
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
import { useTablePreferences, type TablePreferences } from '@/hooks/useTablePreferences'

// TanStack Table のカスタム meta 型
interface ColumnMetaCustom {
  width?: string
  align?: 'left' | 'center' | 'right'
  headerClassName?: string
  cellClassName?: string
}

export interface Column<T> {
  key: string
  header: string
  width?: string
  sortable?: boolean
  align?: 'left' | 'center' | 'right'
  render: (item: T) => ReactNode
  sortValue?: (item: T) => string | number | null | undefined
  renderHeader?: () => ReactNode
  headerClassName?: string
  cellClassName?: string
  helpText?: string
  /** trueにするとカラム設定パネルで非表示にできない */
  required?: boolean
}

export interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  getRowKey: (item: T) => string
  sortState?: {
    field: string
    direction: 'asc' | 'desc'
  }
  onSort?: (sortState: { field: string; direction: 'asc' | 'desc' } | undefined) => void
  emptyMessage?: string
  loading?: boolean
  stickyHeader?: boolean
  stickyHeaderContent?: ReactNode
  /** ドラッグ&ドロップでヘッダーのカラム並び替えを有効にするか */
  enableColumnReorder?: boolean
  /**
   * 外部から管理するカラム設定（表示/非表示・並び順）。
   * useTablePreferences と ColumnSettingsPanel と組み合わせて使う。
   */
  columnPreferences?: TablePreferences
  autoRowHeight?: boolean
  /** @deprecated columnPreferences を使用してください */
  columnSettingsKey?: string
  /** @deprecated columnPreferences を使用してください */
  columnOrderKey?: string
}

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
  columnPreferences,
  autoRowHeight = false,
  columnSettingsKey, // deprecated
  columnOrderKey,    // deprecated
}: DataTableProps<T>) {
  const defaultColumnKeys = useMemo(() => columns.map(c => c.key), [columns])

  // deprecated: columnSettingsKey/columnOrderKey のフォールバック用（外部から prefs が来ない場合）
  const legacyKey = columnSettingsKey ?? columnOrderKey
  const [internalPrefs] = useTablePreferences(
    columnPreferences ? undefined : legacyKey,
    defaultColumnKeys
  )
  const prefs = columnPreferences ?? internalPrefs

  // カラム順序に基づいてカラムを並び替え＋非表示フィルタ
  const visibleOrderedColumns = useMemo(() => {
    const order = prefs.columnOrder.length > 0 ? prefs.columnOrder : defaultColumnKeys
    const colMap = new Map(columns.map(c => [c.key, c]))
    const ordered = order
      .map(k => colMap.get(k))
      .filter((c): c is Column<T> => c !== undefined)
    const inOrder = new Set(order)
    const extras = columns.filter(c => !inOrder.has(c.key))
    return [...ordered, ...extras].filter(c => {
      if (c.required) return true
      return prefs.columnVisibility[c.key] ?? true
    })
  }, [columns, prefs, defaultColumnKeys])

  // ヘルプテキスト付きヘッダー
  const renderHeaderWithHelp = (col: Column<T>) => {
    if (col.renderHeader) return col.renderHeader()
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

  // dnd-kitセンサー（ヘッダードラッグ用）
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleHeaderDragEnd = useCallback((event: DragEndEvent) => {
    // ヘッダーDnDは enableColumnReorder かつ外部から onColumnConfigChange が渡された場合のみ動作
    if (!enableColumnReorder) return
    const { active, over } = event
    if (!over || active.id === over.id) return

    const currentOrder = prefs.columnOrder.length > 0 ? prefs.columnOrder : defaultColumnKeys
    const oldIndex = currentOrder.indexOf(active.id as string)
    const newIndex = currentOrder.indexOf(over.id as string)
    if (oldIndex === -1 || newIndex === -1) return
  }, [prefs, defaultColumnKeys, enableColumnReorder])

  // TanStack Table 用カラム定義
  const tanStackColumns = useMemo<ColumnDef<T>[]>(
    () =>
      visibleOrderedColumns.map((col) => ({
        id: col.key,
        accessorFn: (row) => {
          if (col.sortValue) return col.sortValue(row)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleOrderedColumns]
  )

  const sorting: SortingState = useMemo(
    () =>
      sortState
        ? [{ id: sortState.field, desc: sortState.direction === 'desc' }]
        : [],
    [sortState]
  )

  // TanStack Table 用の visibility state（TanStack 側ではなく上位で管理しているため空）
  const columnVisibility: VisibilityState = {}

  const table = useReactTable({
    data,
    columns: tanStackColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { sorting, columnVisibility },
    onSortingChange: (updaterOrValue) => {
      if (!onSort) return
      const newSorting =
        typeof updaterOrValue === 'function' ? updaterOrValue(sorting) : updaterOrValue
      if (newSorting.length > 0) {
        onSort({ field: newSorting[0].id, direction: newSorting[0].desc ? 'desc' : 'asc' })
      } else {
        onSort(undefined)
      }
    },
    manualSorting: !!onSort,
    debugTable: false,
    debugHeaders: false,
    debugColumns: false,
  })

  const getSortIcon = (columnId: string) => {
    if (!sortState || sortState.field !== columnId) return null
    return sortState.direction === 'asc' ? ' ↑' : ' ↓'
  }

  const getWidthClass = (meta: ColumnMetaCustom | undefined): string => {
    if (meta?.width) {
      return meta.width === 'flex-1' ? 'flex-1 min-w-[120px]' : `flex-shrink-0 ${meta.width}`
    }
    return 'flex-1 min-w-[120px]'
  }

  const visibleColumnOrder = useMemo(
    () => visibleOrderedColumns.map(c => c.key),
    [visibleOrderedColumns]
  )

  const renderHeaders = () =>
    table.getHeaderGroups().map((headerGroup) =>
      headerGroup.headers.map((header, headerIndex) => {
        const meta = header.column.columnDef.meta as ColumnMetaCustom | undefined
        const isSortable = header.column.getCanSort()
        const alignClass =
          meta?.align === 'center' ? 'text-center' : meta?.align === 'right' ? 'text-right' : 'text-left'
        const widthClass = getWidthClass(meta)
        const isLastHeader = headerIndex === headerGroup.headers.length - 1
        const shouldShowBorder = !isLastHeader || !!stickyHeaderContent

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

  if (loading) {
    return (
      <div className="py-12 text-center text-muted-foreground">読み込み中...</div>
    )
  }

  return (
    <div className="-mx-2 sm:mx-0">
      <div className="overflow-x-auto overflow-y-hidden">
        {/* ヘッダー */}
        <div className={stickyHeader ? 'sm:sticky sm:top-0 z-40' : ''}>
          {enableColumnReorder ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleHeaderDragEnd}
            >
              <SortableContext items={visibleColumnOrder} strategy={horizontalListSortingStrategy}>
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
                className={`flex items-stretch ${autoRowHeight ? 'min-h-[40px] sm:min-h-[45px] md:min-h-[50px]' : 'h-[40px] sm:h-[45px] md:h-[50px]'} border-b border-gray-200 last:border-b-0 hover:bg-gray-50 min-w-max ${
                  index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                }`}
              >
                {row.getVisibleCells().map((cell, cellIndex) => {
                  const meta = cell.column.columnDef.meta as ColumnMetaCustom | undefined
                  const alignClass =
                    meta?.align === 'center' ? 'text-center' : meta?.align === 'right' ? 'text-right' : 'text-left'
                  const widthClass = getWidthClass(meta)
                  const isLastCell = cellIndex === row.getVisibleCells().length - 1
                  const shouldShowBorder = !isLastCell || !!stickyHeaderContent
                  return (
                    <div
                      key={cell.id}
                      className={`${widthClass} px-1 sm:px-2 py-1.5 sm:py-2 ${shouldShowBorder ? 'border-r border-gray-200' : ''} text-xs sm:text-xs ${alignClass} ${
                        meta?.cellClassName || ''
                      } flex items-center ${alignClass === 'text-center' ? 'justify-center' : alignClass === 'text-right' ? 'justify-end' : 'justify-start'}`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-muted-foreground">{emptyMessage}</div>
        )}
      </div>
    </div>
  )
}) as <T>(props: DataTableProps<T>) => JSX.Element
