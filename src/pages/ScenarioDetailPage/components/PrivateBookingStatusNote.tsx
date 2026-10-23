import type { PrivateBookingStatus } from '@/lib/privateBookingAcceptance'

interface PrivateBookingStatusNoteProps {
  status: PrivateBookingStatus
  /** 公演予定（予約できる公演）があるか。無いときは「公演予定が無くても」と書く */
  hasEvents: boolean
  /** 貸切リクエストのタブ（日程相談）を開く */
  onOpenPrivate: () => void
}

/**
 * 作品ページの「貸切受付中」（2026-10-24 社長: 公演日が無くても貸切を受け付けていることを分かるように。QW-20261023-001）。
 * - accepting: 「貸切受付中」と日程相談（貸切リクエストのタブ）へのボタン
 * - closed: 貸切募集期間外・公演期間の終了（既存の理由 not_recruiting の文面）
 * - not_accepting（貸切受付 OFF・出張限定）・paused（上演できる店舗がすべて募集停止中）・no_store・unknown（判定に要る値を読めていない）: 何も出さない
 * 「貸切受付中」は日程の相談を始められるという意味で、空き枠の保証ではない（文面でもそう書く）。
 */
export function PrivateBookingStatusNote({ status, hasEvents, onOpenPrivate }: PrivateBookingStatusNoteProps) {
  if (status === 'closed') {
    return (
      <p data-testid="private-booking-status" className="border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        この作品は現在貸切を募集していません
      </p>
    )
  }
  if (status !== 'accepting') return null
  return (
    <div data-testid="private-booking-status" className="space-y-2 border border-purple-200 bg-purple-50 px-3 py-2">
      <span className="inline-block border border-purple-300 bg-white px-1.5 py-0.5 text-xs font-bold text-purple-700">貸切受付中</span>
      <p className="text-xs text-purple-900">
        {hasEvents ? '公演日以外の日も、貸切リクエストで日程を相談できます。' : '公演予定はありませんが、貸切リクエストで日程を相談できます。'}
        日程はご相談のうえ決まります（空きは日程を選ぶときに確かめます）。
      </p>
      <button
        type="button"
        onClick={onOpenPrivate}
        className="w-full border border-purple-300 bg-white px-2.5 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100"
      >
        日程を相談する（貸切リクエスト） ›
      </button>
    </div>
  )
}
