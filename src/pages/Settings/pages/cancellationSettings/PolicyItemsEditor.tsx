import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, Trash2 } from 'lucide-react'
import type { PolicyItem } from '../CancellationSettings'

// ポリシー項目エディタ
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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium text-sm">ポリシー項目</h4>
          <p className="text-xs text-muted-foreground">予約確認やサイトに表示される注意事項</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAdd}
          className="text-blue-600 border-blue-600 hover:bg-blue-50"
        >
          <Plus className="h-4 w-4 mr-1" />
          項目追加
        </Button>
      </div>

      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={item.id} className="flex items-start gap-2 p-2 border rounded-lg bg-white">
            <div className="flex flex-col gap-0.5 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 text-gray-400 hover:text-gray-600"
                onClick={() => onMoveUp(index)}
                disabled={index === 0}
              >
                ▲
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 text-gray-400 hover:text-gray-600"
                onClick={() => onMoveDown(index)}
                disabled={index === items.length - 1}
              >
                ▼
              </Button>
            </div>
            <div className="flex-1">
              <Input
                value={item.content}
                onChange={(e) => onUpdate(item.id, e.target.value)}
                placeholder="ポリシー内容を入力"
                className="text-sm"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRemove(item.id)}
              className="text-red-500 hover:text-red-600 hover:bg-red-50 h-9 w-9 p-0"
              disabled={items.length <= 1}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      {/* プレビュー */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
        <h5 className="text-xs font-medium mb-2">表示プレビュー</h5>
        <ul className="text-xs text-gray-700 space-y-1">
          {items.map((item) => (
            <li key={item.id}>• {item.content || '（未入力）'}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
