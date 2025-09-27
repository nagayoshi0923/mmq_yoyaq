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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface DeleteConfirmationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemName: string
  itemType: string // "参加費", "GM報酬", "ライセンス料"
  usageCount?: number
  status?: 'active' | 'legacy' | 'unused' | 'ready'
  scenarioName?: string // シナリオ名確認用
  requireScenarioNameConfirmation?: boolean // シナリオ名入力を必須にするか
  onConfirm: (action: 'delete' | 'archive') => void // 削除またはアーカイブのアクション
}

export const DeleteConfirmationDialog: React.FC<DeleteConfirmationDialogProps> = ({
  open,
  onOpenChange,
  itemName,
  itemType,
  usageCount = 0,
  status,
  scenarioName,
  requireScenarioNameConfirmation = false,
  onConfirm
}) => {
  const [scenarioNameInput, setScenarioNameInput] = useState('')
  const [selectedAction, setSelectedAction] = useState<'delete' | 'archive'>('archive')
  
  const handleConfirm = () => {
    // シナリオ名確認が必要な場合、入力値をチェック
    if (requireScenarioNameConfirmation && scenarioName) {
      if (scenarioNameInput !== scenarioName) {
        alert('シナリオ名が正しくありません。正確に入力してください。')
        return
      }
    }
    
    onConfirm(selectedAction)
    onOpenChange(false)
    setScenarioNameInput('') // リセット
    setSelectedAction('archive') // リセット
  }
  
  // ダイアログが閉じられた時にリセット
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setScenarioNameInput('')
    }
    onOpenChange(open)
  }

  const getStatusBadge = () => {
    if (!status) return null

    switch (status) {
      case 'active':
        return (
          <Badge variant="default" className="bg-green-100 text-green-700 border-green-200">
            使用中{usageCount}件
          </Badge>
        )
      case 'legacy':
        return (
          <Badge variant="secondary" className="bg-blue-100 text-blue-700 border-blue-200">
            🔵過去のみ{usageCount}件
          </Badge>
        )
      case 'ready':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">
            待機設定
          </Badge>
        )
      case 'unused':
        return (
          <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200">
            未設定
          </Badge>
        )
      default:
        return null
    }
  }

  const getWarningMessage = () => {
    if (status === 'active' && usageCount > 0) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 text-red-700 font-medium mb-2">
            ⚠️ 使用中のデータです
          </div>
          <p className="text-red-600 text-sm">
            この設定は現在{usageCount}件の公演で使用されています。削除すると過去の計算結果に影響する可能性があります。
          </p>
        </div>
      )
    }

    if (status === 'legacy' && usageCount > 0) {
      return (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 text-blue-700 font-medium mb-2">
            ℹ️ 過去データで使用中
          </div>
          <p className="text-blue-600 text-sm">
            この設定は過去{usageCount}件の公演で使用されているため削除できません。
          </p>
        </div>
      )
    }

    return null
  }

  const canDelete = status !== 'legacy'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {itemType}の削除確認
          </DialogTitle>
          <DialogDescription>
            「{itemName}」の設定を削除しますか？
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* ステータス表示 */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm font-medium">現在のステータス:</span>
            {getStatusBadge()}
          </div>

          {/* 警告メッセージ */}
          {getWarningMessage()}

          {/* シナリオ名入力（必要な場合） */}
          {requireScenarioNameConfirmation && scenarioName && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2 text-yellow-700 font-medium mb-2">
                🔐 削除確認
              </div>
              <p className="text-yellow-600 text-sm mb-3">
                重要なデータの削除のため、シナリオ名の入力が必要です。
              </p>
              <Label htmlFor="scenario-name-input" className="text-sm font-medium">
                シナリオ名「{scenarioName}」を入力してください:
              </Label>
              <Input
                id="scenario-name-input"
                type="text"
                value={scenarioNameInput}
                onChange={(e) => setScenarioNameInput(e.target.value)}
                placeholder={scenarioName}
                className="mt-1"
              />
            </div>
          )}

          {/* 削除オプション選択 */}
          {canDelete && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-gray-700 font-medium mb-3">
                🔧 削除方法を選択してください
              </div>
              
              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="deleteAction"
                    value="archive"
                    checked={selectedAction === 'archive'}
                    onChange={(e) => setSelectedAction(e.target.value as 'delete' | 'archive')}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-medium text-gray-700">アーカイブ（推奨）</div>
                    <div className="text-sm text-gray-600">
                      設定を「過去のみ」に変更します。過去の公演データは保持されます。
                    </div>
                  </div>
                </label>
                
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="deleteAction"
                    value="delete"
                    checked={selectedAction === 'delete'}
                    onChange={(e) => setSelectedAction(e.target.value as 'delete' | 'archive')}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-medium text-gray-700">完全削除</div>
                    <div className="text-sm text-gray-600">
                      設定を完全に削除し、過去の公演も再計算されます。
                    </div>
                  </div>
                </label>
              </div>
              
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-gray-600 text-xs">
                  ⚠️ この操作は取り消せません。
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            キャンセル
          </Button>
          {canDelete && (
            <Button
              variant={selectedAction === 'delete' ? 'destructive' : 'default'}
              onClick={handleConfirm}
              disabled={requireScenarioNameConfirmation && scenarioName && scenarioNameInput !== scenarioName}
            >
              {selectedAction === 'delete' ? '完全削除' : 'アーカイブ'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
