import { Textarea } from '@/components/ui/textarea'
import type { Dispatch, SetStateAction } from 'react'
import type { CancellationSettings } from '../CancellationSettings'
import { PolicyItemsEditor } from './PolicyItemsEditor'

interface OpenPolicySectionProps {
  formData: CancellationSettings
  setFormData: Dispatch<SetStateAction<CancellationSettings>>
  addPolicyItem: () => void
  removePolicyItem: (id: string) => void
  updatePolicyItem: (id: string, content: string) => void
  movePolicyItemUp: (index: number) => void
  movePolicyItemDown: (index: number) => void
}

export function OpenPolicySection({
  formData,
  setFormData,
  addPolicyItem,
  removePolicyItem,
  updatePolicyItem,
  movePolicyItemUp,
  movePolicyItemDown,
}: OpenPolicySectionProps) {
  return (
    <section className="bg-white rounded-xl border p-6 space-y-4">
      <h3 className="ts-label">通常公演</h3>
      <PolicyItemsEditor
        items={formData.cancellation_policy_items}
        onAdd={addPolicyItem}
        onRemove={removePolicyItem}
        onUpdate={updatePolicyItem}
        onMoveUp={movePolicyItemUp}
        onMoveDown={movePolicyItemDown}
      />
      <div>
        <label className="ts-label" htmlFor="cancellation_policy">補足（任意）</label>
        <Textarea
          id="cancellation_policy"
          value={formData.cancellation_policy}
          onChange={(e) => setFormData(prev => ({ ...prev, cancellation_policy: e.target.value }))}
          placeholder="項目以外に出す文があれば入力"
          rows={2}
        />
      </div>
    </section>
  )
}
