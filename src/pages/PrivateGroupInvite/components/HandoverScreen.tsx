/**
 * 主催者の引き継ぎ確認画面（グループページの ?sheet=handover。段階 3、案 B）。
 * 新主催者（宛先）が、引き継ぐ貸切・自分の連絡先・注意事項・キャンセルポリシーを確かめて同意する。
 * 同意すると private_group_handover_accept が 1 トランザクションで主催者・申込者・チャット・店舗への知らせを切り替える。
 * 予約に規定が固定済み（申込時のスナップショット）ならその版を出し、同意の記録にもその版が残る。未固定なら現在の公開規定。
 */
import { useEffect, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PolicyTypeSection } from '@/components/patterns/cancellation/CancellationPolicyView'
import { BookingNotice } from '@/pages/ScenarioDetailPage/components/BookingNotice'
import { HandoverDeclineButton } from '@/pages/MyPage/components/PrivateBookingCards/HandoverDeclineButton'
import { formatHandoverDeadline } from '@/pages/MyPage/components/PrivateBookingCards/privateGroupHandover'
import { privateGroupRpcApi } from '@/lib/api/privateGroupRpcApi'
import { upsertOwnCustomer } from '@/lib/api/customerApi'
import { fetchPublicCancellationPolicies } from '@/lib/publicCancellationPolicy'
import { getErrorMessage } from '@/lib/errorFields'
import { formatJstDateJa, formatJstMonthDay } from '@/utils/jstDate'
import { logger } from '@/utils/logger'
import type { useAuth } from '@/contexts/AuthContext'
import {
  HANDOVER_STAGE_LABEL,
  displayedPolicyRecord,
  handoverPolicyStoreId,
  handoverStage,
  isValidHandoverPhone,
  type HandoverDetail,
} from '../handoverDetail'

interface HandoverScreenProps {
  /** 進行中の依頼の id（グループの読み取り結果の handover）。無ければ「終わっています」を出す */
  requestId: string | null
  user: ReturnType<typeof useAuth>['user']
  onBack: () => void
  /** 同意・お断りのあと（グループの読み直し） */
  onFinished: () => void | Promise<unknown>
}

const hhmm = (time?: string | null) => (time ? time.slice(0, 5) : '')

function Section({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <section className="bg-card border border-border p-3 space-y-2" data-testid={testId}>
      <h2 className="text-sm font-bold">{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2 py-1 border-b border-border last:border-b-0">
      <dt className="w-24 shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="flex-1 min-w-0 text-xs text-foreground break-words">{children}</dd>
    </div>
  )
}

export function HandoverScreen({ requestId, user, onBack, onFinished }: HandoverScreenProps) {
  const queryClient = useQueryClient()
  const detailQuery = useQuery({
    queryKey: ['private-group-handover-detail', requestId],
    enabled: Boolean(requestId && user),
    queryFn: async (): Promise<HandoverDetail> => {
      const { data, error } = await privateGroupRpcApi.readHandoverDetail(requestId!)
      if (error) throw error
      return data as HandoverDetail
    },
  })
  const detail = detailQuery.data ?? null
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // 連絡先の初期値は新主催者の顧客情報から（直せる）
  useEffect(() => {
    if (!detail?.my_contact) return
    setName(prev => prev || detail.my_contact?.name || '')
    setPhone(prev => prev || detail.my_contact?.phone || '')
  }, [detail?.my_contact])

  const back = (
    <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-3">
      <ArrowLeft className="w-4 h-4" aria-hidden="true" />
      グループに戻る
    </button>
  )

  const frame = (children: ReactNode) => (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <div className="container mx-auto max-w-lg px-4 py-4 flex-1 space-y-3" data-testid="handover-screen">
        {back}
        {children}
      </div>
    </div>
  )

  if (!requestId) {
    return frame(
      <p className="bg-card border border-border p-4 text-sm text-muted-foreground" data-testid="handover-closed">
        進行中の主催者の引き継ぎ依頼はありません（期限切れ・取り消し・お断り・同意済みのいずれかです）。
      </p>,
    )
  }
  if (detailQuery.isLoading || !detail) {
    return frame(
      detailQuery.error ? (
        <p className="bg-card border border-destructive/40 p-4 text-sm">{getErrorMessage(detailQuery.error) || '依頼を読み込めませんでした'}</p>
      ) : (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          読み込み中…
        </div>
      ),
    )
  }

  const req = detail.request
  const r = detail.reservation
  const stage = handoverStage(detail)
  const storeId = handoverPolicyStoreId(detail)
  const fixed = r?.policy ?? null
  const price = r?.total_price ?? detail.group.total_price
  const people = r?.participant_count ?? detail.members.length
  const deadline = formatHandoverDeadline(req.expires_at)
  const open = req.status === 'requested'
  const phoneOk = isValidHandoverPhone(phone)
  const canSubmit = open && req.is_recipient && agreed && name.trim().length > 0 && phoneOk && !submitting

  const accept = async () => {
    if (!user || !canSubmit) return
    setSubmitting(true)
    try {
      const email = detail.my_contact?.email || user.email || ''
      const customerId = await upsertOwnCustomer({ userId: user.id, name: name.trim(), phone: phone.trim(), email, organizationId: null })
      if (!customerId) throw new Error('お客様情報を保存できませんでした')
      // 規定が予約に固定されていないときだけ、画面に出した現在の規定を記録に添える（固定版は DB 側で記録する）
      let displayedPolicy: Record<string, unknown> | null = null
      if (!fixed) {
        const policies = storeId && detail.group.organization_slug
          ? await fetchPublicCancellationPolicies({ organizationSlug: detail.group.organization_slug, storeId, scenarioMasterId: detail.group.scenario_master_id }).catch(error => {
            logger.warn('同意時の規定の読み込みに失敗:', error)
            return []
          })
          : []
        displayedPolicy = displayedPolicyRecord(storeId, policies, detail.group.preferred_store_ids ?? [])
      }
      const { data, error } = await privateGroupRpcApi.acceptHandover(req.id, customerId, name.trim(), phone.trim(), displayedPolicy)
      if (error) throw error
      const result = data as { ok?: boolean; status?: string; store_notified?: boolean } | null
      if (!result?.ok) {
        toast.error(result?.status === 'expired' ? 'この依頼は期限が切れています' : 'この依頼はすでに終わっています')
      } else {
        toast.success(result.store_notified ? '主催者を引き継ぎました。店舗にも申込者の変更を知らせました' : '主催者を引き継ぎました')
      }
      await queryClient.invalidateQueries({ queryKey: ['mypage-data'], refetchType: 'all' }).catch(err => logger.warn('一覧の読み直しに失敗:', err))
      await onFinished()
    } catch (err) {
      logger.error('主催者の引き継ぎに同意できませんでした', err)
      toast.error(getErrorMessage(err) || '主催者の引き継ぎに同意できませんでした')
    } finally {
      setSubmitting(false)
    }
  }

  return frame(
    <>
      <h1 className="text-base font-bold">主催者の引き継ぎ</h1>

      <section className="bg-purple-50 border border-purple-200 p-3 space-y-1 text-sm text-purple-900" aria-label="依頼の案内" data-testid="handover-intro">
        {open ? (
          <>
            <p><span className="font-bold">{req.from_name}さん</span>から、この貸切の主催者の引き継ぎを頼まれています。</p>
            <p>引き継ぐと、あなたが<span className="font-bold">申込者（店舗への連絡先・キャンセル料の負担者）</span>になります。同意するまでは{req.from_name}さんが主催者のままです。</p>
            <p className="text-xs">期限: {deadline}（72 時間）</p>
          </>
        ) : (
          <p>この依頼は終わっています（{req.status === 'accepted' ? '同意済み' : req.status === 'declined' ? 'お断り済み' : req.status === 'expired' ? '期限切れ' : '取り消し済み'}）。</p>
        )}
        {!req.is_recipient && open && <p className="text-xs">あなたが依頼した引き継ぎです。{req.to_name}さんの同意を待っています。</p>}
      </section>

      <Section title="引き継ぐ貸切" testId="handover-booking">
        <dl>
          <Row label="作品">{detail.scenario?.title ?? '-'}</Row>
          <Row label="状態">{HANDOVER_STAGE_LABEL[stage]}</Row>
          {stage === 'confirmed' && r?.confirmed ? (
            <>
              <Row label="日時">{formatJstDateJa(r.confirmed.date, true)} {hhmm(r.confirmed.start_time)}{r.confirmed.end_time ? `〜${hhmm(r.confirmed.end_time)}` : ''}</Row>
              <Row label="会場">{r.confirmed.store_name ?? '-'}</Row>
            </>
          ) : (
            <Row label="候補日">
              {(() => {
                const dates = stage === 'requested' && r
                  ? r.candidates.map(c => ({ date: c.date, start: c.startTime, end: c.endTime }))
                  : detail.candidate_dates.map(d => ({ date: d.date, start: d.start_time, end: d.end_time }))
                return dates.length ? (
                  <ul className="space-y-0.5">
                    {dates.map((d, i) => (
                      <li key={`${d.date}-${i}`}>{d.date ? formatJstMonthDay(d.date, true) : '-'} {hhmm(d.start)}{d.end ? `〜${hhmm(d.end)}` : ''}</li>
                    ))}
                  </ul>
                ) : 'まだありません'
              })()}
            </Row>
          )}
          <Row label="参加人数">{people} 名{r?.participant_count ? '（申込時）' : ''}</Row>
          <Row label="料金">{price != null ? `¥${price.toLocaleString()}` : '申込のときに決まります'}</Row>
          <Row label="いまの申込者">{r ? `${r.customer_name ?? '-'}（${req.from_name}さん）` : `申込前（主催者 ${req.from_name}さん）`}</Row>
          <Row label="予約番号">{r?.reservation_number ?? '申込前'}</Row>
          <Row label="メンバー">
            <ul className="space-y-0.5" data-testid="handover-members">
              {detail.members.map(m => (
                <li key={m.id} className={m.is_me ? 'font-bold text-purple-800' : undefined}>
                  {m.name}{m.is_me ? '（あなた）' : ''}{m.is_organizer ? '・主催者' : ''}{m.is_guest ? '・ゲスト' : ''}
                </li>
              ))}
            </ul>
          </Row>
        </dl>
      </Section>

      {req.is_recipient && open && (
        <Section title="あなたの連絡先" testId="handover-contact">
          <p className="text-xs text-muted-foreground">引き継ぐと、申込者の連絡先として店舗に伝わります。</p>
          <div className="space-y-1">
            <Label htmlFor="handover-name" className="text-xs">お名前</Label>
            <Input id="handover-name" value={name} onChange={e => setName(e.target.value)} autoComplete="name" className="text-sm" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="handover-phone" className="text-xs">電話番号</Label>
            <Input id="handover-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="090-1234-5678" autoComplete="tel" className="text-sm" />
            {phone.trim() !== '' && !phoneOk && <p className="text-xs text-destructive">電話番号は 10〜11 桁で入力してください</p>}
          </div>
          {detail.my_contact?.email && <p className="text-xs text-muted-foreground">メール: {detail.my_contact.email}</p>}
        </Section>
      )}

      <BookingNotice
        mode="private"
        scenarioMasterId={detail.group.scenario_master_id}
        organizationSlug={detail.group.organization_slug}
        storeId={storeId}
        defaultPolicyOpen={Boolean(fixed)}
        fixedPolicy={fixed ? (
          <div className="space-y-2" data-testid="handover-fixed-policy">
            <p className="border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              この予約には申込時に固定された規定が適用されます{fixed.store_name ? `（${fixed.store_name}・${formatJstDateJa(fixed.updated_at)} 時点）` : ''}。
            </p>
            <PolicyTypeSection
              title={fixed.performance_type === 'private' ? '貸切公演（申込時に固定）' : '通常公演（申込時に固定）'}
              items={[]}
              note={null}
              deadlineHours={fixed.deadline_hours}
              fees={fixed.fees}
              feeBasis={fixed.fee_basis}
            />
          </div>
        ) : undefined}
      />

      {req.is_recipient && open && (
        <section className="space-y-3 pb-6" aria-label="同意">
          <label className="flex items-start gap-2 text-sm cursor-pointer" htmlFor="handover-agree">
            <Checkbox id="handover-agree" checked={agreed} onCheckedChange={v => setAgreed(v === true)} className="mt-0.5" aria-labelledby="handover-agree-text" />
            <span id="handover-agree-text">注意事項とキャンセルポリシーを確認し、この貸切の申込者として引き継ぐことに同意します</span>
          </label>
          <Button
            type="button"
            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
            disabled={!canSubmit}
            onClick={() => void accept()}
            data-testid="handover-accept"
          >
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" /> : null}
            同意して主催者を引き継ぐ
          </Button>
          <div className="flex justify-center">
            <HandoverDeclineButton
              requestId={req.id}
              fromName={req.from_name}
              label="引き継がない（依頼を断る）"
              className="text-sm text-muted-foreground"
              onDone={onFinished}
            />
          </div>
        </section>
      )}
    </>,
  )
}
