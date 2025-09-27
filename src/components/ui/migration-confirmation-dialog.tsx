import React from 'react'
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

interface MigrationConfirmationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemName: string
  itemType: string // "参加費", "GM報酬", "ライセンス料"
  existingAmount: number
  newAmount: number
  usageCount: number
  onConfirm: () => void
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
  const handleConfirm = () => {
    onConfirm()
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
            「{itemName}」の新しい設定を追加しますか？
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* 既存設定の情報 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 text-blue-700 font-medium mb-2">
              📋 既存の設定
            </div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-blue-600 text-sm">
                現在の金額: {formatCurrency(existingAmount)}
              </span>
              <Badge variant="default" className="text-xs bg-green-100 text-green-700 border-green-200">
                使用中{usageCount}件
              </Badge>
            </div>
            <p className="text-blue-600 text-sm">
              この設定は現在{usageCount}件の公演で使用されています。
            </p>
          </div>

          {/* 新しい設定の情報 */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 text-green-700 font-medium mb-2">
              ✨ 新しい設定
            </div>
            <p className="text-green-600 text-sm">
              新しい金額: {formatCurrency(newAmount)}
            </p>
          </div>

          {/* 変更内容の説明 */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-yellow-700 font-medium mb-2">
              🔄 変更内容
            </div>
            <ul className="text-yellow-600 text-sm space-y-1">
              <li>• 既存の設定は「過去のみ」に変更されます</li>
              <li>• 新しい設定が「使用中」になります</li>
              <li>• 過去の公演データは既存の金額で保持されます</li>
              <li>• 今後の公演は新しい金額で計算されます</li>
            </ul>
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
