/**
 * 申込シートの「1. 候補日」。選んだ日を上に優先順で並べ（番号つき）、その下に選んでいない日。
 * 押すと選ぶ／外す。並べ替えは右端のつまみ（ドラッグ）か上下のボタン。
 */
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import type { SheetCandidate } from './requestSheetModel'

interface RequestCandidateListProps {
  candidates: ReadonlyArray<SheetCandidate>
  picks: ReadonlyArray<string>
  /** 希望店舗のどこにも空きが無い日の理由（選べない） */
  blockedReason: (id: string) => string | null
  /** 選んだ店舗には空きが無い日の注意（選べる） */
  warning: (id: string) => string | null
  onToggle: (id: string) => void
  onMove: (from: number, to: number) => void
  disabled?: boolean
}

export function RequestCandidateList({ candidates, picks, blockedReason, warning, onToggle, onMove, disabled = false }: RequestCandidateListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const picked = picks.map(id => candidates.find(c => c.id === id)).filter((c): c is SheetCandidate => Boolean(c))
  const rest = candidates.filter(c => !picks.includes(c.id))

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    onMove(picks.indexOf(String(active.id)), picks.indexOf(String(over.id)))
  }

  if (candidates.length === 0) {
    return <p className="py-3 text-sm text-muted-foreground">候補日がありません。日程タブで候補日を追加してください。</p>
  }

  return (
    <div className="flex flex-col gap-2" data-testid="request-candidates">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={[...picks]} strategy={verticalListSortingStrategy}>
          {picked.map((c, i) => (
            <PickedRow
              key={c.id}
              c={c}
              rank={i + 1}
              count={picked.length}
              warning={warning(c.id)}
              disabled={disabled}
              onToggle={() => onToggle(c.id)}
              onUp={() => onMove(i, i - 1)}
              onDown={() => onMove(i, i + 1)}
            />
          ))}
        </SortableContext>
      </DndContext>
      {rest.map(c => {
        const reason = blockedReason(c.id)
        return (
          <button
            key={c.id}
            type="button"
            disabled={disabled || reason !== null}
            onClick={() => onToggle(c.id)}
            aria-pressed={false}
            className="flex items-center gap-2.5 rounded-lg border border-zinc-300 bg-background px-3 py-2.5 text-left hover:bg-muted disabled:cursor-not-allowed disabled:bg-muted/60 disabled:hover:bg-muted/60"
            data-testid="request-candidate"
            data-picked="false"
          >
            <span className="h-[22px] w-[22px] shrink-0 rounded-full border border-zinc-300 bg-background" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className={`block text-sm font-bold ${reason ? 'text-muted-foreground line-through' : 'text-foreground/70'}`}>{c.label}</span>
              <span className="block text-xs text-muted-foreground">{reason ?? `${c.tally} ・ ${c.note}`}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function PickedRow({ c, rank, count, warning, disabled, onToggle, onUp, onDown }: {
  c: SheetCandidate
  rank: number
  count: number
  warning: string | null
  disabled: boolean
  onToggle: () => void
  onUp: () => void
  onDown: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: c.id, disabled })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1.5 rounded-lg border-2 border-violet-600 bg-violet-50 py-1.5 pl-3 pr-1 ${isDragging ? 'relative z-10 shadow-lg' : ''}`}
      data-testid="request-candidate"
      data-picked="true"
      data-rank={rank}
    >
      <button type="button" onClick={onToggle} disabled={disabled} aria-pressed={true} aria-label={`第 ${rank} 希望 ${c.label}（押すと外します）`} className="flex min-w-0 flex-1 items-center gap-2.5 py-1 text-left">
        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white" aria-hidden="true">{rank}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">{c.label}</span>
          <span className="block text-xs text-muted-foreground">{c.tally} ・ {c.note}</span>
          {warning && <span className="block text-xs text-amber-700">{warning}</span>}
        </span>
      </button>
      <span className="flex shrink-0 flex-col">
        <button type="button" onClick={onUp} disabled={disabled || rank === 1} aria-label={`${c.label} の優先を上げる`} className="rounded-md p-1 text-violet-700 hover:bg-violet-100 disabled:text-zinc-300 disabled:hover:bg-transparent">
          <ChevronUp className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={onDown} disabled={disabled || rank === count} aria-label={`${c.label} の優先を下げる`} className="rounded-md p-1 text-violet-700 hover:bg-violet-100 disabled:text-zinc-300 disabled:hover:bg-transparent">
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
      </span>
      <button
        type="button"
        className="shrink-0 cursor-grab touch-none rounded-md p-1.5 text-muted-foreground hover:bg-violet-100 active:cursor-grabbing"
        aria-label={`${c.label} をドラッグして並べ替える`}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
