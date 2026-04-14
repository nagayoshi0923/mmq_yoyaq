/**
 * 初めての方へ / 使い方ガイドページ
 * @path /guide
 * 実際のUIコンポーネントを使ったインタラクティブなマニュアル
 */
import { useState } from 'react'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  ChevronRight, Calendar, Clock, Users, HelpCircle, ArrowRight,
  Heart, CheckCheck, MousePointerClick, UserPlus, Settings, MessageCircle,
  Search, BookOpen
} from 'lucide-react'
import { Link } from 'react-router-dom'

interface DemoEvent {
  time: string
  title: string
  store: string
  storeColor: string
  imageUrl: string
  players: number
  seats: number
  isConfirmed?: boolean
}

const DEMO_EVENTS: Record<string, DemoEvent[]> = {
  '8': [
    { time: '13:00', title: 'ある悪魔の儀式について', store: '仮設②', storeColor: '#8B5CF6', imageUrl: 'https://cznpcewciwywcqcxktba.supabase.co/storage/v1/object/public/key-visuals/1761045982620-7i7qma.webp', players: 6, seats: 6 },
    { time: '13:30', title: 'ツイン号沈没事故に関する考察', store: '大久保', storeColor: '#F97316', imageUrl: 'https://cznpcewciwywcqcxktba.supabase.co/storage/v1/object/public/key-visuals/1770997291378-pa5zir.jpg', players: 6, seats: 6 },
    { time: '19:00', title: 'クロノフォビア', store: '仮設②', storeColor: '#8B5CF6', imageUrl: 'https://cznpcewciwywcqcxktba.supabase.co/storage/v1/object/public/key-visuals/1761045864807-7xn1uf.webp', players: 7, seats: 7 },
    { time: '19:30', title: '荒廃のマリス', store: '馬場', storeColor: '#3B82F6', imageUrl: 'https://cznpcewciwywcqcxktba.supabase.co/storage/v1/object/public/key-visuals/1761047653055-kg6xfr.webp', players: 7, seats: 7 },
  ],
  '9': [
    { time: '13:00', title: '白いウサギは歌わない', store: '馬場', storeColor: '#3B82F6', imageUrl: 'https://cznpcewciwywcqcxktba.supabase.co/storage/v1/object/public/key-visuals/1770883605761-6jmuke.jpg', players: 8, seats: 3, isConfirmed: true },
  ],
}

interface DemoScenario {
  title: string
  author: string
  duration: number
  playerMin: number
  playerMax: number
  fee: number
  badge?: string
  badgeColor?: string
  imageUrl?: string
  events: Array<{
    date: string
    weekday: string
    time: string
    store: string
    storeColor: string
    seats: number
    isConfirmed?: boolean
  }>
}

const SAMPLE_SCENARIOS: DemoScenario[] = [
  {
    title: '白いウサギは歌わない',
    author: 'とんとん',
    duration: 240,
    playerMin: 8,
    playerMax: 8,
    fee: 4000,
    badge: 'おすすめ',
    badgeColor: THEME.primary,
    imageUrl: 'https://cznpcewciwywcqcxktba.supabase.co/storage/v1/object/public/key-visuals/1770883605761-6jmuke.jpg',
    events: [
      { date: '4/19', weekday: '土', time: '13:00', store: '高田馬場', storeColor: '#3B82F6', seats: 3 },
      { date: '4/26', weekday: '土', time: '18:00', store: '大久保', storeColor: '#F97316', seats: 5 },
    ],
  },
  {
    title: 'テセウスの方舟',
    author: 'ほがらか',
    duration: 240,
    playerMin: 7,
    playerMax: 7,
    fee: 4500,
    badge: '成立間近！',
    badgeColor: '#DC2626',
    imageUrl: 'https://cznpcewciwywcqcxktba.supabase.co/storage/v1/object/public/key-visuals/1761046043728-lblb6.webp',
    events: [
      { date: '4/20', weekday: '日', time: '12:00', store: '別館①', storeColor: '#22C55E', seats: 1, isConfirmed: true },
    ],
  },
]

function DemoScenarioCard({ scenario }: { scenario: DemoScenario }) {
  const formatDuration = (min: number) =>
    min >= 60
      ? `${Math.floor(min / 60)}h${min % 60 > 0 ? `${min % 60}m` : ''}`
      : `${min}分`

  return (
    <div className="group">
      <div className="relative bg-white overflow-hidden border border-gray-200 flex md:flex-col" style={{ borderRadius: 0 }}>
        <div className="relative w-32 md:w-full aspect-[3/4] overflow-hidden flex-shrink-0 bg-gray-900">
          {scenario.imageUrl ? (
            <img src={scenario.imageUrl} alt={scenario.title} className="absolute inset-0 w-full h-full object-contain" loading="lazy" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
              <span className="text-white/20 text-4xl font-bold select-none">{scenario.title.charAt(0)}</span>
            </div>
          )}
          {scenario.badge && (
            <div className="absolute bottom-0 left-0 px-3 py-1 text-xs font-bold text-white" style={{ backgroundColor: scenario.badgeColor }}>
              {scenario.badge}
            </div>
          )}
        </div>
        <div className="p-2 sm:p-3 flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-500">{scenario.author}</p>
            <div className="flex items-center gap-0.5">
              <CheckCheck className="h-4 w-4 text-gray-300" />
              <Heart className="h-4 w-4 text-red-500 fill-red-500 opacity-100" />
            </div>
          </div>
          <h3 className="text-sm font-bold text-gray-900 leading-snug mb-2 line-clamp-2">{scenario.title}</h3>
          <div className="flex items-center gap-3 text-xs text-gray-600 mb-2">
            <span className="flex items-center gap-1"><Users className="h-3 w-3" />{scenario.playerMax}人</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(scenario.duration)}</span>
            <span>¥{scenario.fee.toLocaleString()}〜</span>
          </div>
          <div className="border-t border-gray-100 pt-2 space-y-1">
            {scenario.events.map((event, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-1 h-4 flex-shrink-0" style={{ backgroundColor: event.storeColor }} />
                  <span className="font-medium text-gray-900">
                    {event.date}
                    <span className={`ml-0.5 font-normal ${event.weekday === '日' ? 'text-red-500' : event.weekday === '土' ? 'text-blue-500' : 'text-gray-400'}`}>({event.weekday})</span>
                  </span>
                  <span className="text-gray-500">{event.time}</span>
                  <span className="text-gray-400 truncate">{event.store}</span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                  {event.isConfirmed && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700" style={{ borderRadius: 0 }}>開催決定</span>}
                  <span className="text-[10px] font-bold px-1.5 py-0.5" style={{
                    backgroundColor: event.seats <= 2 ? '#FEE2E2' : THEME.accentLight,
                    color: event.seats <= 2 ? '#DC2626' : THEME.accent, borderRadius: 0,
                  }}>残{event.seats}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function CalendarEventCell({ event }: { event: DemoEvent }) {
  return (
    <div
      className="text-xs border-l-2 cursor-pointer"
      style={{ borderLeftColor: event.storeColor, backgroundColor: `${event.storeColor}15`, padding: '2px 3px' }}
    >
      <div className="flex gap-1">
        <div className="hidden sm:block flex-shrink-0 w-[40px] overflow-hidden bg-gray-200" style={{ aspectRatio: '1 / 1.4' }}>
          <img src={event.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        </div>
        <div className="flex flex-col gap-0 flex-1 min-w-0 justify-between">
          <div className="text-xs leading-tight" style={{ color: event.storeColor }}>{event.time.slice(0, 5)}</div>
          <div className="text-xs leading-tight" style={{ color: event.storeColor }}>{event.store}</div>
          <div className="text-xs leading-tight text-gray-800 overflow-hidden whitespace-nowrap" style={{ textOverflow: 'clip' }}>{event.title}</div>
          <div className="text-xs leading-tight flex items-center gap-1">
            {event.isConfirmed && <span className="text-[8px] font-bold px-0.5 py-0.5 bg-blue-100 text-blue-700">開催決定</span>}
            <span className="text-gray-600">残{event.seats}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function StepNumber({ n }: { n: number }) {
  return (
    <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: THEME.primary }}>
      {n}
    </div>
  )
}

function Annotation({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs sm:text-sm rounded-lg">
      <MousePointerClick className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  )
}

function PostGroupSteps({ startStep }: { startStep: number }) {
  return (
    <>
      {/* 共通: グループ作成後のフロー */}
      <div className="relative mt-2 mb-2 flex items-center gap-2">
        <div className="flex-1 border-t border-purple-200" />
        <span className="text-xs font-medium text-purple-600 bg-purple-50 px-3 py-1 rounded-full">▼ グループ作成後の共通フロー</span>
        <div className="flex-1 border-t border-purple-200" />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">{startStep}</span>
          <p className="text-sm font-bold text-gray-900">チャット画面から招待リンクを共有</p>
        </div>
        <p className="text-sm text-gray-600 mb-1 pl-8">グループが作成されるとチャット画面が開きます。ヘッダーの <strong className="text-purple-700">＋</strong> アイコンから招待リンクを共有しましょう。</p>
        <p className="text-sm text-gray-500 mb-3 pl-8">※ メンバーが全員揃っていなくても、リクエストの送信や日程調整は進められます。後から招待もOKです。</p>
        <div className="ml-8 space-y-3">
          <DemoFrame label="グループチャット画面">
            <div className="flex items-center gap-2.5 border-b pb-2 mb-2">
              <span className="text-gray-400 text-sm">←</span>
              <img src="https://cznpcewciwywcqcxktba.supabase.co/storage/v1/object/public/key-visuals/1770883605761-6jmuke.jpg" alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">白いウサギは歌わない</p>
                <p className="text-[10px] text-gray-500">1名参加 • 進捗 0/5</p>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-7 h-7 flex items-center justify-center rounded ring-2 ring-purple-400 bg-purple-50">
                  <UserPlus className="w-4 h-4 text-purple-600" />
                </span>
                <span className="w-7 h-7 flex items-center justify-center rounded text-gray-400">
                  <Calendar className="w-4 h-4" />
                </span>
              </div>
            </div>
            <div className="h-16 flex items-center justify-center text-xs text-gray-400">
              チャットでメンバーと相談できます
            </div>
          </DemoFrame>
          <p className="text-xs text-purple-700 font-medium">↓ ＋アイコンをタップすると招待シートが開きます</p>
          <DemoFrame label="メンバー招待シート">
            <div className="flex justify-center mb-1">
              <div className="w-8 h-1 bg-gray-300 rounded-full" />
            </div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">メンバー招待・管理</p>
              <span className="text-gray-400 text-sm">✕</span>
            </div>
            <div className="space-y-2.5">
              <p className="text-sm font-medium text-gray-700">招待リンク</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-9 rounded border border-gray-200 px-3 flex items-center text-xs text-gray-500 bg-gray-50 truncate">
                  https://mmq.jp/group/invite/abc123...
                </div>
                <button className="px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded flex-shrink-0">コピー</button>
              </div>
              <button className="w-full py-2 text-sm font-medium text-[#06C755] bg-white border border-[#06C755] rounded flex items-center justify-center gap-1.5">
                LINEで共有
              </button>
            </div>
          </DemoFrame>
        </div>
        <Annotation>招待リンクを受け取った人は、ログインしてグループに参加できます</Annotation>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">{startStep + 1}</span>
          <p className="text-sm font-bold text-gray-900">メンバーが候補日に回答</p>
        </div>
        <p className="text-sm text-gray-600 mb-3 pl-8">各候補日に「○ OK / △ 微妙 / × NG」で回答します。チャット機能で相談もできます。</p>
        <div className="ml-8">
          <DemoFrame label="参加者の画面イメージ">
            <h4 className="font-medium text-sm mb-2">候補日程（3件）</h4>
            <div className="space-y-2">
              {[
                { n: 1, date: '4月19日(土)', slot: '夜 18:00 - 22:00', ok: 3, maybe: 0, ng: 0, resp: 3, myResp: 'ok' as string | null },
                { n: 2, date: '4月20日(日)', slot: '昼 13:00 - 17:00', ok: 1, maybe: 1, ng: 1, resp: 3, myResp: 'maybe' as string | null },
                { n: 3, date: '4月26日(土)', slot: '昼 13:00 - 17:00', ok: 2, maybe: 1, ng: 0, resp: 3, myResp: null as string | null },
              ].map((cd) => (
                <div key={cd.n} className="px-2.5 py-2 rounded-md bg-gray-50">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1 min-w-0 leading-tight">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] leading-none bg-purple-100 text-purple-700 px-1 py-0.5 rounded">{cd.n}</span>
                        <span className="font-medium text-sm">{cd.date}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{cd.slot}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="flex items-center justify-end gap-1 text-xs">
                        <span className="text-green-600">○{cd.ok}</span>
                        <span className="text-amber-600">△{cd.maybe}</span>
                        <span className="text-red-600">×{cd.ng}</span>
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{cd.resp}/3人</div>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <span className={`flex-1 py-1.5 rounded-md text-xs font-medium text-center ${cd.myResp === 'ok' ? 'bg-green-500 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>○ OK</span>
                    <span className={`flex-1 py-1.5 rounded-md text-xs font-medium text-center ${cd.myResp === 'maybe' ? 'bg-amber-500 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>△ 微妙</span>
                    <span className={`flex-1 py-1.5 rounded-md text-xs font-medium text-center ${cd.myResp === 'ng' ? 'bg-red-500 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>× NG</span>
                  </div>
                </div>
              ))}
            </div>
          </DemoFrame>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">{startStep + 2}</span>
          <p className="text-sm font-bold text-gray-900">店舗が日程を確定</p>
        </div>
        <p className="text-sm text-gray-600 pl-8">店舗側で候補日を確認し、日程を確定します。確定後はメールとグループ内のチャットで通知が届きます。</p>
      </div>
    </>
  )
}

function InquiryStep() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-bold">?</span>
        <p className="text-sm font-bold text-gray-900">店舗への問い合わせ</p>
      </div>
      <p className="text-sm text-gray-600 mb-3 pl-8">質問がある場合は、チャット画面ヘッダーの <Settings className="w-3.5 h-3.5 inline-block text-gray-500" /> アイコンから店舗に直接問い合わせできます。</p>
      <div className="ml-8">
        <DemoFrame label="設定シート内の問い合わせ">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold">設定</p>
            <span className="text-gray-400 text-sm">✕</span>
          </div>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between p-3 bg-white">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium">店舗への問い合わせ</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 rotate-90" />
            </div>
            <div className="p-3 border-t border-gray-200 space-y-2">
              <p className="text-xs text-gray-500">返信先メールアドレス</p>
              <div className="h-8 rounded border border-gray-200 px-3 flex items-center text-xs text-gray-500 bg-gray-50">example@email.com</div>
              <p className="text-xs text-gray-500">問い合わせ内容</p>
              <div className="h-20 rounded border border-gray-200 px-3 py-2 text-xs text-gray-400 bg-gray-50">
                予約情報が自動入力されます...
              </div>
              <button className="w-full py-2 text-sm font-medium text-white rounded bg-gray-900">送信する</button>
            </div>
          </div>
        </DemoFrame>
      </div>
    </div>
  )
}

function DemoFrame({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 overflow-hidden">
      {label && (
        <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-200 text-[11px] text-gray-400 font-medium tracking-wide uppercase">{label}</div>
      )}
      <div className="p-3 sm:p-4">{children}</div>
    </div>
  )
}

function DemoTabs({ active, onChange }: { active: string; onChange: (tab: string) => void }) {
  const tabs = [
    { id: 'lineup', label: 'ラインナップ' },
    { id: 'calendar', label: 'カレンダー' },
    { id: 'list', label: 'リスト' },
  ]
  return (
    <div className="flex justify-center mb-4">
      <div className="inline-flex bg-gray-100 p-0.5 rounded-lg">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`px-4 py-1.5 text-sm font-medium transition-colors ${active === t.id ? 'rounded-md bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function DemoCalendarContent() {
  const eventDays: Record<number, string[]> = {
    7: ['orange'], 8: ['blue', 'purple', 'orange'], 9: ['blue'],
    11: ['orange', 'blue'], 12: ['green', 'orange'], 15: ['blue'],
    18: ['orange', 'green'], 19: ['blue', 'orange'], 20: ['green'],
    25: ['blue', 'purple'], 26: ['orange', 'blue'],
  }
  const colorMap: Record<string, string> = { blue: '#3B82F6', orange: '#F97316', green: '#22C55E', purple: '#8B5CF6' }

  return (
    <>
      {/* カレンダーグリッド - 実際のUIと同じ */}
      <div className="bg-white border overflow-hidden">
        <div className="grid grid-cols-7 border-b bg-muted/30">
          {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
            <div key={d} className={`text-center py-2 text-xs ${i === 0 ? 'text-red-600' : i === 6 ? 'text-blue-600' : ''}`}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {/* 空セル（4/1は水曜） */}
          {Array.from({ length: 3 }, (_, i) => (
            <div key={`blank-${i}`} className="border-r border-b min-h-[80px] sm:min-h-[110px] bg-muted/20" />
          ))}
          {Array.from({ length: 30 }, (_, i) => {
            const day = i + 1
            const dayOfWeek = (day + 2) % 7 // 4/1=水→3
            const events = DEMO_EVENTS[String(day)] || []
            const dots = eventDays[day]

            return (
              <div key={day} className="border-r border-b flex flex-col min-h-[80px] sm:min-h-[110px]">
                <div className={`text-xs p-0.5 flex-shrink-0 ${dayOfWeek === 0 ? 'text-red-600' : dayOfWeek === 6 ? 'text-blue-600' : ''}`}>
                  {day}
                </div>
                <div className="space-y-0.5 overflow-y-auto">
                  {events.length > 0
                    ? events.slice(0, 3).map((ev, ei) => <CalendarEventCell key={ei} event={ev} />)
                    : dots && (
                      <div className="flex justify-center pt-1 gap-0.5">
                        {dots.map((c, ci) => <div key={ci} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colorMap[c] }} />)}
                      </div>
                    )
                  }
                  {events.length > 3 && <div className="text-[10px] text-center text-blue-600">+{events.length - 3}</div>}
                </div>
              </div>
            )
          })}
          {/* 残りの空セル */}
          {Array.from({ length: 2 }, (_, i) => (
            <div key={`end-${i}`} className="border-r border-b min-h-[80px] sm:min-h-[110px] bg-muted/20" />
          ))}
        </div>
      </div>
    </>
  )
}

function DemoListContent() {
  const storeGroups = [
    { name: '馬場', color: '#3B82F6', events: DEMO_EVENTS['8']?.filter(e => e.store === '馬場') || [] },
    { name: '大久保', color: '#F97316', events: DEMO_EVENTS['8']?.filter(e => e.store === '大久保') || [] },
    { name: '仮設②', color: '#8B5CF6', events: DEMO_EVENTS['8']?.filter(e => e.store === '仮設②') || [] },
  ]

  const getSlot = (time: string) => {
    const h = parseInt(time.split(':')[0])
    if (h < 12) return 'morning'
    if (h < 18) return 'afternoon'
    return 'evening'
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          <col className="w-12 sm:w-16" />
          <col className="w-10 sm:w-16" />
          <col />
          <col />
          <col />
        </colgroup>
        <thead>
          <tr className="bg-muted/50">
            <th className="border text-xs sm:text-sm py-2 px-1 text-left">日付</th>
            <th className="border text-xs sm:text-sm py-2 px-1 text-left">会場</th>
            <th className="border text-xs sm:text-sm py-2 px-1 text-center">
              <span className="sm:hidden">朝</span><span className="hidden sm:inline">朝公演</span>
              <div className="text-[10px] text-gray-400 font-normal">9:00-12:00</div>
            </th>
            <th className="border text-xs sm:text-sm py-2 px-1 text-center">
              <span className="sm:hidden">昼</span><span className="hidden sm:inline">昼公演</span>
              <div className="text-[10px] text-gray-400 font-normal">14:00-18:00</div>
            </th>
            <th className="border text-xs sm:text-sm py-2 px-1 text-center">
              <span className="sm:hidden">夜</span><span className="hidden sm:inline">夜公演</span>
              <div className="text-[10px] text-gray-400 font-normal">19:00-23:00</div>
            </th>
          </tr>
        </thead>
        <tbody>
          {storeGroups.map((sg, si) => (
            <tr key={sg.name} className={si === 0 ? '' : ''}>
              {si === 0 && (
                <td className="border text-xs sm:text-sm px-1 py-2 align-top text-center" rowSpan={storeGroups.length}>
                  <div>4/8</div>
                  <div className="text-sm">水</div>
                </td>
              )}
              <td className="border text-xs px-1 py-1 whitespace-nowrap" style={{ color: sg.color }}>
                {sg.name}
              </td>
              {(['morning', 'afternoon', 'evening'] as const).map(slot => {
                const slotEvents = sg.events.filter(e => getSlot(e.time) === slot)
                return (
                  <td key={slot} className="border p-0 align-top">
                    {slotEvents.length > 0 ? (
                      <div className="flex flex-col">
                        {slotEvents.map((ev, ei) => (
                          <div
                            key={ei}
                            className="text-xs border-l-2 cursor-pointer"
                            style={{ borderLeftColor: sg.color, backgroundColor: `${sg.color}15`, padding: '2px 3px' }}
                          >
                            <div className="flex gap-0.5 sm:gap-2">
                              <div className="flex-shrink-0 w-[28px] sm:w-[46px] self-stretch overflow-hidden bg-gray-200">
                                <img src={ev.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                              </div>
                              <div className="flex flex-col gap-0 flex-1 min-w-0 justify-between">
                                <div className="text-xs leading-tight" style={{ color: sg.color }}>{ev.time}</div>
                                <div className="text-xs leading-tight text-gray-800 overflow-hidden whitespace-nowrap" style={{ textOverflow: 'clip' }}>{ev.title}</div>
                                <div className="text-xs leading-tight flex items-center justify-end gap-1">
                                  {ev.isConfirmed && <span className="text-[10px] font-bold px-1 py-0.5 bg-blue-100 text-blue-700">開催決定</span>}
                                  <span className="text-gray-600">残{ev.seats}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-1 sm:p-2 text-xs text-center">
                        <button className="w-full text-xs py-1 px-1 border border-dashed border-gray-300 text-gray-500">
                          貸切申込
                        </button>
                      </div>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function GuidePage() {
  const [activeTab, setActiveTab] = useState('lineup')
  const [privateMethod, setPrivateMethod] = useState<'scenario-direct' | 'scenario-group' | 'calendar'>('scenario-direct')

  return (
    <PublicLayout>
      {/* ヒーロー */}
      <section className="relative overflow-hidden py-10 md:py-14" style={{ backgroundColor: THEME.primary }}>
        <div className="absolute top-0 right-0 w-64 h-64 opacity-20" style={{ background: `radial-gradient(circle at center, ${THEME.accent} 0%, transparent 70%)`, transform: 'translate(30%, -30%)' }} />
        <div className="max-w-2xl mx-auto px-4 relative text-center">
          <div className="flex items-center justify-center gap-2 text-white/80 text-sm mb-4">
            <Link to="/" className="hover:text-white transition-colors">ホーム</Link>
            <ChevronRight className="w-4 h-4" />
            <span>使い方ガイド</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-3 flex items-center justify-center gap-3">
            <HelpCircle className="w-7 h-7 sm:w-8 sm:h-8" />
            ご予約ガイド
          </h1>
          <p className="text-base sm:text-lg text-white/90">かんたん4ステップで予約できます</p>
        </div>
      </section>

      {/* ===== Step 1 ===== */}
      <section className="max-w-3xl mx-auto px-4 pt-10 pb-6 md:pt-14 md:pb-8">
        <div className="flex items-center gap-3 mb-4">
          <StepNumber n={1} />
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">トップページにアクセス</h2>
            <p className="text-sm text-gray-500 mt-0.5">まずはページを開きましょう</p>
          </div>
        </div>

        <p className="text-sm sm:text-base text-gray-600 mb-4 leading-relaxed">
          シナリオを探すページは<strong>2種類</strong>あります。
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div className="border border-gray-200 rounded-lg p-3 sm:p-4 bg-white">
            <p className="text-sm font-bold text-gray-900 mb-1">MMQトップ</p>
            <p className="text-xs text-gray-500 mb-2">mmq.jp</p>
            <p className="text-sm text-gray-600">全店舗のシナリオ・公演をまとめて探せます。どの店舗で遊ぶか決まっていないときに便利です。</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-3 sm:p-4 bg-white">
            <p className="text-sm font-bold text-gray-900 mb-1">店舗トップ</p>
            <p className="text-xs text-gray-500 mb-2">mmq.jp/店舗名</p>
            <p className="text-sm text-gray-600">特定の店舗のシナリオ・公演だけを表示します。遊ぶ店舗が決まっているときに便利です。</p>
          </div>
        </div>
        <Annotation>
          各店舗・組織の予約ページ（店舗トップ）では「ラインナップ」「カレンダー」「リスト」の3つのタブで探せます。MMQトップ（全店まとめ）はタブではなく、公演ラインナップを一覧で見る構成です。
        </Annotation>
      </section>

      <hr className="max-w-3xl mx-auto border-gray-200" />

      {/* ===== Step 2 ===== */}
      <section className="max-w-3xl mx-auto px-4 py-6 md:py-8">
        <div className="flex items-center gap-3 mb-4">
          <StepNumber n={2} />
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">シナリオを探す</h2>
            <p className="text-sm text-gray-500 mt-0.5">検索・フィルターで絞り込み</p>
          </div>
        </div>

        {/* 検索・フィルター説明 */}
        <div className="mb-4">
          <DemoFrame label="シナリオの探し方">
            <div className="space-y-4">
              {/* 検索バー + カタログ */}
              <div>
                <p className="text-xs font-medium text-gray-700 mb-1.5">① キーワード検索</p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <div className="h-9 rounded border border-gray-200 pl-8 pr-3 flex items-center text-sm text-gray-400" style={{ backgroundColor: '#F6F9FB' }}>シナリオを検索...</div>
                  </div>
                  <button className="h-9 px-3 flex items-center gap-1.5 text-sm font-medium border-2 rounded whitespace-nowrap" style={{ borderColor: '#E60012', color: '#E60012' }}>
                    <BookOpen className="w-4 h-4" />
                    <span>カタログ</span>
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">シナリオ名・あらすじ・ジャンルで検索。「カタログ」で全シナリオ一覧へ</p>
              </div>

              <div className="border-t border-gray-100" />

              {/* カタログページのフィルター */}
              <div>
                <p className="text-xs font-medium text-gray-700 mb-1.5">② カタログページのフィルター</p>
                <div className="space-y-2.5">
                  <div>
                    <p className="text-[11px] text-gray-400 mb-1">ジャンルで絞り込み</p>
                    <div className="flex flex-wrap gap-1.5">
                      {['推理', '協力', 'ホラー', 'ファンタジー', '感動', 'コメディ'].map((g) => (
                        <span key={g} className={`px-2.5 py-1 rounded-full text-xs border cursor-default ${g === '推理' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>{g}</span>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="h-9 rounded border border-gray-200 px-2 flex items-center text-xs text-gray-500" style={{ backgroundColor: '#F6F9FB' }}>所要時間 ▾</div>
                    <div className="h-9 rounded border border-gray-200 px-2 flex items-center text-xs text-gray-500" style={{ backgroundColor: '#F6F9FB' }}>プレイ人数 ▾</div>
                    <div className="h-9 rounded border border-gray-200 px-2 flex items-center text-xs text-gray-500" style={{ backgroundColor: '#F6F9FB' }}>店舗 ▾</div>
                    <div className="h-9 rounded border border-gray-200 px-2 flex items-center text-xs text-gray-500" style={{ backgroundColor: '#F6F9FB' }}>並び替え ▾</div>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100" />

              {/* 店舗フィルター */}
              <div>
                <p className="text-xs font-medium text-gray-700 mb-1.5">③ 店舗フィルター（トップページ）</p>
                <p className="text-[11px] text-gray-400 mb-1.5">「直近公演」セクションで表示する店舗を選択</p>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs text-gray-600 whitespace-nowrap">店舗:</span>
                  <div className="flex-1 border border-gray-200 rounded px-3 py-1.5 flex items-center justify-between bg-white text-sm text-gray-700">
                    <span>馬場, 別館①, 大久保</span>
                    <ChevronRight className="w-3 h-3 text-gray-400 rotate-90" />
                  </div>
                </div>
                {/* ドロップダウン展開イメージ */}
                <div className="border border-gray-200 rounded overflow-hidden text-sm">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b">
                    <span className="w-4 h-4 border bg-gray-900 border-gray-900 text-white flex items-center justify-center text-[10px]">✓</span>
                    <span className="font-medium text-xs">東京都</span>
                    <span className="text-[10px] text-gray-400 ml-auto">3/5店舗</span>
                  </div>
                  {[
                    { name: '高田馬場本店', checked: true },
                    { name: '別館①', checked: true },
                    { name: '別館②', checked: false },
                    { name: '大久保店', checked: true },
                    { name: '大塚店', checked: false },
                  ].map((s) => (
                    <div key={s.name} className="flex items-center gap-2 px-3 py-1 pl-7 hover:bg-red-50">
                      <span className={`w-4 h-4 border flex items-center justify-center text-[10px] ${s.checked ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-300'}`}>{s.checked && '✓'}</span>
                      <span className="text-xs">{s.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </DemoFrame>
        </div>

        <DemoFrame label="実際の画面イメージ（タブ切り替え可能）">
          <DemoTabs active={activeTab} onChange={setActiveTab} />

          {activeTab === 'lineup' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pointer-events-none">
                {SAMPLE_SCENARIOS.map((s) => (
                  <DemoScenarioCard key={s.title} scenario={s} />
                ))}
              </div>
              <div className="mt-3 space-y-2">
                <Annotation>カードをタップするとシナリオ詳細ページに移動します</Annotation>
                <Annotation>
                  <Heart className="w-3 h-3 inline text-red-500 mr-1" />で「遊びたいリスト」に追加、
                  <CheckCheck className="w-3 h-3 inline text-green-500 mx-1" />で体験済みを記録
                </Annotation>
              </div>
            </>
          )}

          {activeTab === 'calendar' && (
            <>
              <DemoCalendarContent />
              <div className="mt-3 space-y-2">
                <Annotation>各日付のセル内にその日の公演が表示されます。タップで詳細へ</Annotation>
                <Annotation>店舗ごとに色分けされた左ボーダーで、どの店舗かひと目でわかります</Annotation>
              </div>
            </>
          )}

          {activeTab === 'list' && (
            <>
              <DemoListContent />
              <div className="mt-3 space-y-2">
                <Annotation>日付×店舗×時間帯（朝/昼/夜）の一覧表。複数店舗の空き状況を比較できます</Annotation>
                <Annotation>空き枠の「貸切申込」ボタンから、貸切リクエストも可能</Annotation>
              </div>
            </>
          )}
        </DemoFrame>
      </section>

      <hr className="max-w-3xl mx-auto border-gray-200" />

      {/* ===== Step 3 ===== */}
      <section className="max-w-3xl mx-auto px-4 py-6 md:py-8">
        <div className="flex items-center gap-3 mb-4">
          <StepNumber n={3} />
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">公演を選んで予約</h2>
            <p className="text-sm text-gray-500 mt-0.5">日程・人数を決めて予約しましょう</p>
          </div>
        </div>

        <p className="text-sm sm:text-base text-gray-600 mb-4 leading-relaxed">
          シナリオ詳細ページでは、開催予定の公演がリストで表示されます。
          参加したい日程の<strong>「予約する」</strong>ボタンをタップしてください。
        </p>

        <DemoFrame label="シナリオ詳細 → 公演スケジュール">
          <h3 className="font-bold text-gray-900 mb-1">白いウサギは歌わない</h3>
          <p className="text-xs text-gray-500 mb-3">8人 ・ 4時間 ・ ¥4,000〜</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between bg-white border border-gray-200 px-3 py-2.5 rounded-lg">
              <div className="flex items-center gap-2 text-sm">
                <span className="w-1 h-5 rounded-full bg-blue-500 flex-shrink-0" />
                <span className="font-medium text-gray-900">4/19<span className="text-gray-400 ml-0.5">(土)</span></span>
                <span className="text-gray-500">13:00</span>
                <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">馬場</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700">開催決定</span>
                <span className="text-xs font-bold px-1.5 py-0.5 bg-red-50 text-red-600">残3</span>
                <button className="px-3 py-1 text-xs font-medium text-white rounded" style={{ backgroundColor: THEME.primary }}>予約する</button>
              </div>
            </div>
            <div className="flex items-center justify-between bg-white border border-gray-200 px-3 py-2.5 rounded-lg">
              <div className="flex items-center gap-2 text-sm">
                <span className="w-1 h-5 rounded-full bg-orange-500 flex-shrink-0" />
                <span className="font-medium text-gray-900">4/26<span className="text-gray-400 ml-0.5">(土)</span></span>
                <span className="text-gray-500">18:00</span>
                <span className="text-xs px-1.5 py-0.5 bg-orange-50 text-orange-700 rounded">大久保</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-1.5 py-0.5" style={{ backgroundColor: THEME.accentLight, color: THEME.accent }}>残5</span>
                <button className="px-3 py-1 text-xs font-medium text-white rounded" style={{ backgroundColor: THEME.primary }}>予約する</button>
              </div>
            </div>
            <div className="flex items-center justify-between bg-white border border-gray-200 px-3 py-2.5 rounded-lg opacity-70">
              <div className="flex items-center gap-2 text-sm">
                <span className="w-1 h-5 rounded-full bg-purple-500 flex-shrink-0" />
                <span className="font-medium text-gray-900">5/3<span className="text-gray-400 ml-0.5">(日)</span></span>
                <span className="text-gray-500">13:00</span>
                <span className="text-xs px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded">仮設②</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-1.5 py-0.5 bg-gray-200 text-gray-500">満席</span>
                <button className="px-3 py-1 text-xs font-medium text-gray-500 bg-gray-100 rounded">キャンセル待ち</button>
              </div>
            </div>
          </div>
        </DemoFrame>

        <div className="mt-4 space-y-2">
          <Annotation>「開催決定」は最少催行人数に達した公演です。確実に遊べます！</Annotation>
          <Annotation>満席でも「キャンセル待ち」を登録しておけば、空きが出た時に通知が届きます</Annotation>
        </div>
      </section>

      <hr className="max-w-3xl mx-auto border-gray-200" />

      {/* ===== Step 4 ===== */}
      <section className="max-w-3xl mx-auto px-4 py-6 md:py-8">
        <div className="flex items-center gap-3 mb-4">
          <StepNumber n={4} />
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">予約完了！</h2>
            <p className="text-sm text-gray-500 mt-0.5">情報を入力して送信するだけ</p>
          </div>
        </div>

        <p className="text-sm sm:text-base text-gray-600 mb-4 leading-relaxed">
          お名前・連絡先を入力して送信すれば予約完了。確認メールが届きます。
        </p>

        <DemoFrame label="予約フォーム">
          <div className="max-w-sm mx-auto space-y-3">
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <p className="font-bold text-sm text-gray-900">白いウサギは歌わない</p>
              <p className="text-xs text-gray-500 mt-0.5">4/19(土) 13:00 ・ 高田馬場店</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">参加人数</label>
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden w-fit">
                <button className="px-3 py-1.5 text-gray-400 bg-gray-50">−</button>
                <span className="px-4 py-1.5 text-sm font-medium">2名</span>
                <button className="px-3 py-1.5 text-gray-400 bg-gray-50">+</button>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">代表者名</label>
              <div className="w-full h-9 rounded-lg border border-gray-200 px-3 flex items-center text-sm text-gray-400" style={{ backgroundColor: '#F6F9FB' }}>お名前</div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">メールアドレス</label>
              <div className="w-full h-9 rounded-lg border border-gray-200 px-3 flex items-center text-sm text-gray-400" style={{ backgroundColor: '#F6F9FB' }}>example@email.com</div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">電話番号</label>
              <div className="w-full h-9 rounded-lg border border-gray-200 px-3 flex items-center text-sm text-gray-400" style={{ backgroundColor: '#F6F9FB' }}>090-0000-0000</div>
            </div>
            <button className="w-full py-2.5 text-sm font-bold text-white rounded-lg" style={{ backgroundColor: THEME.primary }}>予約を確定する</button>
            <p className="text-center text-[11px] text-gray-400">予約確認メールが送信されます</p>
          </div>
        </DemoFrame>

        <div className="mt-4">
          <Annotation>予約にはログインが必要です。ログイン中はお名前・連絡先が自動入力されます</Annotation>
        </div>
      </section>

      {/* ===== 貸切予約ガイド ===== */}
      <section className="bg-purple-50/50 py-8 md:py-10">
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-white font-bold text-lg bg-purple-600">
              <Users className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">貸切予約ガイド</h2>
              <p className="text-sm text-gray-500 mt-0.5">お仲間だけでシナリオを楽しむ方法</p>
            </div>
          </div>

          <p className="text-sm sm:text-base text-gray-600 mb-4 leading-relaxed">
            状況に合わせて<strong>3つの方法</strong>から選べます。下のタブで詳しい手順を確認してください。
          </p>

          {/* 複数候補日アピール */}
          <div className="rounded-lg border border-purple-200 overflow-hidden mb-4">
            <div className="bg-purple-50 px-4 py-2.5 border-b border-purple-200">
              <p className="text-sm font-bold text-purple-800">候補日をまとめて送れるからスムーズ！</p>
            </div>
            <div className="p-4 bg-white">
              <div className="flex items-center gap-3 sm:gap-4">
                {/* あなた側 */}
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-gray-400 mb-1.5 text-center">あなた</p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-purple-50 border border-purple-200 rounded text-xs">
                      <span className="text-purple-600 font-bold">①</span>
                      <span className="text-gray-700">4/19(土) 夜</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-purple-50 border border-purple-200 rounded text-xs">
                      <span className="text-purple-600 font-bold">②</span>
                      <span className="text-gray-700">4/20(日) 昼</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-purple-50 border border-purple-200 rounded text-xs">
                      <span className="text-purple-600 font-bold">③</span>
                      <span className="text-gray-700">4/26(土) 昼</span>
                    </div>
                  </div>
                </div>
                {/* 矢印 */}
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <ArrowRight className="w-5 h-5 text-purple-400" />
                  <span className="text-[10px] text-purple-400">まとめて送信</span>
                </div>
                {/* 店舗側 */}
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-gray-400 mb-1.5 text-center">店舗</p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-xs text-gray-400 line-through">4/19(土) 夜</div>
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 border border-green-300 rounded text-xs text-green-700 font-medium">
                      <span>4/20(日) 昼</span>
                      <span className="ml-auto text-[10px] bg-green-100 px-1 rounded">確定！</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-xs text-gray-400 line-through">4/26(土) 昼</div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-3 text-center">1つがダメでも他の候補日から選んでもらえるので、やり取りの手間が減ります</p>
              <div className="flex justify-center gap-3 mt-2 text-[11px] text-purple-600">
                <span className="bg-purple-50 border border-purple-200 rounded px-2 py-0.5">直接申込: 最大<strong>6件</strong></span>
                <span className="bg-purple-50 border border-purple-200 rounded px-2 py-0.5">グループ調整: <strong>自由に追加</strong>OK</span>
              </div>
            </div>
          </div>

          {/* 貸切グループの仕組み説明 */}
          <div className="bg-white border border-purple-200 rounded-lg p-4 sm:p-5 mb-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center mt-0.5">
                <Users className="w-[18px] h-[18px] text-purple-600" />
              </div>
              <div>
                <p className="text-base font-bold text-gray-900 mb-1.5">貸切予約 = 貸切グループの作成</p>
                <p className="text-sm text-gray-700 leading-relaxed mb-3">
                  どの方法でも、貸切リクエストを送信すると<strong>「貸切グループ」が自動で作成</strong>されます。
                  グループが作成されると招待リンクが発行され、一緒に遊ぶメンバーを招待できるようになります。
                </p>
                <div className="flex items-center gap-2 text-xs sm:text-sm text-purple-700 bg-purple-50 rounded-lg px-3 py-2 flex-wrap font-medium">
                  <span>貸切リクエスト送信</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span>グループ自動作成</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span>招待リンク発行</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span>メンバー招待</span>
                </div>
              </div>
            </div>
          </div>

          {/* グループ参加について */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-5 mb-6 space-y-3">
            <p className="text-base font-bold text-gray-900">グループへのメンバー参加について</p>
            <div className="space-y-3">
              <div className="flex items-start gap-2.5">
                <span className="flex-shrink-0 mt-0.5 w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold">✓</span>
                <p className="text-sm text-gray-700 leading-relaxed">
                  <strong>MMQに登録しなくても</strong>グループに参加できます（ゲスト参加OK）
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="flex-shrink-0 mt-0.5 w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold">✓</span>
                <div className="text-sm text-gray-700 leading-relaxed">
                  <p>参加者<strong>全員をグループに追加しなくても公演に支障はありません</strong></p>
                  <p className="text-gray-500 mt-1 text-[13px]">ただし、追加すると貸切リクエストの進捗確認・予約情報の共有・参加履歴の記録に便利です</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="flex-shrink-0 mt-0.5 w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-bold">!</span>
                <p className="text-sm text-gray-700 leading-relaxed">
                  <strong className="text-amber-700">事前読み込みがあるシナリオ</strong>は、グループに<strong>全員の参加が必須</strong>です（事前資料の配布にグループを使用するため）
                </p>
              </div>
            </div>
          </div>

          {/* 方法タブ */}
          <div className="mb-6">
            <p className="text-sm text-gray-600 mb-3">あなたの状況に合った方法をタップしてください：</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {([
                { id: 'scenario-direct' as const, label: 'シナリオから直接申込', desc: 'シナリオが決まっていて日程を探したい' },
                { id: 'scenario-group' as const, label: 'グループで日程調整', desc: 'メンバーを集めてから日程を決めたい' },
                { id: 'calendar' as const, label: 'カレンダーから申込', desc: '日程・店舗が決まっている' },
              ]).map((m) => (
                <button
                  key={m.id}
                  onClick={() => setPrivateMethod(m.id)}
                  className={`text-left p-3 sm:p-4 rounded-lg border-2 transition-all ${
                    privateMethod === m.id
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 bg-white hover:border-purple-200'
                  }`}
                >
                  <p className={`text-sm font-bold mb-0.5 ${privateMethod === m.id ? 'text-purple-700' : 'text-gray-800'}`}>{m.label}</p>
                  <p className="text-xs text-gray-500">{m.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* ===== シナリオから直接申込 ===== */}
          {privateMethod === 'scenario-direct' && (
            <div className="space-y-4">
              <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">1</span>
                  <p className="text-sm font-bold text-gray-900">シナリオ詳細ページで「貸切リクエスト」タブを開く</p>
                </div>
                <p className="text-sm text-gray-600 mb-3 pl-8">遊びたいシナリオの詳細ページを開き、「貸切リクエスト」タブを選択します。</p>
                <div className="ml-8">
                  <DemoFrame label="実際の画面イメージ">
                    {/* タブバー（ShadCN TabsList 風） */}
                    <div className="inline-flex w-full items-center justify-center bg-gray-100 p-1 rounded-none mb-3">
                      <span className="flex-1 text-center px-2.5 py-1.5 text-sm font-medium text-gray-500">公演日程</span>
                      <span className="flex-1 text-center px-2.5 py-1.5 text-sm font-medium bg-white text-gray-900 shadow-sm">貸切リクエスト</span>
                    </div>
                    {/* グループ作成への導線 */}
                    <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg mb-4">
                      <p className="text-sm text-purple-800 mb-2">日程やメンバーが決まっていない場合</p>
                      <button className="w-full py-2 text-sm font-medium text-purple-700 bg-white border border-purple-300 rounded flex items-center justify-center gap-1.5">
                        <Users className="w-4 h-4" />
                        まずはメンバーを招待して貸切グループを作成
                      </button>
                    </div>
                    {/* 店舗選択ドロップダウン */}
                    <div className="mb-4">
                      <label className="text-sm font-medium text-gray-500 mb-1.5 block">希望店舗を選択</label>
                      <button className="w-full flex items-center justify-between px-3 py-2 text-sm bg-white border border-gray-200 rounded">
                        <span className="text-gray-700">馬場, 別館①</span>
                        <ChevronRight className="w-3 h-3 text-gray-400 rotate-90" />
                      </button>
                    </div>
                    {/* 日程選択グリッド */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-1.5">希望日程を選択</h4>
                      {/* 月ナビ */}
                      <div className="flex items-center justify-between mb-2">
                        <button className="flex items-center gap-0.5 px-2 py-1 text-sm text-gray-500">← 前月</button>
                        <span className="text-sm font-medium">2026年4月</span>
                        <button className="flex items-center gap-0.5 px-2 py-1 text-sm text-gray-500">次月 →</button>
                      </div>
                      <div className="text-[10px] text-gray-400 text-center mb-2">候補日時を選択してください（最大6件）</div>
                      {/* スロットグリッド */}
                      <div className="border p-2">
                        {[
                          { date: '4/19', weekday: '土', wdColor: 'text-blue-600', slots: [
                            { label: '午前', time: '10:00〜13:00', available: true, selected: false },
                            { label: '午後', time: '13:00〜17:00', available: false, selected: false },
                            { label: '夜', time: '18:00〜22:00', available: true, selected: true },
                          ]},
                          { date: '4/20', weekday: '日', wdColor: 'text-red-600', slots: [
                            { label: '午前', time: '10:00〜13:00', available: true, selected: false },
                            { label: '午後', time: '13:00〜17:00', available: true, selected: false },
                            { label: '夜', time: '18:00〜22:00', available: false, selected: false },
                          ]},
                          { date: '4/26', weekday: '土', wdColor: 'text-blue-600', slots: [
                            { label: '午前', time: '10:00〜13:00', available: false, selected: false },
                            { label: '午後', time: '13:00〜17:00', available: true, selected: true },
                            { label: '夜', time: '18:00〜22:00', available: true, selected: false },
                          ]},
                        ].map((row) => (
                          <div key={row.date} className="flex items-stretch gap-1.5 border-b border-gray-100 py-1.5 last:border-b-0">
                            <div className="flex w-10 shrink-0 flex-col justify-center text-center leading-tight">
                              <div className="text-sm font-bold tabular-nums">{row.date}</div>
                              <div className={`text-xs ${row.wdColor}`}>({row.weekday})</div>
                            </div>
                            <div className="flex gap-1.5 flex-1">
                              {row.slots.map((slot) => (
                                <div
                                  key={slot.label}
                                  className={`flex-1 py-1 px-1 border text-center ${
                                    slot.selected
                                      ? 'border-purple-600 bg-purple-600 text-white'
                                      : slot.available
                                      ? 'border-gray-200 bg-white'
                                      : 'border-gray-100 bg-gray-50 opacity-50'
                                  }`}
                                >
                                  <div className="text-xs font-medium">{slot.label}</div>
                                  <div className={`text-[10px] ${slot.selected ? 'text-purple-100' : 'opacity-70'}`}>{slot.time}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* 選択サマリ */}
                    <div className="mt-3 p-3 bg-purple-50 border border-purple-200">
                      <div className="text-sm text-purple-900 mb-1">選択中の候補日時 (2/6)</div>
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center justify-between">
                          <span>4/19(土) 夜 18:00〜22:00</span>
                          <span className="text-purple-600 text-xs">✕ 取消</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>4/26(土) 午後 13:00〜17:00</span>
                          <span className="text-purple-600 text-xs">✕ 取消</span>
                        </div>
                      </div>
                    </div>
                    {/* 料金 */}
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-gray-500 mb-2">料金</h4>
                      <div className="border rounded p-3 space-y-1.5">
                        <div className="flex justify-between text-sm"><span className="text-gray-500">参加費（1名）</span><span className="font-medium">¥4,500</span></div>
                        <div className="flex justify-between text-sm"><span className="text-gray-500">人数</span><span className="font-medium">8名</span></div>
                        <div className="border-t pt-2 mt-2">
                          <div className="flex justify-between items-center"><span className="text-sm text-gray-500">合計</span><span className="text-base font-bold text-[#E60012]">¥36,000</span></div>
                        </div>
                      </div>
                    </div>
                    {/* 送信ボタン */}
                    <button className="w-full mt-4 py-2.5 text-base font-bold text-white rounded" style={{ backgroundColor: '#E60012' }}>貸切リクエスト確認へ (2件)</button>
                  </DemoFrame>
                </div>
                <Annotation>紫のセルが選択済みの候補日時です。灰色のセルは既に予約が入っている時間帯です</Annotation>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">2</span>
                  <p className="text-sm font-bold text-gray-900">お客様情報を入力して貸切リクエストを送信</p>
                </div>
                <p className="text-sm text-gray-600 mb-3 pl-8">お名前・連絡先を入力してリクエストを送信します。送信後、自動で貸切グループが作成されます。</p>
                <div className="bg-gray-50 rounded-lg p-3 ml-8 space-y-2">
                  <div className="border border-gray-200 rounded bg-white p-3 space-y-1.5">
                    <div className="h-9 rounded border border-gray-200 px-3 flex items-center text-sm text-gray-400" style={{ backgroundColor: '#F6F9FB' }}>お名前</div>
                    <div className="h-9 rounded border border-gray-200 px-3 flex items-center text-sm text-gray-400" style={{ backgroundColor: '#F6F9FB' }}>メールアドレス</div>
                    <div className="h-9 rounded border border-gray-200 px-3 flex items-center text-sm text-gray-400" style={{ backgroundColor: '#F6F9FB' }}>電話番号</div>
                  </div>
                  <button className="w-full py-2.5 text-sm font-medium text-white rounded bg-purple-600">貸切リクエストを送信</button>
                </div>
                <Annotation>送信にはログインが必要です。送信後、自動で貸切グループが作成され、メンバーを招待できるようになります</Annotation>
              </div>

              <PostGroupSteps startStep={3} />
              <InquiryStep />
            </div>
          )}

          {/* ===== グループで日程調整 ===== */}
          {privateMethod === 'scenario-group' && (
            <div className="space-y-4">
              <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">1</span>
                  <p className="text-sm font-bold text-gray-900">シナリオ詳細ページで「貸切リクエストを作成」をタップ</p>
                </div>
                <p className="text-sm text-gray-600 mb-3 pl-8">シナリオ詳細ページには2箇所から貸切グループを作成できます。</p>
                <div className="ml-8 space-y-3">
                  {/* 入口① ヒーロー */}
                  <div>
                    <p className="text-xs font-medium text-purple-700 mb-1.5">入口① ヒーロー部分のリンク</p>
                    <DemoFrame label="">
                      <div className="bg-gray-900 rounded overflow-hidden">
                        <div className="flex gap-3 p-3">
                          <img src="https://cznpcewciwywcqcxktba.supabase.co/storage/v1/object/public/key-visuals/1770883605761-6jmuke.jpg" alt="" className="w-20 h-28 sm:w-24 sm:h-32 rounded object-cover flex-shrink-0" />
                          <div className="flex-1 min-w-0 text-white space-y-1.5">
                            <h4 className="text-sm sm:text-base font-bold">白いウサギは歌わない</h4>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-white/70">
                              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />8人</span>
                              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />4時間</span>
                              <span className="text-white font-medium">¥4,500〜</span>
                            </div>
                            <div className="flex gap-3 pt-1">
                              <span className="text-[11px] text-white/60">公式サイト</span>
                              <span className="text-[11px] text-white/60">シェア</span>
                              <span className="text-[11px] text-purple-300 font-medium flex items-center gap-1 ring-1 ring-purple-400 rounded px-1 py-0.5">
                                <Users className="w-3 h-3" />
                                貸切リクエストを作成
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </DemoFrame>
                  </div>
                  {/* 入口② 貸切リクエストタブ */}
                  <div>
                    <p className="text-xs font-medium text-purple-700 mb-1.5">入口② 「貸切リクエスト」タブ内のボタン</p>
                    <DemoFrame label="">
                      <div className="inline-flex w-full items-center justify-center bg-gray-100 p-1 rounded-none mb-3">
                        <span className="flex-1 text-center px-2.5 py-1.5 text-sm font-medium text-gray-500">公演日程</span>
                        <span className="flex-1 text-center px-2.5 py-1.5 text-sm font-medium bg-white text-gray-900 shadow-sm">貸切リクエスト</span>
                      </div>
                      <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                        <p className="text-sm text-purple-800 mb-2">日程やメンバーが決まっていない場合</p>
                        <button className="w-full py-2 text-sm font-medium text-purple-700 bg-white border border-purple-300 rounded flex items-center justify-center gap-1.5 ring-1 ring-purple-400">
                          <Users className="w-4 h-4" />
                          まずはメンバーを招待して貸切グループを作成
                        </button>
                      </div>
                    </DemoFrame>
                  </div>
                </div>
                <Annotation>どちらをタップしても同じグループ作成ページに移動します</Annotation>
              </div>

              <PostGroupSteps startStep={2} />

              <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">5</span>
                  <p className="text-sm font-bold text-gray-900">主催者が貸切リクエストを送信</p>
                </div>
                <p className="text-sm text-gray-600 mb-3 pl-8">日程の回答が集まったら、主催者が「予約リクエストを作成」ボタンから店舗にリクエストを送信します。メンバーが全員揃っていなくても送信できます。</p>
                <div className="bg-gray-50 rounded-lg p-3 ml-8">
                  <div className="border border-gray-200 rounded bg-white p-3 space-y-2.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">参加メンバー</span>
                      <span className="font-medium text-gray-900">5/8人</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">ベスト候補日</span>
                      <span className="font-medium text-gray-900">4/19(土) 夜 <span className="text-green-600">全員◯</span></span>
                    </div>
                    <button className="w-full py-2.5 text-sm font-medium text-white rounded bg-purple-600">予約リクエストを作成</button>
                  </div>
                </div>
                <Annotation>メンバーが全員揃っていなくても送信OK。リクエスト送信後も引き続きメンバーを招待できます</Annotation>
              </div>
              <InquiryStep />
            </div>
          )}

          {/* ===== カレンダーから申込 ===== */}
          {privateMethod === 'calendar' && (
            <div className="space-y-4">
              <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">1</span>
                  <p className="text-sm font-bold text-gray-900">カレンダーで店舗を選んで、空き枠の「貸切申込」をタップ</p>
                </div>
                <p className="text-sm text-gray-600 mb-3 pl-8">カレンダーまたはリスト表示で、店舗フィルターを設定すると空き時間帯に「貸切申込」ボタンが表示されます。</p>
                <div className="bg-gray-50 rounded-lg p-3 ml-8">
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs">馬場</span>
                    を選択中
                  </div>
                  <div className="border border-gray-200 rounded bg-white overflow-hidden">
                    <div className="px-3 py-2 border-b border-gray-100 text-sm text-gray-600">4月19日(土)</div>
                    <div className="p-2.5 space-y-1.5">
                      <div className="text-sm border-l-2 px-2.5 py-1.5" style={{ borderLeftColor: '#3B82F6', backgroundColor: '#3B82F615' }}>
                        <span style={{ color: '#3B82F6' }}>13:00 馬場</span>
                        <span className="text-gray-800 ml-1.5">白いウサギは歌わない</span>
                        <span className="text-gray-500 ml-1.5">残3</span>
                      </div>
                      <button className="w-full text-sm py-2 px-2 border border-dashed border-purple-300 text-purple-600 bg-purple-50/50 font-medium rounded">
                        19:00〜 貸切申込
                      </button>
                    </div>
                  </div>
                </div>
                <Annotation>店舗を選択していないと「貸切申込」ボタンは表示されません。まず店舗フィルターを設定してください</Annotation>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">2</span>
                  <p className="text-sm font-bold text-gray-900">遊びたいシナリオを選択</p>
                </div>
                <p className="text-sm text-gray-600 mb-3 pl-8">シナリオ選択画面で、貸切で遊びたいシナリオを検索・選択します。</p>
                <div className="bg-gray-50 rounded-lg p-3 ml-8">
                  <div className="text-sm text-gray-600 mb-2">
                    <span className="font-medium text-gray-700">選択中:</span> 4月19日(土) 夜公演
                  </div>
                  <div className="border border-gray-200 rounded bg-white p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <img src="https://cznpcewciwywcqcxktba.supabase.co/storage/v1/object/public/key-visuals/1770883605761-6jmuke.jpg" alt="" className="w-10 h-14 rounded object-cover flex-shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-gray-900">白いウサギは歌わない</p>
                        <p className="text-sm text-gray-500">8人 ・ 4時間</p>
                      </div>
                      <span className="ml-auto text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded font-medium">選択中</span>
                    </div>
                  </div>
                  <div className="mt-2">
                    <button className="w-full py-2.5 text-sm font-medium text-white rounded bg-purple-600">貸切リクエスト確認へ</button>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">3</span>
                  <p className="text-sm font-bold text-gray-900">候補日時とお客様情報を入力して送信</p>
                </div>
                <p className="text-sm text-gray-600 mb-3 pl-8">候補日は最大6件まで追加できます。複数出すと、店舗側で調整しやすくなります。</p>
                <div className="bg-gray-50 rounded-lg p-3 ml-8 space-y-2">
                  <div className="border border-gray-200 rounded bg-white p-3 space-y-2">
                    <p className="text-sm font-medium text-gray-700">候補日時</p>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded">4/19(土) 夜</span>
                      <span className="text-gray-500">第1希望</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="px-2.5 py-1 bg-gray-50 text-gray-600 border border-gray-200 rounded">+ 候補日を追加</span>
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded bg-white p-3 space-y-1.5">
                    <p className="text-sm font-medium text-gray-700">お客様情報</p>
                    <div className="h-9 rounded border border-gray-200 px-3 flex items-center text-sm text-gray-400" style={{ backgroundColor: '#F6F9FB' }}>お名前</div>
                    <div className="h-9 rounded border border-gray-200 px-3 flex items-center text-sm text-gray-400" style={{ backgroundColor: '#F6F9FB' }}>メールアドレス</div>
                    <div className="h-9 rounded border border-gray-200 px-3 flex items-center text-sm text-gray-400" style={{ backgroundColor: '#F6F9FB' }}>電話番号</div>
                  </div>
                  <button className="w-full py-2.5 text-sm font-medium text-white rounded bg-purple-600">貸切リクエストを送信</button>
                </div>
                <Annotation>送信にはログインが必要です。送信後、自動で貸切グループが作成され、メンバーを招待できるようになります</Annotation>
              </div>

              <PostGroupSteps startStep={4} />
              <InquiryStep />
            </div>
          )}

          {/* よくある質問 */}
          <div className="mt-8 bg-white rounded-lg border border-purple-200 p-4 sm:p-5">
            <h3 className="text-base font-bold text-purple-700 mb-4 flex items-center gap-2">
              <HelpCircle className="w-5 h-5" />
              貸切予約でよくある質問
            </h3>
            <div className="space-y-4 text-sm">
              <div>
                <p className="font-medium text-gray-900 mb-1.5">Q. 3つの方法はどう使い分ける？</p>
                <ul className="text-gray-600 leading-relaxed space-y-1 ml-1">
                  <li className="flex gap-1.5"><span className="shrink-0">•</span><span><strong>シナリオから直接申込</strong>：シナリオが決まっていて日程を探したい場合</span></li>
                  <li className="flex gap-1.5"><span className="shrink-0">•</span><span><strong>グループで日程調整</strong>：メンバーを先に集めて日程を合わせたい場合</span></li>
                  <li className="flex gap-1.5"><span className="shrink-0">•</span><span><strong>カレンダーから申込</strong>：日程と店舗が決まっていてシナリオを選びたい場合</span></li>
                </ul>
                <p className="text-gray-500 mt-1.5 text-[13px]">どの方法でも最終的に貸切グループが作成されます。</p>
              </div>
              <div>
                <p className="font-medium text-gray-900 mb-1">Q. カレンダーに貸切申込ボタンが表示されません</p>
                <p className="text-gray-600 leading-relaxed">貸切申込ボタンは、カレンダー画面上部の<strong>店舗チェックボックスで店舗を1つ以上選択</strong>すると表示されます。また、開催日の<strong>14日前</strong>を過ぎた日程には申込できません。</p>
              </div>
              <div>
                <p className="font-medium text-gray-900 mb-1">Q. メンバーはMMQ登録が必要？</p>
                <p className="text-gray-600 leading-relaxed">貸切リクエストの送信にはログインが必要ですが、<strong>グループへの参加はMMQ未登録でも可能</strong>です（ゲスト参加OK）。</p>
              </div>
              <div>
                <p className="font-medium text-gray-900 mb-1">Q. メンバー全員をグループに追加しなくてもいい？</p>
                <p className="text-gray-600 leading-relaxed mb-2">はい、<strong>全員を追加しなくても公演に支障はありません</strong>。ただし追加すると進捗確認や予約情報の共有に便利です。</p>
                <p className="text-red-600 leading-relaxed mt-1">※ <strong>事前読み込みがあるシナリオ</strong>は、事前資料の配布にグループを使用するため<strong>全員の参加が必須</strong>です。</p>
              </div>
              <div>
                <p className="font-medium text-gray-900 mb-1">Q. リクエスト送信後の流れは？</p>
                <p className="text-gray-600 leading-relaxed">店舗側で候補日を確認し、日程を確定します。確定すると<strong>メールとグループ内の両方に通知</strong>が届きます。</p>
              </div>
              <div>
                <p className="font-medium text-gray-900 mb-1">Q. 作成した貸切グループを削除したい</p>
                <p className="text-gray-600 leading-relaxed mb-1.5">グループページ右上の<strong>歯車アイコン</strong>を押して設定を開き、「グループを削除する」から削除できます。</p>
                <p className="text-gray-600 leading-relaxed">ただし削除できるのは<strong>日程リクエストを送信する前</strong>のグループのみです。すでにリクエストを送信した場合は、お問い合わせフォームまたはメールにて「招待コード」と「削除希望」の旨をご連絡ください。</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <hr className="max-w-3xl mx-auto border-gray-200" />

      {/* ===== 便利機能 ===== */}
      <section className="max-w-3xl mx-auto px-4 py-8 md:py-10">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-6 text-center">その他の便利な機能</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="p-0 overflow-hidden border-gray-200">
            <div className="px-4 py-3 border-b border-gray-100 bg-amber-50">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600" />
                <h3 className="font-bold text-sm text-amber-700">キャンセル待ち</h3>
              </div>
            </div>
            <div className="p-4">
              <p className="text-xs text-gray-500 leading-relaxed mb-3">満席の公演でも「キャンセル待ち」ボタンから登録できます。空きが出たらメールでお知らせします。</p>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <span className="text-xs font-bold px-1.5 py-0.5 bg-gray-200 text-gray-500">満席</span>
                <span className="text-xs text-gray-500">→</span>
                <button className="px-3 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded">キャンセル待ち登録</button>
              </div>
            </div>
          </Card>
          <Card className="p-0 overflow-hidden border-gray-200">
            <div className="px-4 py-3 border-b border-gray-100 bg-pink-50">
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-pink-500" />
                <h3 className="font-bold text-sm text-pink-600">遊びたいリスト &amp; 体験済み</h3>
              </div>
            </div>
            <div className="p-4">
              <p className="text-xs text-gray-500 leading-relaxed mb-3">気になるシナリオを保存して、あとからまとめてチェック。体験済みを記録すれば重複予約も防げます。</p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-xs text-gray-600"><Heart className="w-4 h-4 text-red-500 fill-red-500" />遊びたい！</div>
                <div className="flex items-center gap-1.5 text-xs text-gray-600"><CheckCheck className="w-4 h-4 text-green-500" />体験済み</div>
              </div>
            </div>
          </Card>
          <Card className="p-0 overflow-hidden border-gray-200">
            <div className="px-4 py-3 border-b border-gray-100" style={{ backgroundColor: THEME.primaryLight }}>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" style={{ color: THEME.primary }} />
                <h3 className="font-bold text-sm" style={{ color: THEME.primary }}>店舗フィルター</h3>
              </div>
            </div>
            <div className="p-4">
              <p className="text-xs text-gray-500 leading-relaxed mb-3">カレンダー・リスト表示では店舗で絞り込みが可能。行きやすい店舗だけを表示できます。</p>
              <div className="flex flex-wrap gap-1.5">
                <span className="px-2 py-0.5 text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded">馬場</span>
                <span className="px-2 py-0.5 text-[10px] bg-orange-50 text-orange-700 border border-orange-200 rounded">大久保</span>
                <span className="px-2 py-0.5 text-[10px] bg-green-50 text-green-700 border border-green-200 rounded">別館①</span>
                <span className="px-2 py-0.5 text-[10px] bg-purple-50 text-purple-700 border border-purple-200 rounded">仮設②</span>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* CTA */}
      <section className="py-10 md:py-12" style={{ backgroundColor: THEME.primaryLight }}>
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">さっそくシナリオを探してみましょう！</h2>
          <p className="text-sm text-gray-600 mb-6">100以上のマーダーミステリーシナリオからお気に入りを見つけてください</p>
          <Link to="/">
            <Button size="lg" className="px-8 text-base font-bold" style={{ backgroundColor: THEME.primary, borderRadius: 0 }}>
              シナリオを探す
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </div>
      </section>
    </PublicLayout>
  )
}
