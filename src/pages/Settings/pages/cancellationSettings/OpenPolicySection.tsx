import { SectionTitle } from '@/components/settings/SectionTitle'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Users } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import type { CancellationSettings, CancellationFee } from '../CancellationSettings'
import { PolicyItemsEditor } from './PolicyItemsEditor'
import { CancellationFeesEditor } from './CancellationFeesEditor'

interface OpenPolicySectionProps {
  formData: CancellationSettings
  setFormData: Dispatch<SetStateAction<CancellationSettings>>
  addPolicyItem: () => void
  removePolicyItem: (id: string) => void
  updatePolicyItem: (id: string, content: string) => void
  movePolicyItemUp: (index: number) => void
  movePolicyItemDown: (index: number) => void
  addCancellationFee: () => void
  removeCancellationFee: (index: number) => void
  updateCancellationFee: (index: number, field: keyof CancellationFee, value: string | number) => void
}

export function OpenPolicySection({ formData, setFormData, addPolicyItem, removePolicyItem, updatePolicyItem, movePolicyItemUp, movePolicyItemDown, addCancellationFee, removeCancellationFee, updateCancellationFee }: OpenPolicySectionProps) {
  return (
    <section className="bg-white rounded-xl border p-6">
      <SectionTitle
        icon={Users}
        label="通常公演のキャンセルポリシー"
        description="一般参加者が予約をキャンセルした際に適用されるポリシーです。予約確認メール・キャンセルポリシーページに表示されます。"
      />
      <div className="space-y-6">
        <PolicyItemsEditor
          items={formData.cancellation_policy_items}
          onAdd={addPolicyItem}
          onRemove={removePolicyItem}
          onUpdate={updatePolicyItem}
          onMoveUp={movePolicyItemUp}
          onMoveDown={movePolicyItemDown}
        />

        <div className="space-y-1.5">
          <Label className="text-sm font-medium">補足説明（任意）</Label>
          <Textarea
            id="cancellation_policy"
            value={formData.cancellation_policy}
            onChange={(e) => setFormData(prev => ({ ...prev, cancellation_policy: e.target.value }))}
            placeholder="上記項目以外の補足説明があれば入力"
            rows={2}
          />
          <p className="text-xs text-muted-foreground">ポリシー項目に収まらない補足事項をご記入ください</p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-medium">キャンセル受付期限</Label>
          <div className="flex items-center gap-2">
            <Input
              id="cancellation_deadline_hours"
              type="number"
              value={formData.cancellation_deadline_hours}
              onChange={(e) => setFormData(prev => ({ ...prev, cancellation_deadline_hours: parseInt(e.target.value) || 0 }))}
              min="0"
              max="720"
              className="w-32"
            />
            <span className="text-sm text-muted-foreground">時間前まで受付</span>
          </div>
          <p className="text-xs text-muted-foreground">
            公演開始の{formData.cancellation_deadline_hours}時間前（{Math.floor(formData.cancellation_deadline_hours / 24)}日{formData.cancellation_deadline_hours % 24}時間前）までキャンセル可能。期限を過ぎると参加者はキャンセル操作できなくなります。
          </p>
        </div>

        <CancellationFeesEditor
          fees={formData.cancellation_fees}
          onAdd={addCancellationFee}
          onRemove={removeCancellationFee}
          onUpdate={updateCancellationFee}
        />
      </div>
    </section>
  )
}
