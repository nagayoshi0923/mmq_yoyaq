import { useState } from 'react'
import { ChevronDown, ChevronUp, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PrivateBookingCard } from './PrivateBookingCard'
import { PrivateBookingCardActions } from './PrivateBookingCardActions'
import type { PrivateBookingItem, PrivateBookingView } from './privateBookingModel'

/** 確定した貸切は 2 件まで出して、残りは「あと ○ 件表示」で展開 */
const CONFIRMED_INITIAL = 2

function SectionTitle({ children, count }: { children: string; count: number }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
      {children}
      <span className="text-xs font-normal text-muted-foreground tabular-nums">{count}件</span>
    </h3>
  )
}

function CardList({ items }: { items: PrivateBookingItem[] }) {
  return (
    <div className="space-y-3">
      {items.map(item => <PrivateBookingCard key={item.key} item={item} actions={<PrivateBookingCardActions item={item} />} />)}
    </div>
  )
}

interface PrivateBookingSectionsProps {
  view: PrivateBookingView
  /** 「キャンセル済み」サブタブへ切り替える */
  onShowCancelled: () => void
}

/** 貸切サブタブ: あなたの対応が必要 → 店舗の返事待ち → 主催者の準備待ち → 確定した貸切 → 終了した貸切・取り下げた申込 */
export function PrivateBookingSections({ view, onShowCancelled }: PrivateBookingSectionsProps) {
  const [showAllConfirmed, setShowAllConfirmed] = useState(false)
  const [showEnded, setShowEnded] = useState(false)
  const { action, waiting_store: waitingStore, waiting_organizer: waitingOrganizer, confirmed, ended } = view.bySection
  const total = action.length + waitingStore.length + waitingOrganizer.length + confirmed.length + ended.length

  if (total === 0 && view.cancelledCount === 0) {
    return (
      <div className="bg-card border border-border p-8 text-center ts-muted rounded-none">
        <Users className="w-8 h-8 mx-auto mb-2 text-purple-300" aria-hidden="true" />
        <p>貸切の申込み・グループはまだありません</p>
        <p className="ts-caption mt-2">招待ページから参加するか、作品ページから貸切をリクエストできます</p>
      </div>
    )
  }

  const visibleConfirmed = showAllConfirmed ? confirmed : confirmed.slice(0, CONFIRMED_INITIAL)
  const hiddenConfirmed = confirmed.length - visibleConfirmed.length
  const endedTotal = ended.length + view.cancelledCount

  return (
    <div className="space-y-6">
      {action.length > 0 && (
        <section className="space-y-2" aria-label="あなたの対応が必要">
          <SectionTitle count={action.length}>あなたの対応が必要</SectionTitle>
          <CardList items={action} />
        </section>
      )}

      {waitingStore.length > 0 && (
        <section className="space-y-2" aria-label="店舗の返事待ち">
          <SectionTitle count={waitingStore.length}>店舗の返事待ち</SectionTitle>
          <CardList items={waitingStore} />
        </section>
      )}

      {waitingOrganizer.length > 0 && (
        <section className="space-y-2" aria-label="主催者の準備待ち">
          <SectionTitle count={waitingOrganizer.length}>主催者の準備待ち</SectionTitle>
          <CardList items={waitingOrganizer} />
        </section>
      )}

      {confirmed.length > 0 && (
        <section className="space-y-2" aria-label="確定した貸切">
          <SectionTitle count={confirmed.length}>確定した貸切</SectionTitle>
          <CardList items={visibleConfirmed} />
          {(hiddenConfirmed > 0 || showAllConfirmed) && confirmed.length > CONFIRMED_INITIAL && (
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-none"
              aria-expanded={showAllConfirmed}
              onClick={() => setShowAllConfirmed(v => !v)}
            >
              {showAllConfirmed ? '閉じる' : `あと ${hiddenConfirmed} 件表示`}
            </Button>
          )}
        </section>
      )}

      {endedTotal > 0 && (
        <section className="space-y-2" aria-label="終了した貸切・取り下げた申込">
          <button
            type="button"
            className="w-full flex items-center justify-between p-3 bg-muted border border-border hover:bg-accent transition-colors rounded-none"
            aria-expanded={showEnded}
            onClick={() => setShowEnded(v => !v)}
          >
            <span className="text-sm font-bold text-foreground">終了した貸切・取り下げた申込</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
              {endedTotal}件
              {showEnded ? <ChevronUp className="w-4 h-4" aria-hidden="true" /> : <ChevronDown className="w-4 h-4" aria-hidden="true" />}
            </span>
          </button>
          {showEnded && (
            <div className="space-y-3">
              {ended.length > 0 && <CardList items={ended} />}
              {view.cancelledCount > 0 && (
                <div className="flex items-center justify-between gap-2 p-3 border border-border bg-card rounded-none">
                  <span className="text-xs text-muted-foreground">取り下げ・キャンセルした申込 {view.cancelledCount}件</span>
                  <Button type="button" size="sm" variant="outline" className="h-8 text-xs rounded-none" onClick={onShowCancelled}>
                    キャンセル済みを見る
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
