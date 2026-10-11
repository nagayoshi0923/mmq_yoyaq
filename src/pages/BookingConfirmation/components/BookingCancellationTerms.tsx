/**
 * 予約確認画面のキャンセル規定の要点と、48 時間以内の公演の注意（点検 20・34）。
 * 取消期限を過ぎた公演は、同意のチェックを入れてから予約できる。
 */
import { AlertTriangle, Info } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { CancellationPolicyLink } from '@/components/patterns/cancellation/CancellationPolicyView'
import type { BookingCancellationTerms as Terms } from '../hooks/useBookingCancellationTerms'

interface Props {
  terms: Terms | null
  agreed: boolean
  onAgreedChange: (agreed: boolean) => void
  eventId: string
  storeId?: string
  organizationSlug?: string
}

export function BookingCancellationTerms({ terms, agreed, onAgreedChange, eventId, storeId, organizationSlug }: Props) {
  return (
    <div className="space-y-2" data-testid="booking-cancellation-terms">
      {terms?.insideNoFreeCancelWindow && (
        <Card className="border-2 border-red-300 bg-red-50" data-testid="booking-late-cancel-warning">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-start gap-2 text-red-800">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div className="text-sm">
                <p className="font-bold">この公演はマイページから取消できません</p>
                <p className="mt-1">
                  開演まで{terms.freeHoursLabel.replace(/前$/, '')}を切っているため、予約後の取消は店舗へのお問い合わせが必要で、キャンセル料がかかります。
                </p>
              </div>
            </div>
            <label className="flex min-h-11 items-center gap-3 border border-red-200 bg-background px-3 py-2 text-sm font-medium text-red-900">
              <Checkbox
                checked={agreed}
                onCheckedChange={checked => onAgreedChange(checked === true)}
                aria-describedby="late-cancel-warning-text"
                data-testid="booking-late-cancel-agree"
              />
              <span id="late-cancel-warning-text">取消にはキャンセル料がかかることを確認しました</span>
            </label>
          </CardContent>
        </Card>
      )}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-1">キャンセルについて</h3>
        <Card>
          <CardContent className="p-3 space-y-1 text-xs">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="space-y-1">
                {terms ? (
                  <>
                    <p className="font-medium text-foreground">{terms.summary}</p>
                    {!terms.insideNoFreeCancelWindow && (
                      <p className="text-muted-foreground">この公演を無料で取消できるのは <span className="font-medium text-foreground">{terms.freeDeadlineLabel}</span> までです。</p>
                    )}
                    {terms.changeDeadlineLabel && (
                      <p className="text-muted-foreground">人数の変更（減らす・増やす）は公演の{terms.changeDeadlineLabel}までマイページからできます。</p>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">キャンセル規定を読み込んでいます…</p>
                )}
                <CancellationPolicyLink
                  eventId={eventId}
                  organizationSlug={organizationSlug}
                  storeId={storeId}
                  className="inline-flex items-center gap-1 underline text-primary"
                >
                  キャンセルポリシーの全文
                </CancellationPolicyLink>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
