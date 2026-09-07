import { Textarea } from '@/components/ui/textarea'
import type { Dispatch, SetStateAction } from 'react'
import type { CancellationSettings } from '../CancellationSettings'
import { PolicyItemsEditor } from './PolicyItemsEditor'

interface PrivatePolicySectionProps {
  formData: CancellationSettings
  setFormData: Dispatch<SetStateAction<CancellationSettings>>
  addPrivatePolicyItem: () => void
  removePrivatePolicyItem: (id: string) => void
  updatePrivatePolicyItem: (id: string, content: string) => void
  movePrivatePolicyItemUp: (index: number) => void
  movePrivatePolicyItemDown: (index: number) => void
}

export function PrivatePolicySection({
  formData,
  setFormData,
  addPrivatePolicyItem,
  removePrivatePolicyItem,
  updatePrivatePolicyItem,
  movePrivatePolicyItemUp,
  movePrivatePolicyItemDown,
}: PrivatePolicySectionProps) {
  return (
    <section className="bg-white rounded-xl border p-6 space-y-4">
      <h3 className="ts-label">貸切公演</h3>
      <PolicyItemsEditor
        items={formData.private_cancellation_policy_items}
        onAdd={addPrivatePolicyItem}
        onRemove={removePrivatePolicyItem}
        onUpdate={updatePrivatePolicyItem}
        onMoveUp={movePrivatePolicyItemUp}
        onMoveDown={movePrivatePolicyItemDown}
      />
      <div>
        <label className="ts-label" htmlFor="private_cancellation_policy">補足（任意）</label>
        <Textarea
          id="private_cancellation_policy"
          value={formData.private_cancellation_policy}
          onChange={(e) => setFormData(prev => ({ ...prev, private_cancellation_policy: e.target.value }))}
          placeholder="項目以外に出す文があれば入力"
          rows={2}
        />
      </div>
    </section>
  )
}
