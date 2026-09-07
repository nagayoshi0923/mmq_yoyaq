import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, Trash2 } from 'lucide-react'
import type { CancellationFee } from '../CancellationSettings'

interface CancellationFeesEditorProps {
  fees: CancellationFee[]
  onAdd: () => void
  onRemove: (index: number) => void
  onUpdate: (index: number, field: keyof CancellationFee, value: string | number) => void
}

export function CancellationFeesEditor({ fees, onAdd, onRemove, onUpdate }: CancellationFeesEditorProps) {
  return (
    <div className="space-y-2">
      {fees.map((fee, index) => (
        <div key={index} className="flex items-center gap-2">
          {fee.hours_before < 0 ? (
            <span className="ts-muted w-32 shrink-0">公演開始後</span>
          ) : (
            <>
              <Input
                type="number"
                value={fee.hours_before}
                onChange={(e) => onUpdate(index, 'hours_before', parseInt(e.target.value) || 0)}
                className="w-32"
              />
              <span className="ts-muted">時間前</span>
            </>
          )}
          <Input
            type="number"
            value={fee.fee_percentage}
            onChange={(e) => onUpdate(index, 'fee_percentage', parseInt(e.target.value) || 0)}
            min={0}
            max={100}
            className="w-24"
          />
          <span className="ts-muted">%</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRemove(index)}
            className="text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
            disabled={fees.length <= 1}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={onAdd}>
        <Plus className="h-4 w-4 mr-1" />
        追加
      </Button>
    </div>
  )
}
