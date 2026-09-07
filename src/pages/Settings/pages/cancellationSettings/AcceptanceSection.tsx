import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Dispatch, SetStateAction } from 'react'
import type { CancellationFeeBasis } from '@/types'
import type { CancellationFee, CancellationSettings } from '../CancellationSettings'
import { CancellationFeesEditor } from './CancellationFeesEditor'
import { DeadlineRow } from './DeadlineRow'

interface AcceptanceSectionProps {
  formData: CancellationSettings
  setFormData: Dispatch<SetStateAction<CancellationSettings>>
  addCancellationFee: () => void
  removeCancellationFee: (index: number) => void
  updateCancellationFee: (index: number, field: keyof CancellationFee, value: string | number) => void
  addPrivateCancellationFee: () => void
  removePrivateCancellationFee: (index: number) => void
  updatePrivateCancellationFee: (index: number, field: keyof CancellationFee, value: string | number) => void
}

export function AcceptanceSection({
  formData,
  setFormData,
  addCancellationFee,
  removeCancellationFee,
  updateCancellationFee,
  addPrivateCancellationFee,
  removePrivateCancellationFee,
  updatePrivateCancellationFee,
}: AcceptanceSectionProps) {
  return (
    <section className="bg-white rounded-xl border p-6 space-y-8">
      <div>
        <label className="ts-label" htmlFor="cancellation_deadline_hours">
          マイページからキャンセルできる期間
        </label>
        <div className="space-y-3">
          <DeadlineRow
            id="cancellation_deadline_hours"
            scope="通常公演"
            value={formData.cancellation_deadline_hours}
            onChange={(cancellation_deadline_hours) => setFormData(prev => ({ ...prev, cancellation_deadline_hours }))}
          />
          <DeadlineRow
            id="private_cancellation_deadline_hours"
            scope="貸切公演"
            value={formData.private_cancellation_deadline_hours}
            onChange={(private_cancellation_deadline_hours) => setFormData(prev => ({ ...prev, private_cancellation_deadline_hours }))}
          />
        </div>
      </div>

      <div>
        <p className="ts-label">ポリシーに出す予約変更の期限</p>
        <div className="space-y-3">
          <DeadlineRow
            id="reservation_change_deadline_hours"
            scope="通常公演"
            value={formData.reservation_change_deadline_hours}
            onChange={(reservation_change_deadline_hours) => setFormData(prev => ({ ...prev, reservation_change_deadline_hours }))}
          />
          <DeadlineRow
            id="private_reservation_change_deadline_hours"
            scope="貸切公演"
            value={formData.private_reservation_change_deadline_hours}
            onChange={(private_reservation_change_deadline_hours) => setFormData(prev => ({ ...prev, private_reservation_change_deadline_hours }))}
          />
        </div>
      </div>

      <div>
        <p className="ts-label">キャンセル料</p>
        <div className="space-y-5">
          <FeeGroup
            scope="通常公演"
            basis={formData.cancellation_fee_basis}
            onBasisChange={(cancellation_fee_basis) => setFormData(prev => ({ ...prev, cancellation_fee_basis }))}
            fees={formData.cancellation_fees}
            onAdd={addCancellationFee}
            onRemove={removeCancellationFee}
            onUpdate={updateCancellationFee}
            allowUntilCapacity
          />
          <FeeGroup
            scope="貸切公演"
            basis={formData.private_cancellation_fee_basis}
            onBasisChange={(private_cancellation_fee_basis) => setFormData(prev => ({ ...prev, private_cancellation_fee_basis }))}
            fees={formData.private_cancellation_fees}
            onAdd={addPrivateCancellationFee}
            onRemove={removePrivateCancellationFee}
            onUpdate={updatePrivateCancellationFee}
          />
        </div>
      </div>
    </section>
  )
}

function FeeGroup({
  scope,
  basis,
  onBasisChange,
  fees,
  onAdd,
  onRemove,
  onUpdate,
  allowUntilCapacity = false,
}: {
  scope: string
  basis: CancellationFeeBasis
  onBasisChange: (value: CancellationFeeBasis) => void
  fees: CancellationFee[]
  onAdd: () => void
  onRemove: (index: number) => void
  onUpdate: (index: number, field: keyof CancellationFee, value: string | number) => void
  allowUntilCapacity?: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="ts-muted w-20 shrink-0">{scope}</span>
        <Select value={basis} onValueChange={(value: CancellationFeeBasis) => onBasisChange(value)}>
          <SelectTrigger className="w-full md:w-[28rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="participant_total">予約時の参加料金合計</SelectItem>
            {allowUntilCapacity && (
              <SelectItem value="participant_until_capacity">定数に達したあとは公演価格全額</SelectItem>
            )}
            <SelectItem value="performance_total">公演価格全額</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <CancellationFeesEditor
        fees={fees}
        onAdd={onAdd}
        onRemove={onRemove}
        onUpdate={onUpdate}
      />
    </div>
  )
}
