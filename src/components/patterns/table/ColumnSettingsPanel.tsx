import { useCallback } from 'react'
import { Settings2, GripVertical, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { TablePreferences } from '@/hooks/useTablePreferences'

interface ColumnConfig {
  key: string
  header: string
  required?: boolean
}

interface ColumnSettingsPanelProps {
  columns: ColumnConfig[]
  preferences: TablePreferences
  onPreferencesChange: (prefs: TablePreferences) => void
  defaultColumnKeys: string[]
}

interface SortableItemProps {
  id: string
  label: string
  visible: boolean
  required: boolean
  onToggle: (key: string) => void
}

function SortableItem({ id, label, visible, required, onToggle }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: required })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-50 select-none"
    >
      <span
        {...attributes}
        {...listeners}
        className={`flex-shrink-0 ${required ? 'text-gray-200 cursor-default' : 'text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing'}`}
      >
        <GripVertical className="w-4 h-4" />
      </span>
      <label className="flex items-center gap-2 flex-1 cursor-pointer">
        <input
          type="checkbox"
          checked={visible}
          disabled={required}
          onChange={() => onToggle(id)}
          className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 disabled:opacity-40"
        />
        <span className={`text-sm ${!visible ? 'text-gray-400' : 'text-gray-700'}`}>
          {label}
        </span>
        {required && (
          <span className="text-[10px] text-gray-400 ml-auto">必須</span>
        )}
      </label>
    </div>
  )
}

export function ColumnSettingsPanel({
  columns,
  preferences,
  onPreferencesChange,
  defaultColumnKeys,
}: ColumnSettingsPanelProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // prefs.columnOrder に基づいてカラムを並べる
  const orderedColumns = useCallback(() => {
    const order = preferences.columnOrder.length > 0 ? preferences.columnOrder : defaultColumnKeys
    const colMap = new Map(columns.map(c => [c.key, c]))
    const ordered = order.map(k => colMap.get(k)).filter((c): c is ColumnConfig => !!c)
    const rest = columns.filter(c => !order.includes(c.key))
    return [...ordered, ...rest]
  }, [columns, preferences.columnOrder, defaultColumnKeys])()

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = preferences.columnOrder.indexOf(active.id as string)
    const newIndex = preferences.columnOrder.indexOf(over.id as string)
    if (oldIndex === -1 || newIndex === -1) return

    onPreferencesChange({
      ...preferences,
      columnOrder: arrayMove(preferences.columnOrder, oldIndex, newIndex),
    })
  }

  const handleToggle = (key: string) => {
    const current = preferences.columnVisibility[key] ?? true
    onPreferencesChange({
      ...preferences,
      columnVisibility: {
        ...preferences.columnVisibility,
        [key]: !current,
      },
    })
  }

  const handleReset = () => {
    onPreferencesChange({
      columnOrder: defaultColumnKeys,
      columnVisibility: {},
    })
  }

  const hiddenCount = columns.filter(c => {
    if (c.required) return false
    return (preferences.columnVisibility[c.key] ?? true) === false
  }).length

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <Settings2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">カラム設定</span>
          {hiddenCount > 0 && (
            <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0 rounded-full font-medium">
              {hiddenCount}非表示
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <div className="flex items-center justify-between mb-1.5 px-1">
          <span className="text-xs font-medium text-gray-600">表示カラムの設定</span>
          <button
            onClick={handleReset}
            className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600"
          >
            <RotateCcw className="w-3 h-3" />
            リセット
          </button>
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={preferences.columnOrder}
            strategy={verticalListSortingStrategy}
          >
            {orderedColumns.map(col => (
              <SortableItem
                key={col.key}
                id={col.key}
                label={col.header}
                visible={preferences.columnVisibility[col.key] ?? true}
                required={col.required ?? false}
                onToggle={handleToggle}
              />
            ))}
          </SortableContext>
        </DndContext>
      </PopoverContent>
    </Popover>
  )
}
