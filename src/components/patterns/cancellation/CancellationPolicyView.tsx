import type { ReactNode } from 'react'
import { Clock, ExternalLink, Info } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  formatCancellationFeeBasis,
  formatCancellationFeePeriod,
  formatPolicyHours,
  type PublicCancellationPolicy,
  type PublicPolicyItem,
} from '@/lib/publicCancellationPolicy'
import {
  buildPublicCancellationPolicyPath,
  getOrganizationSlugFromPath,
} from '@/lib/publicBookingPath'
import { formatJstDateJa } from '@/utils/jstDate'
import type { CancellationFeeBasis, CancellationFeeRule } from '@/types'

interface CancellationPolicyLinkProps {
  organizationSlug?: string | null
  storeId?: string | null
  children?: ReactNode
  className?: string
}

export function CancellationPolicyLink({
  organizationSlug,
  storeId,
  children = '最新のキャンセルポリシーを確認',
  className,
}: CancellationPolicyLinkProps) {
  const slug = organizationSlug || getOrganizationSlugFromPath()
  return (
    <Link
      to={buildPublicCancellationPolicyPath(slug, storeId)}
      className={className || 'inline-flex items-center gap-1 underline text-primary'}
    >
      {children}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  )
}

interface PolicyTypeSectionProps {
  title: string
  items: PublicPolicyItem[]
  note: string | null
  deadlineHours: number | null
  fees: CancellationFeeRule[]
  feeBasis: CancellationFeeBasis | null
}

function formatPolicyDeadline(hours: number): string {
  return hours === 0 ? '開演時刻まで' : `公演開始の${formatPolicyHours(hours)}まで`
}

function PolicyTypeSection({
  title,
  items,
  note,
  deadlineHours,
  fees,
  feeBasis,
}: PolicyTypeSectionProps) {
  const sortedFees = [...fees].sort((a, b) => b.hours_before - a.hours_before)
  return (
    <section className="space-y-3">
      <h3 className="border-b pb-2">{title}</h3>

      {(items.length > 0 || note) && (
        <div className="space-y-2 ts-body text-muted-foreground">
          {items.length > 0 && (
            <ul className="list-disc pl-5 space-y-1">
              {items.map(item => <li key={item.id}>{item.content}</li>)}
            </ul>
          )}
          {note?.split('\n').map((line, index) => <p key={index}>{line}</p>)}
        </div>
      )}

      <div className="border bg-muted/20 p-3 space-y-1">
        <div className="flex items-center gap-2 ts-label">
          <Clock className="h-4 w-4" aria-hidden="true" />
          キャンセル受付期限
        </div>
        <p className="ts-body">
          {deadlineHours == null
            ? '店舗へお問い合わせください'
            : formatPolicyDeadline(deadlineHours)}
        </p>
      </div>

      <div className="border overflow-x-auto">
        <table className="w-full ts-body">
          <thead className="bg-muted/30">
            <tr className="border-b">
              <th className="p-3 text-left">キャンセル時期</th>
              <th className="p-3 text-right">キャンセル料</th>
            </tr>
          </thead>
          <tbody>
            {sortedFees.length === 0 ? (
              <tr>
                <td colSpan={2} className="p-3 text-muted-foreground">店舗へお問い合わせください</td>
              </tr>
            ) : sortedFees.map((fee, index) => (
              <tr key={`${fee.hours_before}-${index}`} className="border-b last:border-b-0">
                <td className="p-3">{formatCancellationFeePeriod(fee, sortedFees[index + 1])}</td>
                <td className="p-3 text-right">
                  {fee.fee_percentage === 0
                    ? '無料'
                    : `${formatCancellationFeeBasis(feeBasis)}の${fee.fee_percentage}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ts-muted">料金の計算基準: {formatCancellationFeeBasis(feeBasis)}</p>
    </section>
  )
}

interface CancellationPolicyViewProps {
  policy: PublicCancellationPolicy
  showStoreHeading?: boolean
}

export function CancellationPolicyView({
  policy,
  showStoreHeading = true,
}: CancellationPolicyViewProps) {
  const rulesByTiming = policy.cancellation_judgment_rules.reduce<Record<string, PublicCancellationPolicy['cancellation_judgment_rules']>>(
    (grouped, rule) => {
      grouped[rule.timing] ||= []
      grouped[rule.timing].push(rule)
      return grouped
    },
    {},
  )

  if (!policy.is_configured) {
    return (
      <section className="border bg-card p-5 space-y-2">
        {showStoreHeading && <h2>{policy.store_name}</h2>}
        <p className="ts-body text-muted-foreground">
          この店舗のキャンセルポリシーは現在準備中です。店舗へお問い合わせください。
        </p>
      </section>
    )
  }

  return (
    <article className="border bg-card p-5 md:p-6 space-y-7">
      {showStoreHeading && (
        <header className="flex flex-col gap-1 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="ts-muted">店舗別ポリシー</p>
            <h2>{policy.store_name}</h2>
          </div>
          {policy.policy_updated_at && (
            <p className="ts-muted">最終更新日: {formatJstDateJa(policy.policy_updated_at)}</p>
          )}
        </header>
      )}

      {policy.source === 'preview_default' && (
        <div className="border border-amber-300 bg-amber-50 p-3 ts-body text-amber-900">
          ローカル表示確認用の既定値です。公開RPCはまだDBへ適用されていません。
        </div>
      )}

      <PolicyTypeSection
        title="通常公演"
        items={policy.cancellation_policy_items}
        note={policy.cancellation_policy}
        deadlineHours={policy.cancellation_deadline_hours}
        fees={policy.cancellation_fees}
        feeBasis={policy.cancellation_fee_basis}
      />

      <PolicyTypeSection
        title="貸切公演"
        items={policy.private_cancellation_policy_items}
        note={policy.private_cancellation_policy}
        deadlineHours={policy.private_cancellation_deadline_hours}
        fees={policy.private_cancellation_fees}
        feeBasis={policy.private_cancellation_fee_basis}
      />

      {(policy.organizer_cancel_reasons.length > 0 || policy.organizer_cancel_refund_note) && (
        <section className="space-y-3">
          <h3 className="border-b pb-2">店舗都合によるキャンセル</h3>
          {policy.organizer_cancel_reasons.length > 0 && (
            <ul className="list-disc pl-5 space-y-1 ts-body text-muted-foreground">
              {policy.organizer_cancel_reasons.map(reason => <li key={reason.id}>{reason.content}</li>)}
            </ul>
          )}
          {policy.organizer_cancel_refund_note && <p className="ts-body">{policy.organizer_cancel_refund_note}</p>}
        </section>
      )}

      {(Object.keys(rulesByTiming).length > 0 || policy.cancellation_notice_note) && (
        <section className="border border-amber-300 bg-amber-50 p-4 space-y-3">
          <h3 className="ts-label flex items-center gap-2 text-amber-900">
            <Clock className="h-4 w-4" aria-hidden="true" />
            中止判定のタイミング
          </h3>
          {Object.entries(rulesByTiming).map(([timing, rules]) => (
            <div key={timing} className="ts-body text-amber-900">
              <p>{timing}</p>
              <ul className="list-disc pl-5">
                {rules.map(rule => <li key={rule.id}>{rule.condition} → {rule.result}</li>)}
              </ul>
            </div>
          ))}
          {policy.cancellation_notice_note && <p className="ts-body text-amber-900">{policy.cancellation_notice_note}</p>}
        </section>
      )}

      {(policy.reservation_change_deadline_hours != null
        || policy.reservation_change_note
        || policy.private_reservation_change_deadline_hours != null
        || policy.private_reservation_change_note) && (
        <section className="space-y-3">
          <h3 className="border-b pb-2">予約内容の変更</h3>
          {(policy.reservation_change_deadline_hours != null || policy.reservation_change_note) && (
            <div className="ts-body space-y-1">
              <p className="ts-label">通常公演</p>
              {policy.reservation_change_deadline_hours != null && (
                <p>変更受付期限: {formatPolicyDeadline(policy.reservation_change_deadline_hours)}</p>
              )}
              {policy.reservation_change_note && <p>{policy.reservation_change_note}</p>}
            </div>
          )}
          {(policy.private_reservation_change_deadline_hours != null || policy.private_reservation_change_note) && (
            <div className="ts-body space-y-1">
              <p className="ts-label">貸切公演</p>
              {policy.private_reservation_change_deadline_hours != null && (
                <p>変更受付期限: {formatPolicyDeadline(policy.private_reservation_change_deadline_hours)}</p>
              )}
              {policy.private_reservation_change_note && <p>{policy.private_reservation_change_note}</p>}
            </div>
          )}
        </section>
      )}

      {policy.refund_method_note && (
        <section className="border bg-muted/20 p-4">
          <h3 className="ts-label flex items-center gap-2 mb-2">
            <Info className="h-4 w-4" aria-hidden="true" />
            返金・キャンセル料のお支払い
          </h3>
          <p className="ts-body text-muted-foreground">{policy.refund_method_note}</p>
        </section>
      )}
    </article>
  )
}
