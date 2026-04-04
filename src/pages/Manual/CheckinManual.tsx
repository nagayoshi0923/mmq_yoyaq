/**
 * 受付・チェックインマニュアル
 * スタッフ向け：お客さまの予約確認とチェックイン手順
 */
import {
  CheckCircle, AlertTriangle, HelpCircle,
  ChevronDown, ChevronUp, Users, Clock, LayoutDashboard, CalendarDays
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/* 共通コンポーネント                                                    */
/* ------------------------------------------------------------------ */

function Step({ num, color, title, children, last }: {
  num: number
  color: string
  title: string
  children: React.ReactNode
  last?: boolean
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0"
          style={{ backgroundColor: color }}
        >
          {num}
        </div>
        {!last && <div className="w-0.5 flex-1 bg-gray-200 mt-2" />}
      </div>
      <div className="pb-8 flex-1">
        <h3 className="font-bold text-base text-gray-900 mt-2">{title}</h3>
        <div className="mt-2 text-sm text-gray-700 leading-relaxed space-y-3">
          {children}
        </div>
      </div>
    </div>
  )
}

function TroubleRow({ q, a }: { q: string; a: string }) {
  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="flex gap-2 items-start">
        <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
        <p className="font-medium text-sm">{q}</p>
      </div>
      <p className="text-sm text-muted-foreground pl-6">{a}</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* UIモック                                                              */
/* ------------------------------------------------------------------ */

/** ダッシュボード「直近の出勤予定」モック */
function DashboardUpcomingMock() {
  const events = [
    { date: '4/5', day: '土', title: '境界線のカーサスベリ', time: '14:00', store: '高田馬場', count: 8, max: 8, highlight: true },
    { date: '4/6', day: '日', title: '女皇の書架', time: '19:00', store: '別館①', count: 5, max: 8 },
    { date: '4/7', day: '月', title: '悪意の岐路に立つ', time: '10:00', store: '大久保', count: 2, max: 8 },
  ]
  return (
    <div className="border rounded-lg bg-white shadow-sm overflow-hidden max-w-sm">
      {/* ヘッダー */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-gray-50">
        <Clock className="h-4 w-4 text-blue-600" />
        <span className="text-sm font-bold text-gray-800">直近の出勤予定</span>
        <span className="text-xs text-gray-400">（3件）</span>
      </div>
      {/* 一覧 */}
      <div className="divide-y divide-gray-100">
        {events.map((ev, i) => (
          <div
            key={i}
            className={`px-3 py-2 flex items-center gap-3 ${ev.highlight ? 'bg-blue-50' : 'bg-white'}`}
          >
            {/* 日付 */}
            <div className="text-center flex-shrink-0 w-10">
              <div className="text-xs text-gray-500">{ev.date}</div>
              <div className="text-[10px] text-gray-400">{ev.day}</div>
            </div>
            {/* タイトル・場所 */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">{ev.title}</div>
              <div className="text-xs text-gray-400">{ev.time}〜 @ {ev.store}</div>
            </div>
            {/* 人数 */}
            <div className="text-xs text-gray-400 flex-shrink-0">{ev.count}/{ev.max}名</div>
          </div>
        ))}
      </div>
      {/* タップ指示 */}
      {events[0].highlight && (
        <div className="px-3 py-1.5 bg-blue-50 border-t border-blue-100 text-center">
          <span className="text-[11px] text-blue-600 font-medium">↑ この行をタップして開く</span>
        </div>
      )}
    </div>
  )
}

/** 公演編集ダイアログ全体モック */
function ModalTabsMock({ active }: { active: 'edit' | 'reservations' }) {
  const tabs = [
    { id: 'edit', label: '公演情報' },
    { id: 'reservations', label: '予約者' },
    { id: 'survey', label: 'アンケート' },
    { id: 'history', label: '更新履歴' },
  ]
  return (
    <div className="border rounded-lg bg-white shadow-sm overflow-hidden" style={{ maxWidth: 600 }}>
      {/* ダイアログヘッダー */}
      <div className="px-4 pt-4 pb-3 border-b flex items-start justify-between">
        <div>
          <div className="font-bold text-base text-gray-900">公演を編集</div>
          <div className="text-xs text-gray-400 mt-0.5">公演の詳細情報を編集してください。</div>
        </div>
        <span className="text-gray-400 text-lg leading-none cursor-pointer">✕</span>
      </div>
      {/* タブ */}
      <div className="grid grid-cols-4 bg-gray-100 gap-0.5 p-1 mx-3 mt-3 rounded-md">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`text-center py-1 rounded text-[11px] font-medium ${
              tab.id === active
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500'
            }`}
          >
            {tab.label}
            {tab.id === 'reservations' && (
              <span className={`ml-0.5 text-[10px] rounded px-1 ${
                tab.id === active ? 'bg-gray-100' : 'bg-gray-200'
              }`}>6/6名</span>
            )}
            {tab.id === 'reservations' && tab.id === active && (
              <span className="ml-0.5 text-[10px] text-blue-600 font-semibold">（内スタッフ2）</span>
            )}
          </div>
        ))}
      </div>
      {/* コンテンツ */}
      {active === 'reservations' && (
        <div className="px-3 py-2 space-y-0">
          {/* テーブルヘッダー */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-t border text-[10px] text-gray-400 font-medium mt-1">
            <div className="w-4 flex-shrink-0" />
            <div className="flex-1">顧客名</div>
            <div className="w-12 text-center">人数</div>
            <div className="w-20 text-center">予約日時</div>
            <div className="w-16 text-center">ステータス</div>
            <div className="w-20" />
          </div>
          <div className="border border-t-0 rounded-b divide-y">
            <ReservationRowMock name="山田 太郎" count={2} date="4/5 14:00" />
            <ReservationRowMock name="田中 花子" count={1} date="4/5 14:00" isStaff />
            <ReservationRowMock name="鈴木 一郎" count={1} date="4/5 14:00" isStaff />
            <ReservationRowMock name="佐藤 誠" count={1} date="4/5 14:00" checkedIn />
            <ReservationRowMock name="高橋 純" count={1} date="4/5 14:00" checkedIn />
          </div>
        </div>
      )}
      {active === 'edit' && (
        <div className="p-3 text-xs text-gray-400 text-center py-6">
          （公演情報タブ）
        </div>
      )}
      {/* フッター */}
      <div className="px-4 py-3 border-t flex items-center justify-between mt-2">
        <div className="text-xs text-gray-500 flex items-center gap-2">
          <span>240h</span>
          <span className="text-gray-300">|</span>
          <span>最大6名</span>
          <span className="text-gray-300">|</span>
          <span>¥4,000</span>
        </div>
        <div className="flex gap-2">
          <button className="text-xs border rounded px-3 py-1.5 text-gray-700 bg-white">キャンセル</button>
          <button className="text-xs rounded px-3 py-1.5 bg-gray-900 text-white font-medium">保存</button>
        </div>
      </div>
    </div>
  )
}

/** 予約一覧の1行モック（実際のUI準拠：横並び1行レイアウト） */
function ReservationRowMock({
  name,
  count,
  date,
  checkedIn,
  cancelled,
  isStaff,
}: {
  name: string
  count: number
  date: string
  checkedIn?: boolean
  cancelled?: boolean
  isStaff?: boolean
}) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 bg-white ${cancelled ? 'opacity-60' : ''}`}>
      {/* チェックボックス */}
      <div className="w-4 h-4 border border-gray-300 rounded flex-shrink-0" />
      {/* 名前 + バッジ */}
      <div className="flex items-center gap-1.5 w-28 flex-shrink-0">
        <span className={`font-medium text-sm ${cancelled ? 'line-through text-gray-400' : 'text-gray-900'}`}>
          {name}
        </span>
        {cancelled && (
          <span className="text-[10px] bg-red-100 text-red-600 border border-red-200 rounded px-1 py-0.5 flex-shrink-0">キャンセル済</span>
        )}
        {isStaff && !cancelled && (
          <span className="text-[10px] bg-blue-100 text-blue-600 border border-blue-200 rounded px-1 py-0.5 flex-shrink-0">スタッフ</span>
        )}
      </div>
      {/* 人数 */}
      {cancelled ? (
        <span className="w-12 text-xs text-gray-400 text-center flex-shrink-0">{count}名</span>
      ) : (
        <div className="flex items-center gap-0.5 border rounded px-1.5 py-0.5 text-xs text-gray-700 w-14 flex-shrink-0">
          {count}名 <ChevronDown className="w-3 h-3 text-gray-400" />
        </div>
      )}
      {/* 日時 */}
      <span className="text-xs text-gray-400 w-16 text-center flex-shrink-0">{date}</span>
      {/* ステータス */}
      {cancelled ? (
        <span className="text-xs text-red-500 w-16 flex-shrink-0">キャンセル済</span>
      ) : checkedIn ? (
        <span className="text-xs text-green-600 font-semibold flex items-center gap-1 w-16 flex-shrink-0">
          <CheckCircle className="w-3 h-3" /> 来店済
        </span>
      ) : (
        <>
          <div className="flex items-center gap-0.5 border rounded px-2 py-0.5 text-xs text-gray-700 w-16 flex-shrink-0">
            確定 <ChevronDown className="w-3 h-3 text-gray-400" />
          </div>
          <button className="text-xs border border-green-300 text-green-700 rounded px-2 py-1 bg-white font-medium flex-shrink-0">
            チェックイン
          </button>
        </>
      )}
      {/* 詳細 */}
      <button className="text-xs text-gray-400 flex items-center gap-0.5 flex-shrink-0 ml-auto">
        詳細 <ChevronDown className="w-3 h-3" />
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* メインコンポーネント                                                   */
/* ------------------------------------------------------------------ */

export function CheckinManual() {
  return (
    <div className="space-y-10 max-w-3xl mx-auto pb-12">

      {/* タイトル */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">受付・チェックイン</h2>
        <p className="text-muted-foreground leading-relaxed">
          お客さまが来店されたら、予約を確認して「チェックイン」ボタンを押します。
          チェックインで来店記録が残り、参加者数の管理に使われます。
        </p>
      </div>

      {/* ルート選択 */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="border-2 border-blue-200 rounded-xl p-4 bg-blue-50 space-y-2">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-blue-600" />
            <span className="font-bold text-blue-800">ダッシュボードから</span>
            <span className="text-[10px] bg-blue-600 text-white rounded px-1.5 py-0.5 font-bold">簡単</span>
          </div>
          <p className="text-xs text-blue-700 leading-relaxed">
            ホーム画面の「直近の出勤予定」から今日の公演をすぐに開けます。
            スケジュール管理画面へ移動せず、そのままチェックインまで完結します。
          </p>
        </div>
        <div className="border rounded-xl p-4 bg-gray-50 space-y-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-gray-600" />
            <span className="font-bold text-gray-700">スケジュール管理から</span>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            ナビゲーションの「スケジュール」から本日の公演を探してタップします。
            他の公演を探したり、編集も同時に行いたい場合はこちらを使います。
          </p>
        </div>
      </section>

      {/* ─────────────── ダッシュボード動線 ─────────────── */}
      <section className="space-y-2">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <LayoutDashboard className="h-4 w-4 text-blue-600" />
          </div>
          <h3 className="text-lg font-semibold">ダッシュボードからの手順</h3>
        </div>

        <Step num={1} color="#3b82f6" title="ホーム画面の「直近の出勤予定」を確認する">
          <p>
            ログイン後のホーム画面（ダッシュボード）に、今日以降の出勤予定が最大5件表示されます。
            今日の公演の行をタップしてください。
          </p>
          <div className="mt-3">
            <DashboardUpcomingMock />
          </div>
        </Step>

        <Step num={2} color="#3b82f6" title="公演ダイアログが開いたら「予約者」タブを選ぶ">
          <p>
            タップすると公演の詳細ダイアログが開きます。
            上部タブの <strong>「予約者」</strong> を選ぶと予約一覧が表示されます。
          </p>
          <div className="mt-3">
            <ModalTabsMock active="edit" />
          </div>
          <div className="flex items-center gap-2 mt-3 text-xs text-gray-500 bg-gray-50 border rounded p-2">
            <span>↓「予約者」タブを選んだ状態</span>
          </div>
          <div className="mt-1">
            <ModalTabsMock active="reservations" />
          </div>
        </Step>

        <Step num={3} color="#3b82f6" title="お客さまの名前・人数を確認する">
          <p>
            予約者の名前・人数が一覧で表示されます。来店されたお客さまの行を確認してください。
          </p>
          <div className="space-y-2 mt-2">
            <ReservationRowMock name="山田 太郎" count={2} date="4/5 14:00" />
            <ReservationRowMock name="田中 花子" count={1} date="4/5 14:00" />
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-xs text-gray-600 space-y-1 mt-2">
            <p className="font-medium">確認すること：</p>
            <p>・<strong>お名前</strong>：予約者名と一致しているか</p>
            <p>・<strong>人数</strong>：来店された人数と合っているか（違う場合は人数ボタンで変更）</p>
            <p>・<strong>支払方法</strong>：「詳細」を開くと支払い情報を確認できます</p>
          </div>
        </Step>

        <Step num={4} color="#22a861" title="「チェックイン」ボタンを押す" last>
          <p>
            確認が完了したら、右側の <strong>「チェックイン」</strong> ボタンを押します。
            押すと「✓ 来店済」に変わり、受付完了です。
          </p>
          <div className="space-y-2 mt-2">
            <p className="text-xs text-gray-400">チェックイン前：</p>
            <ReservationRowMock name="山田 太郎" count={2} date="4/5 14:00" />
            <p className="text-xs text-gray-400 mt-3">チェックイン後：</p>
            <ReservationRowMock name="山田 太郎" count={2} date="4/5 14:00" checkedIn />
          </div>
          <div className="mt-3 bg-green-50 border border-green-200 rounded-md p-3 flex gap-2">
            <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-800">
              「✓ 来店済」になったら受付完了です。ダイアログはそのまま閉じて大丈夫です。
            </p>
          </div>
        </Step>
      </section>

      {/* ─────────────── よくあるトラブル ─────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <HelpCircle className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">よくあるトラブルと対応</h3>
        </div>

        <TroubleRow
          q="ダッシュボードに今日の公演が表示されない"
          a="スタッフ情報にGMとして登録されていない可能性があります。スケジュール管理でGM欄を確認してください。また、ログイン直後はデータ読み込みに数秒かかる場合があります。"
        />
        <TroubleRow
          q="予約一覧にお客さまの名前がない"
          a="お客様のマイページ予約詳細・予約確認メールで予約内容を確認してください。内容に問題があれば運営に即電話で連絡してください。"
        />
        <TroubleRow
          q="人数が来店者数と違う"
          a="お客様のマイページ予約詳細・予約確認メールで申込人数を確認してください。内容に問題があれば運営に即電話で連絡してください。"
        />
        <TroubleRow
          q="ステータスが「保留中」になっている"
          a="「確定」に変更してからチェックインしてください。ステータス表示部分がドロップダウンになっています。"
        />
        <TroubleRow
          q="「チェックイン」ボタンが表示されない"
          a="すでにチェックイン済（「✓ 来店済」表示）か、キャンセル済の予約です。"
        />
      </section>

    </div>
  )
}
