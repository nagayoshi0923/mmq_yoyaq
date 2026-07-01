import { SectionTitle } from '@/components/settings/SectionTitle'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Lock } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import type { CancellationSettings, CancellationFee } from '../CancellationSettings'
import { PolicyItemsEditor } from './PolicyItemsEditor'
import { CancellationFeesEditor } from './CancellationFeesEditor'

interface PrivatePolicySectionProps {
  formData: CancellationSettings
  setFormData: Dispatch<SetStateAction<CancellationSettings>>
  addPrivatePolicyItem: () => void
  removePrivatePolicyItem: (id: string) => void
  updatePrivatePolicyItem: (id: string, content: string) => void
  movePrivatePolicyItemUp: (index: number) => void
  movePrivatePolicyItemDown: (index: number) => void
  addPrivateCancellationFee: () => void
  removePrivateCancellationFee: (index: number) => void
  updatePrivateCancellationFee: (index: number, field: keyof CancellationFee, value: string | number) => void
}

export function PrivatePolicySection({ formData, setFormData, addPrivatePolicyItem, removePrivatePolicyItem, updatePrivatePolicyItem, movePrivatePolicyItemUp, movePrivatePolicyItemDown, addPrivateCancellationFee, removePrivateCancellationFee, updatePrivateCancellationFee }: PrivatePolicySectionProps) {
  return (
    <section className="bg-white rounded-xl border p-6">
      <SectionTitle
        icon={Lock}
        label="プライベート貸切のキャンセルポリシー"
        description="貸切予約者に適用される専用ポリシーです。通常公演より厳しい条件が設定できます。貸切申請フォームおよびキャンセルポリシーページに表示されます。"
      />
      <div className="space-y-6">
        <PolicyItemsEditor
          items={formData.private_cancellation_policy_items}
          onAdd={addPrivatePolicyItem}
          onRemove={removePrivatePolicyItem}
          onUpdate={updatePrivatePolicyItem}
          onMoveUp={movePrivatePolicyItemUp}
          onMoveDown={movePrivatePolicyItemDown}
        />

        <div className="space-y-1.5">
          <Label className="text-sm font-medium">補足説明（任意）</Label>
          <Textarea
            id="private_cancellation_policy"
            value={formData.private_cancellation_policy}
            onChange={(e) => setFormData(prev => ({ ...prev, private_cancellation_policy: e.target.value }))}
            placeholder="上記項目以外の補足説明があれば入力"
            rows={2}
          />
          <p className="text-xs text-muted-foreground">ポリシー項目に収まらない補足事項をご記入ください</p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-medium">キャンセル受付期限</Label>
          <div className="flex items-center gap-2">
            <Input
              id="private_cancellation_deadline_hours"
              type="number"
              value={formData.private_cancellation_deadline_hours}
              onChange={(e) => setFormData(prev => ({ ...prev, private_cancellation_deadline_hours: parseInt(e.target.value) || 0 }))}
              min="0"
              max="720"
              className="w-32"
            />
            <span className="text-sm text-muted-foreground">時間前まで受付</span>
          </div>
          <p className="text-xs text-muted-foreground">
            公演開始の{formData.private_cancellation_deadline_hours}時間前（{Math.floor(formData.private_cancellation_deadline_hours / 24)}日{formData.private_cancellation_deadline_hours % 24}時間前）までキャンセル可能
          </p>
        </div>

        <CancellationFeesEditor
          fees={formData.private_cancellation_fees}
          onAdd={addPrivateCancellationFee}
          onRemove={removePrivateCancellationFee}
          onUpdate={updatePrivateCancellationFee}
        />
      </div>
    </section>
  )
}
