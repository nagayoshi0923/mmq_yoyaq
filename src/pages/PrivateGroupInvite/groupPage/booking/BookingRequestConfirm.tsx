/**
 * 申込シートの 2 段目: 申し込む内容の確認・連絡先の電話番号・注意事項とキャンセル規定（作品ページ・概要タブと同じ BookingNotice）・同意。
 */
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BookingNotice } from '@/pages/ScenarioDetailPage/components/BookingNotice'
import type { SheetCandidate } from './requestSheetModel'

interface BookingRequestConfirmProps {
  picked: ReadonlyArray<SheetCandidate>
  storeNames: ReadonlyArray<string>
  participants: number
  priceText: string | null
  notes: string
  phone: string
  onPhoneChange: (v: string) => void
  agreed: boolean
  onAgreedChange: (v: boolean) => void
  orgSlug: string | null
  scenarioMasterId: string | null
  /** 店舗が 1 つならその店舗のキャンセル規定を開いておく */
  policyStoreId: string | null
  hasPreReading: boolean
  disabled: boolean
}

export function BookingRequestConfirm(props: BookingRequestConfirmProps) {
  const { picked, storeNames, participants, priceText, notes, phone, onPhoneChange, agreed, onAgreedChange, orgSlug, scenarioMasterId, policyStoreId, hasPreReading, disabled } = props
  return (
    <div className="flex flex-col gap-4" data-testid="request-confirm">
      <section aria-label="申し込む内容">
        <h2 className="text-sm font-bold">申し込む内容</h2>
        <dl className="mt-1.5 divide-y divide-border rounded-lg border border-border text-sm">
          <Row label="候補日">
            <ol className="space-y-0.5">
              {picked.map((c, i) => <li key={c.id}>第 {i + 1} 希望 {c.label}</li>)}
            </ol>
          </Row>
          <Row label="希望店舗">{storeNames.join('、')}{storeNames.length > 1 ? '（どれでも可）' : ''}</Row>
          <Row label="参加人数">{participants} 名</Row>
          {priceText && <Row label="料金の目安">{priceText}</Row>}
          {notes.trim() && <Row label="店舗への連絡"><span className="whitespace-pre-wrap">{notes.trim()}</span></Row>}
        </dl>
      </section>

      <section className="space-y-1" aria-label="連絡先">
        <Label htmlFor="request-phone" className="text-sm font-bold">連絡先の電話番号 <span className="text-xs font-normal text-red-700">必須</span></Label>
        <p className="text-xs text-muted-foreground">店舗から日程の確認などで連絡することがあります。</p>
        <Input id="request-phone" type="tel" value={phone} onChange={e => onPhoneChange(e.target.value)} placeholder="090-1234-5678" autoComplete="tel" className="text-sm" disabled={disabled} />
      </section>

      <BookingNotice mode="private" organizationSlug={orgSlug} scenarioMasterId={scenarioMasterId} storeId={policyStoreId} hasPreReading={hasPreReading} defaultPolicyOpen={Boolean(policyStoreId)} />

      <label className="flex items-start gap-2 text-sm" htmlFor="request-agree">
        <Checkbox id="request-agree" checked={agreed} onCheckedChange={v => onAgreedChange(v === true)} className="mt-0.5" disabled={disabled} data-testid="request-agree" />
        <span>注意事項とキャンセル規定を確認し、同意します</span>
      </label>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-3 py-2">
      <dt className="w-20 shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  )
}
