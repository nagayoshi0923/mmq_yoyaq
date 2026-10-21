/**
 * 貸切の流れ（/guide/private）の画面例。
 * グループページの実際の部品（いまの状態の箱・タブ・日程の回答表・申込シートの候補日）に見本の値を入れて小さく出す。
 * データは読まない（静的な見本）。押しても動かない（DemoFrame が操作を受け付けない）。
 */
import { GroupStatusBox } from '@/pages/PrivateGroupInvite/groupPage/GroupStatusBox'
import { GroupTabBar } from '@/pages/PrivateGroupInvite/groupPage/GroupTabBar'
import { DateAnswerTable } from '@/pages/PrivateGroupInvite/groupPage/DateAnswerTable'
import { RequestCandidateList } from '@/pages/PrivateGroupInvite/groupPage/booking/RequestCandidateList'
import type { SheetCandidate } from '@/pages/PrivateGroupInvite/groupPage/booking/requestSheetModel'
import { AFTER_TABS, type AnswerTable, type GroupStatusView, type GroupTab } from '@/pages/PrivateGroupInvite/groupPage/groupPageModel'
import { DemoFrame } from './GuideDemos'

const noop = () => {}

/** いまの状態の箱（とタブ）の見本 */
function StatusDemo({ label, view, tab, tabs }: { label: string; view: GroupStatusView; tab?: GroupTab; tabs?: typeof AFTER_TABS }) {
  return (
    <DemoFrame label={label}>
      <div className="space-y-3">
        <GroupStatusBox view={view} onAction={noop} />
        {tab && <GroupTabBar active={tab} desktopActive={tab} onChange={noop} unread={0} tabs={tabs} />}
      </div>
    </DemoFrame>
  )
}

const PICK_DATES: GroupStatusView = {
  action: 'pick_dates',
  tone: 'purple',
  primaryTone: 'purple',
  chip: '候補日を決める',
  sub: null,
  body: '候補日を登録すると、メンバーが都合を回答できます（参加 3 人）',
  primary: { kind: 'add_dates', label: '候補日を追加' },
  secondary: [{ kind: 'send_invite', label: '招待リンクを送る' }],
  oneLine: '候補日を決める・候補日はまだありません',
}

/** 3. グループページの上（いまの状態の箱とタブ） */
export function DemoGroupOverviewTop() {
  return <StatusDemo label="グループページ（画面例・主催者）" view={PICK_DATES} tab="overview" />
}

const ME = 'm1'
const ANSWER_TABLE: AnswerTable = {
  columns: [
    { memberId: ME, name: 'はなこ', role: 'organizer', isMe: true, answeredAll: true },
    { memberId: 'm2', name: 'たろう', role: 'member', isMe: false, answeredAll: true },
    { memberId: 'm3', name: 'じろう', role: 'guest', isMe: false, answeredAll: true },
  ],
  rows: [
    { id: 'c1', date: '2026-11-13', dateLabel: '11/13(金)', slotLabel: '夜', startTime: '19:00', rejected: false, cells: { [ME]: 'ok', m2: 'maybe', m3: 'ng' }, ok: 1, maybe: 1, ng: 1 },
    { id: 'c2', date: '2026-11-14', dateLabel: '11/14(土)', slotLabel: '午後', startTime: '14:00', rejected: false, cells: { [ME]: 'ok', m2: 'ok', m3: 'ok' }, ok: 3, maybe: 0, ng: 0 },
    { id: 'c3', date: '2026-11-15', dateLabel: '11/15(日)', slotLabel: '午後', startTime: '14:00', rejected: false, cells: { [ME]: 'maybe', m2: 'ok', m3: 'ok' }, ok: 2, maybe: 1, ng: 0 },
  ],
  bestRowId: 'c2',
  respondedCount: 3,
  memberCount: 3,
}

/** 4. 日程タブの回答表 */
export function DemoAnswerTable() {
  return (
    <DemoFrame label="グループページ › 日程（画面例）">
      <div className="bg-card rounded-lg border border-border px-3">
        <DateAnswerTable table={ANSWER_TABLE} canAnswer onAnswer={async () => {}} />
      </div>
    </DemoFrame>
  )
}

const CANDIDATES: SheetCandidate[] = [
  { id: 'c2', date: '2026-11-14', slotKey: 'afternoon', label: '11/14(土) 午後 14:00〜18:00', tally: '○3', note: '全員参加できる', ok: 3, maybe: 0, ng: 0, hasNg: false, startTime: '14:00', endTime: '18:00' },
  { id: 'c3', date: '2026-11-15', slotKey: 'afternoon', label: '11/15(日) 午後 14:00〜18:00', tally: '○2 △1', note: 'はなこさんが△', ok: 2, maybe: 1, ng: 0, hasNg: false, startTime: '14:00', endTime: '18:00' },
  { id: 'c1', date: '2026-11-13', slotKey: 'evening', label: '11/13(金) 夜 19:00〜23:00', tally: '○1 △1 ×1', note: 'じろうさんが×', ok: 1, maybe: 1, ng: 1, hasNg: true, startTime: '19:00', endTime: '23:00' },
]

/** 5. 申込シートの縮小版（候補日の選択と希望店舗） */
export function DemoRequestSheet() {
  return (
    <DemoFrame label="申込シート（画面例）">
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-border">
          <p className="text-base font-bold">店舗に申し込む</p>
          <p className="text-xs text-muted-foreground">白いウサギは歌わない・参加 3/6名</p>
        </div>
        <p className="bg-violet-50 px-3.5 py-1.5 text-xs text-violet-800">
          送る候補日を選んでください（複数可）。店舗はこの中から 1 つを確定します。順番は上から優先です。
        </p>
        <div className="px-3.5 py-3 flex flex-col gap-4">
          <section aria-label="候補日">
            <p className="mb-2 text-sm font-bold">1. 候補日 <span className="text-xs font-normal text-muted-foreground">2 件選択中</span></p>
            <RequestCandidateList candidates={CANDIDATES} picks={['c2', 'c3']} blockedReason={() => null} warning={() => null} onToggle={noop} onMove={noop} />
          </section>
          <section aria-label="希望店舗">
            <p className="mb-2 text-sm font-bold">2. 希望店舗 <span className="text-xs font-normal text-muted-foreground">どれでも可</span></p>
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full px-3 py-1.5 text-sm border-2 border-violet-600 bg-violet-50 font-bold text-violet-800">高田馬場店</span>
              <span className="rounded-full px-3 py-1.5 text-sm border-2 border-violet-600 bg-violet-50 font-bold text-violet-800">大久保店</span>
            </div>
          </section>
        </div>
      </div>
    </DemoFrame>
  )
}

const WAITING_STORE: GroupStatusView = {
  action: 'waiting_store',
  tone: 'amber',
  primaryTone: 'amber',
  chip: '店舗の返事待ち',
  sub: '11/1 申込',
  body: '候補日 2 件で申込中。店舗が日程を確定すると連絡が届きます',
  primary: null,
  secondary: [{ kind: 'view_booking', label: '申込内容を見る' }],
  oneLine: '店舗の返事待ち・11/1 申込',
}

/** 5. 申し込んだあとの箱 */
export function DemoWaitingStore() {
  return <StatusDemo label="グループページ（画面例・申込後）" view={WAITING_STORE} />
}

const CHOOSE_CASTING: GroupStatusView = {
  action: 'choose_casting',
  tone: 'green',
  primaryTone: 'green',
  chip: '配役の決め方を選ぶ',
  sub: '11/14(土) 14:00 高田馬場店',
  body: 'キャラクターの配役をどう決めますか。あとから変えられます。',
  primary: { kind: 'casting_survey', label: '事前配役アンケートで希望を伝える' },
  secondary: [{ kind: 'casting_self', label: '自分たちで決める' }],
  oneLine: '配役の決め方を選ぶ',
}

/** 6. 確定後の箱（配役の決め方を選ぶ） */
export function DemoChooseCasting() {
  return <StatusDemo label="グループページ（画面例・確定後）" view={CHOOSE_CASTING} />
}

const ENDED: GroupStatusView = {
  action: 'ended',
  tone: 'green',
  primaryTone: 'green',
  chip: '開催しました',
  sub: '11/14(土) 14:00 高田馬場店',
  body: 'ご参加ありがとうございました。記念写真をここに残すと、メンバー全員のアルバムにも入ります。',
  primary: { kind: 'share_photos', label: '写真を共有する' },
  secondary: [{ kind: 'feedback', label: '感想を書く' }, { kind: 'next_group', label: '同じメンバーで次の貸切' }],
  oneLine: '開催しました・写真を共有しましょう',
}

/** 8. 公演後の箱とタブ（思い出） */
export function DemoAfter() {
  return <StatusDemo label="グループページ（画面例・公演後）" view={ENDED} tab="memories" tabs={AFTER_TABS} />
}
