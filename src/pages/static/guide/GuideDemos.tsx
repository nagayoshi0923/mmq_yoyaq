/**
 * 使い方ガイドの画面例（点検 2026-10-11 の 22）。
 * - ログインしなくても見られる画面: staging につないだ手元の 375px の実画面を撮った画像（public/guide-images/）
 * - ログインが要る画面（マイページの貸切カード・グループページ）: 実際の部品に見本の値を入れて出す。
 *   押しても動かない（画面例なので、操作は受け付けない）。
 */
import type { ReactNode } from 'react'
import { MoreVertical, MousePointerClick } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PrivateBookingCard } from '@/pages/MyPage/components/PrivateBookingCards/PrivateBookingCard'
import type { PrivateBookingItem } from '@/pages/MyPage/components/PrivateBookingCards/privateBookingModel'
import { GroupStatusBox } from '@/pages/PrivateGroupInvite/groupPage/GroupStatusBox'
import { GroupTabBar } from '@/pages/PrivateGroupInvite/groupPage/GroupTabBar'
import type { GroupStatusView } from '@/pages/PrivateGroupInvite/groupPage/groupPageModel'

/** 実画面の画像（スマホ 375px） */
export function GuideShot({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  return (
    <figure className="mx-auto w-full max-w-[320px]">
      <div className="overflow-hidden rounded-xl border-4 border-zinc-800 bg-background shadow-md">
        <img src={src} alt={alt} width={375} height={760} loading="lazy" className="block w-full h-auto" />
      </div>
      {caption && <figcaption className="mt-2 text-center ts-muted">{caption}</figcaption>}
    </figure>
  )
}

/** 画面例の枠（見本の値を入れた実際の部品を囲む） */
export function DemoFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-border bg-muted/30 overflow-hidden">
      <div className="px-3 py-1.5 bg-muted border-b border-border ts-muted">{label}</div>
      <div className="p-3 pointer-events-none select-none" aria-hidden="true">{children}</div>
    </div>
  )
}

/** 画面のどこを見るかの一言 */
export function Annotation({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-900 ts-body rounded-lg">
      <MousePointerClick className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}

const SAMPLE_MENU: PrivateBookingItem['menu'] = {
  inviteCode: null,
  organizationId: null,
  reservationNumber: null,
  phase: 'pre_request',
  memberCount: 4,
  candidateDates: 3,
  confirmedDate: null,
  hasSurvey: false,
  hasUnansweredDates: true,
  myMemberId: null,
  members: [],
  handover: null,
}

const SAMPLE_CARD: PrivateBookingItem = {
  key: 'guide-sample',
  groupId: null,
  reservationId: null,
  title: '白いウサギは歌わない',
  imageUrl: 'https://cznpcewciwywcqcxktba.supabase.co/storage/v1/object/public/key-visuals/1770883605761-6jmuke.jpg',
  isOrganizer: false,
  hostLabel: 'はなこさんが主催',
  action: 'answer_dates',
  label: '日程に回答する',
  section: 'action',
  progress: { steps: ['招待', '候補日', '回答', '申込', '確定'], current: 2 },
  showProgress: true,
  tone: 'purple',
  primaryTone: 'purple',
  compact: false,
  headcount: '4/8名',
  whenWhere: null,
  description: '候補日 3 件のうち 3 件が未回答です。都合を回答してください',
  href: '/guide',
  primary: { label: '日程に回答する', href: '/guide' },
  secondary: { label: 'グループを開く', href: '/guide' },
  sortKey: '',
  menu: SAMPLE_MENU,
  handover: null,
  calendar: null,
}

/** マイページの「貸切」のカード（見本） */
export function DemoPrivateCard() {
  return (
    <DemoFrame label="マイページ › 貸切（画面例）">
      <PrivateBookingCard
        item={SAMPLE_CARD}
        actions={(
          <Button type="button" variant="outline" size="sm" tabIndex={-1} className="h-7 px-2.5 gap-1 text-xs rounded-md bg-background border-zinc-300 text-foreground">
            <MoreVertical className="w-3.5 h-3.5" aria-hidden="true" />
            操作
          </Button>
        )}
      />
    </DemoFrame>
  )
}

const SAMPLE_STATUS: GroupStatusView = {
  action: 'proceed_booking',
  tone: 'purple',
  primaryTone: 'purple',
  chip: '申込に進む',
  sub: '4人中 4人が回答済み',
  body: '候補日 3 件の回答がそろいました。店舗に送る候補日を選んで申し込みます。複数の候補日を送ると、店舗がその中から 1 つ確定します。',
  primary: { kind: 'book', label: '候補日を選んで店舗に申し込む' },
  secondary: [{ kind: 'edit_dates', label: '候補日を編集' }, { kind: 'send_invite', label: '招待リンクを送る' }],
  oneLine: '申込に進む・4人中 4人が回答済み',
}

/** グループページの上部（いまの状態の箱とタブ。見本） */
export function DemoGroupTop() {
  return (
    <DemoFrame label="グループページ（画面例）">
      <div className="space-y-3">
        <GroupStatusBox view={SAMPLE_STATUS} onAction={() => {}} />
        <GroupTabBar active="dates" desktopActive="dates" onChange={() => {}} unread={2} />
      </div>
    </DemoFrame>
  )
}
