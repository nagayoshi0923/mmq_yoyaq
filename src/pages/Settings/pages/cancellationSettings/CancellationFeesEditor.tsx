import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Plus, Trash2 } from 'lucide-react'
import type { CancellationFee } from '../CancellationSettings'

// キャンセル料金コンポーネント
interface CancellationFeesEditorProps {
  fees: CancellationFee[]
  onAdd: () => void
  onRemove: (index: number) => void
  onUpdate: (index: number, field: keyof CancellationFee, value: string | number) => void
}

export function CancellationFeesEditor({ fees, onAdd, onRemove, onUpdate }: CancellationFeesEditorProps) {
  // キャンセル料金をプレビュー表示
  const getPreviewText = () => {
    const sorted = [...fees].sort((a, b) => b.hours_before - a.hours_before)
    return sorted.map(fee => {
      const days = Math.floor(fee.hours_before / 24)
      const hours = fee.hours_before % 24
      let timeText = ''
      
      if (days > 0) {
        timeText = `${days}日`
        if (hours > 0) timeText += `${hours}時間`
      } else if (hours > 0) {
        timeText = `${hours}時間`
      } else {
        timeText = '当日'
      }
      
      return `${timeText}前: ${fee.fee_percentage}% ${fee.description ? `(${fee.description})` : ''}`
    }).join('\n')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium text-sm">キャンセル料金</h4>
          <p className="text-xs text-muted-foreground">キャンセルするタイミングに応じて料金を設定</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAdd}
          className="text-blue-600 border-blue-600 hover:bg-blue-50"
        >
          <Plus className="h-4 w-4 mr-1" />
          追加
        </Button>
      </div>

      <div className="space-y-3">
        {fees.map((fee, index) => (
          <div key={index} className="border rounded-lg p-3">
            <div className="grid grid-cols-12 gap-3 items-start">
              <div className="col-span-3">
                <Label className="text-xs">何時間前</Label>
                <Input
                  type="number"
                  value={fee.hours_before}
                  onChange={(e) => onUpdate(index, 'hours_before', parseInt(e.target.value) || 0)}
                  min="0"
                  className="text-sm mt-1"
                />
                <p className="text-xs text-muted-foreground mt-0.5">
                  {Math.floor(fee.hours_before / 24)}日{fee.hours_before % 24 > 0 ? `${fee.hours_before % 24}時間` : ''}前
                </p>
              </div>
              <div className="col-span-3">
                <Label className="text-xs">キャンセル料率</Label>
                <div className="flex items-center gap-1 mt-1">
                  <Input
                    type="number"
                    value={fee.fee_percentage}
                    onChange={(e) => onUpdate(index, 'fee_percentage', parseInt(e.target.value) || 0)}
                    min="0"
                    max="100"
                    className="text-sm"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
              <div className="col-span-5">
                <Label className="text-xs">説明</Label>
                <Input
                  type="text"
                  value={fee.description}
                  onChange={(e) => onUpdate(index, 'description', e.target.value)}
                  placeholder="例: 1週間前まで無料"
                  className="text-sm mt-1"
                />
              </div>
              <div className="col-span-1 flex justify-end items-start pt-5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(index)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0"
                  disabled={fees.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* プレビュー */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
        <h5 className="text-xs font-medium mb-1">プレビュー</h5>
        <pre className="text-xs text-gray-700 whitespace-pre-wrap">
          {getPreviewText()}
        </pre>
      </div>
    </div>
  )
}
