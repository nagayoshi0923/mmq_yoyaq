import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { assessCancellationFee, type BillingReservation } from '../../../src/lib/cancellationBilling.js'

/** Record the fee separately from seat release; an unknown fee must not block cancellation. */
export async function recordCancellationIntake(db: SupabaseClient, input: {
  organizationId: string; reservationId: string; reservation: BillingReservation;
  eventDate: string; startTime: string; receivedAt: string | null; processedAt: string;
  actorId: string; previouslyCancelled: boolean; organizerCancelled: boolean;
}) {
  const assessment = assessCancellationFee({ reservation: input.reservation, eventDate: input.eventDate,
    startTime: input.startTime, receivedAt: input.receivedAt, processedAt: input.processedAt,
    cause: input.organizerCancelled ? 'organizer' : 'customer' })
  // A retry must never overwrite the original receipt timestamp or fee decision.
  const { data: existing, error } = await db.from('cancellation_billing_claims').select('id')
    .eq('organization_id', input.organizationId).eq('reservation_id', input.reservationId).maybeSingle()
  if (error) throw new Error('キャンセル料台帳の確認に失敗しました')
  if (existing || input.previouslyCancelled) return
  const id = randomUUID()
  const { error: insertError } = await db.from('cancellation_billing_claims').upsert({ id,
    organization_id: input.organizationId, reservation_id: input.reservationId,
    data: { id, organizationId: input.organizationId, reservationId: input.reservationId,
      contact: { channel: input.receivedAt ? 'mmq' : 'manual' },
      assessment, amount: assessment.amount ?? 0, payerName: '', accountIds: [], accountId: null,
      receivedAt: input.receivedAt ?? '', processedAt: input.processedAt, actorId: input.actorId,
      receiptEvidence: input.receivedAt ? '顧客本人のMMQキャンセルAPI受付' : 'スタッフ操作。元のキャンセル連絡の受付時刻を要確認。',
      notifiedAt: null, dueAt: null, paidAt: null, reminderSentAt: null, paidNoticeSentAt: null },
  }, { onConflict: 'organization_id,reservation_id', ignoreDuplicates: true })
  if (insertError) throw new Error('キャンセル料台帳への受付保存に失敗しました')
}
