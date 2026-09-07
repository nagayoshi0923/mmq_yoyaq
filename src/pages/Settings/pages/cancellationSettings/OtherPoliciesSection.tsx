import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Trash2 } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import type { CancellationSettings } from '../CancellationSettings'

interface OtherPoliciesSectionProps {
  formData: CancellationSettings
  setFormData: Dispatch<SetStateAction<CancellationSettings>>
  generateId: () => string
}

export function OtherPoliciesSection({ formData, setFormData, generateId }: OtherPoliciesSectionProps) {
  return (
    <>
      <section className="bg-white rounded-xl border p-6 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="ts-label mb-0">店舗都合によるキャンセル</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFormData(prev => ({
              ...prev,
              organizer_cancel_reasons: [
                ...prev.organizer_cancel_reasons,
                { id: generateId(), content: '' },
              ],
            }))}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            追加
          </Button>
        </div>
        {formData.organizer_cancel_reasons.map((reason) => (
          <div key={reason.id} className="flex items-center gap-2">
            <Input
              value={reason.content}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                organizer_cancel_reasons: prev.organizer_cancel_reasons.map(r =>
                  r.id === reason.id ? { ...r, content: e.target.value } : r
                ),
              }))}
              placeholder="理由"
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFormData(prev => ({
                ...prev,
                organizer_cancel_reasons: prev.organizer_cancel_reasons.filter(r => r.id !== reason.id),
              }))}
              className="text-destructive hover:bg-destructive/10 h-9 w-9 p-0"
              disabled={formData.organizer_cancel_reasons.length <= 1}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div>
          <label className="ts-label" htmlFor="organizer_cancel_refund_note">返金</label>
          <Textarea
            id="organizer_cancel_refund_note"
            value={formData.organizer_cancel_refund_note}
            onChange={(e) => setFormData(prev => ({ ...prev, organizer_cancel_refund_note: e.target.value }))}
            rows={2}
          />
        </div>
      </section>

      <section className="bg-white rounded-xl border p-6">
        <h3 className="ts-label">中止判定のタイミング</h3>
        <label className="ts-label" htmlFor="cancellation_notice_note">中止のときの連絡</label>
        <Textarea
          id="cancellation_notice_note"
          value={formData.cancellation_notice_note}
          onChange={(e) => setFormData(prev => ({ ...prev, cancellation_notice_note: e.target.value }))}
          rows={2}
        />
      </section>

      <section className="bg-white rounded-xl border p-6 space-y-4">
        <h3 className="ts-label">予約内容の変更</h3>
        <div className="space-y-1.5">
          <p className="ts-muted">通常公演 {formData.reservation_change_deadline_hours}時間前まで</p>
          <label className="ts-label" htmlFor="reservation_change_note">通常公演の補足</label>
          <Textarea
            id="reservation_change_note"
            value={formData.reservation_change_note}
            onChange={(e) => setFormData(prev => ({ ...prev, reservation_change_note: e.target.value }))}
            rows={2}
          />
        </div>
        <div className="space-y-1.5">
          <p className="ts-muted">貸切公演 {formData.private_reservation_change_deadline_hours}時間前まで</p>
          <label className="ts-label" htmlFor="private_reservation_change_note">貸切公演の補足</label>
          <Textarea
            id="private_reservation_change_note"
            value={formData.private_reservation_change_note}
            onChange={(e) => setFormData(prev => ({ ...prev, private_reservation_change_note: e.target.value }))}
            rows={2}
          />
        </div>
      </section>

      <section className="bg-white rounded-xl border p-6 space-y-4">
        <h3 className="ts-label">返金・キャンセル料のお支払い</h3>
        <div>
          <label className="ts-label" htmlFor="refund_method_note">返金について</label>
          <Textarea
            id="refund_method_note"
            value={formData.refund_method_note}
            onChange={(e) => setFormData(prev => ({ ...prev, refund_method_note: e.target.value }))}
            rows={2}
          />
        </div>
        <div>
          <label className="ts-label" htmlFor="policy_updated_at">最終更新日</label>
          <Input
            id="policy_updated_at"
            type="date"
            value={formData.policy_updated_at}
            onChange={(e) => setFormData(prev => ({ ...prev, policy_updated_at: e.target.value }))}
            className="w-48"
          />
        </div>
      </section>
    </>
  )
}
