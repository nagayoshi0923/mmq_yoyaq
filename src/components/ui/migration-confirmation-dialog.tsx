import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatusBadge } from '@/components/ui/status-badge'

// アイコンコンポーネント
const ClipboardIcon = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 2a1 1 0 000 2h4a1 1 0 100-2H8z" fill="currentColor"/>
    <path d="M3 5a2 2 0 012-2 3 3 0 003 3h4a3 3 0 003-3 2 2 0 012 2v6h-4.586l1.293-1.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L13.586 13H18v3a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" fill="currentColor"/>
  </svg>
)

const SparkleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" fill="currentColor"/>
  </svg>
)

const CalendarIcon = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zM4 9h12v7H4V9z" fill="currentColor"/>
  </svg>
)

const RefreshIcon = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" fill="currentColor"/>
  </svg>
)

interface MigrationConfirmationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemName: string
  itemType: string // "参加費", "GM報酬", "ライセンス料"
  existingAmount: number
  newAmount: number
  usageCount: number
  onConfirm: (startDate?: string) => void // 適用開始日を追加
  onCancel: () => void
}

export const MigrationConfirmationDialog: React.FC<MigrationConfirmationDialogProps> = ({
  open,
  onOpenChange,
  itemName,
  itemType,
  existingAmount,
  newAmount,
  usageCount,
  onConfirm,
  onCancel
}) => {
  const [startTiming, setStartTiming] = useState<'now' | 'tomorrow' | 'custom'>('now')
  const [customDate, setCustomDate] = useState('')

  const handleConfirm = () => {
    let startDate: string | undefined
    
    if (startTiming === 'tomorrow') {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      startDate = tomorrow.toISOString().split('T')[0]
    } else if (startTiming === 'custom') {
      startDate = customDate
    }
    // 'now'の場合はstartDate = undefinedのまま
    
    onConfirm(startDate)
    onOpenChange(false)
  }

  const handleCancel = () => {
    onCancel()
    onOpenChange(false)
  }

  const formatCurrency = (amount: number) => {
    return `${amount.toLocaleString()}円`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {itemType}の設定変更確認
          </DialogTitle>
          <DialogDescription>
            「{itemName}」の設定を変更しますか？
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* 設定変更の概要表示 */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm font-medium">現在の設定:</span>
            <span className="text-sm">{itemName} {existingAmount.toLocaleString()}円</span>
            <StatusBadge status="active" usageCount={usageCount} />
          </div>

          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm font-medium">変更後の設定:</span>
            <span className="text-sm">{itemName} {newAmount.toLocaleString()}円</span>
            <StatusBadge status="ready" />
          </div>

          {/* 警告メッセージ */}
          {usageCount > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2 text-red-700 font-medium mb-2">
                ⚠️ 使用中のデータです
              </div>
              <p className="text-red-600 text-sm">
                この設定は現在{usageCount}件の公演で使用されています。変更すると過去の計算結果に影響する可能性があります。
              </p>
            </div>
          )}

          {/* 適用開始タイミング選択 */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 text-gray-700 font-medium mb-3">
              <CalendarIcon />
              適用開始タイミングを選択してください
            </div>
            
            <div className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="startTiming"
                  value="now"
                  checked={startTiming === 'now'}
                  onChange={(e) => setStartTiming(e.target.value as 'now' | 'tomorrow' | 'custom')}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium text-gray-700">今すぐ適用</div>
                  <div className="text-sm text-gray-600">
                    即座に新しい設定に切り替わります。現在進行中の公演にも影響します。
                  </div>
                </div>
              </label>
              
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="startTiming"
                  value="tomorrow"
                  checked={startTiming === 'tomorrow'}
                  onChange={(e) => setStartTiming(e.target.value as 'now' | 'tomorrow' | 'custom')}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium text-gray-700">明日から適用（推奨）</div>
                  <div className="text-sm text-gray-600">
                    今日の公演は既存設定を維持し、明日以降の公演から新設定を適用します。
                  </div>
                </div>
              </label>
              
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="startTiming"
                  value="custom"
                  checked={startTiming === 'custom'}
                  onChange={(e) => setStartTiming(e.target.value as 'now' | 'tomorrow' | 'custom')}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-700">指定日から適用</div>
                  <div className="text-sm text-gray-600 mb-2">
                    特定の日付から新しい設定を適用します。
                  </div>
                  {startTiming === 'custom' && (
                    <Input
                      type="date"
                      value={customDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                      className="w-full"
                      min={new Date().toISOString().split('T')[0]}
                    />
                  )}
                </div>
              </label>
            </div>
          </div>

          {/* 変更内容の詳細説明 */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-700 font-medium mb-2">
              <RefreshIcon />
              変更内容の詳細
            </div>
            <ul className="text-gray-600 text-sm space-y-1">
              <li>• 既存の設定（{existingAmount.toLocaleString()}円）は「以前の設定」ステータスに変更されます</li>
              <li>• 新しい設定（{newAmount.toLocaleString()}円）が「使用中」ステータスになります</li>
              <li>• 過去{usageCount}件の公演データは既存の金額で保持されます</li>
              <li>• {startTiming === 'now' ? '今後の公演は即座に' : 
                   startTiming === 'tomorrow' ? '明日以降の公演は' : 
                   `${customDate}以降の公演は`}新しい金額で計算されます</li>
            </ul>
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="text-gray-600 text-xs">
                ⚠️ この操作は取り消せません。変更後は設定を復元することはできません。
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
          >
            キャンセル
          </Button>
          <Button
            variant="default"
            onClick={handleConfirm}
          >
            変更を実行
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
