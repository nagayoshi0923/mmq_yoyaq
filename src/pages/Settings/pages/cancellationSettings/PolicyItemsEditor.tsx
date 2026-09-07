import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, Trash2 } from 'lucide-react'
import type { PolicyItem } from '../CancellationSettings'

interface PolicyItemsEditorProps {
  items: PolicyItem[]
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, content: string) => void
  onMoveUp: (index: number) => void
  onMoveDown: (index: number) => void
}

export function PolicyItemsEditor({ items, onAdd, onRemove, onUpdate, onMoveUp, onMoveDown }: PolicyItemsEditorProps) {
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={item.id} className="flex items-center gap-2">
          <div className="flex flex-col">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-muted-foreground"
              onClick={() => onMoveUp(index)}
              disabled={index === 0}
            >
              ▲
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-muted-foreground"
              onClick={() => onMoveDown(index)}
              disabled={index === items.length - 1}
            >
              ▼
            </Button>
          </div>
          <Input
            value={item.content}
            onChange={(e) => onUpdate(item.id, e.target.value)}
            placeholder="お客に見せる文"
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRemove(item.id)}
            className="text-destructive hover:bg-destructive/10 h-9 w-9 p-0"
            disabled={items.length <= 1}
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
