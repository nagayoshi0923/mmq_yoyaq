/**
 * 事前アンケート・配役マニュアル
 * スタッフ向け：アンケート受領 → 回答確認 → 配役 → 個別お知らせ送信の手順
 */
import {
  CheckCircle, AlertTriangle, HelpCircle,
  ChevronDown, Users, ClipboardList, Send,
  MessageSquare, Link, FileText, User, Clock,
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
/* お客様画面のモック                                                     */
/* ------------------------------------------------------------------ */

/** お客様側：進行ステップカードのモック */
function CustomerStepsMock() {
  return (
    <div className="border rounded-lg bg-white shadow-sm overflow-hidden max-w-sm">
      <div className="p-3 space-y-2">
        <div className="text-xs font-bold text-gray-500 mb-2">進行ステップ</div>

        {/* STEP 5 */}
        <div className="flex items-center gap-3 p-2 rounded-lg border bg-green-50 border-green-200">
          <div className="w-5 h-5 rounded-full bg-green-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
            <CheckCircle className="w-3 h-3" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm">日程確定</span>
            <span className="text-xs text-muted-foreground ml-2">確定！</span>
          </div>
        </div>

        {/* STEP 6 */}
        <div className="flex items-center gap-3 p-2 rounded-lg border bg-amber-50 border-amber-200">
          <div className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
            6
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm">事前アンケート</span>
            <span className="text-xs text-muted-foreground ml-2">回答してください</span>
          </div>
        </div>

        {/* STEP 7 */}
        <div className="flex items-center gap-3 p-2 rounded-lg border bg-gray-50 border-gray-200">
          <div className="w-5 h-5 rounded-full bg-gray-400 text-white flex items-center justify-center text-xs font-bold shrink-0">
            7
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm">配役確定</span>
            <span className="text-xs text-muted-foreground ml-2">アンケート後</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** お客様側：配役方法選択カード（チャット内）のモック */
function CharAssignmentMethodMock() {
  return (
    <div className="flex justify-center">
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
            <Users className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-semibold text-sm">キャラクターの配役方法</span>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          キャラクターの配役をどのように決めますか？
        </p>
        <div className="space-y-2">
          <div className="w-full h-auto py-3 flex flex-col items-start gap-0.5 border border-purple-200 bg-purple-100 rounded-md px-3">
            <span className="font-medium text-sm text-purple-800">アンケートで希望を伝える</span>
            <span className="text-[10px] text-muted-foreground">スタッフが決定します</span>
          </div>
          <div className="w-full h-auto py-3 flex flex-col items-start gap-0.5 border border-purple-200 bg-white rounded-md px-3">
            <span className="font-medium text-sm">自分たちで決める</span>
            <span className="text-[10px] text-muted-foreground">参加者同士で選択します</span>
          </div>
        </div>
        <div className="mt-2 text-center">
          <span className="text-[11px] text-purple-600 font-medium">↑ 主催者のチャット画面に表示されます</span>
        </div>
      </div>
    </div>
  )
}

/** お客様側：アンケートフォームのモック */
function SurveyFormMock() {
  return (
    <div className="border border-purple-200 rounded-lg bg-white shadow-sm overflow-hidden max-w-sm">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-purple-600" />
            <h3 className="text-base font-semibold">公演前アンケート</h3>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span>回答期限（目安）: 4/8(水)</span>
        </div>

        {/* Q1 */}
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            Q1. プレイ経験はありますか？
            <span className="text-red-500 text-xs">*必須</span>
          </label>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full border-2 border-purple-600 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-purple-600" />
              </div>
              <span className="text-sm">初めて</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
              <span className="text-sm">1〜3回</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
              <span className="text-sm">4回以上</span>
            </div>
          </div>
        </div>

        {/* Q2 */}
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            Q2. 希望や要望があればお聞かせください
          </label>
          <div className="border rounded-md p-2 text-sm text-gray-400 bg-[#F6F9FB] min-h-[60px]">
            回答を入力してください
          </div>
        </div>

        <button className="w-full bg-purple-600 text-white rounded-md py-2 text-sm font-medium">
          回答を送信する
        </button>
      </div>
    </div>
  )
}

/** お客様側：個別お知らせ表示のモック */
function IndividualNoticeMock() {
  return (
    <div className="flex justify-center">
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 w-full max-w-sm">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-bold">!</span>
          </div>
          <div>
            <p className="text-sm font-medium text-indigo-800">
              山田 太郎さんへのお知らせ
            </p>
            <p className="text-xs text-muted-foreground">
              4/9 14:30
            </p>
          </div>
        </div>
        <div className="bg-white rounded-lg p-3 mt-2 border border-indigo-100">
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {`公演ではエリカ役をお願いいたします。
以下の資料をご確認ください。

【エリカの資料】
https://example.com/character/erica`}
          </p>
        </div>
        <p className="text-xs text-indigo-400 mt-2 text-center">
          🔒 このお知らせはあなただけに表示されています
        </p>
      </div>
    </div>
  )
}

/** お客様側：事前読み込み通知のモック */
function PreReadingNoticeMock() {
  return (
    <div className="flex justify-center">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 bg-amber-600 rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-bold">!</span>
          </div>
          <div>
            <p className="text-sm font-medium text-amber-800">
              事前読み込みについて
            </p>
            <p className="text-xs text-muted-foreground">
              4/8 10:00
            </p>
          </div>
        </div>
        <div className="bg-white rounded-lg p-3 border border-amber-100">
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {`このシナリオは事前読み込みがあります。
公演当日までに資料を読んでおいてください。

個別にお知らせでキャラクター資料をお送りしますので、ご確認ください。`}
          </p>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* スタッフ画面のモック                                                    */
/* ------------------------------------------------------------------ */

/** スタッフ側：公演モーダルのアンケートタブモック */
function SurveyTabMock() {
  const tabs = [
    { id: 'edit', label: '公演情報' },
    { id: 'reservations', label: '予約者' },
    { id: 'survey', label: 'アンケート' },
    { id: 'history', label: '更新履歴' },
  ]
  return (
    <div className="border rounded-lg bg-white shadow-sm overflow-hidden" style={{ maxWidth: 600 }}>
      <div className="px-4 pt-4 pb-3 border-b flex items-start justify-between">
        <div>
          <div className="font-bold text-base text-gray-900">公演を編集</div>
          <div className="text-xs text-gray-400 mt-0.5">4/12(土) 14:00〜 @ 高田馬場</div>
        </div>
        <span className="text-gray-400 text-lg leading-none cursor-pointer">✕</span>
      </div>
      <div className="grid grid-cols-4 bg-gray-100 gap-0.5 p-1 mx-3 mt-3 rounded-md">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`text-center py-1 rounded text-[11px] font-medium ${
              tab.id === 'survey'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500'
            }`}
          >
            {tab.label}
          </div>
        ))}
      </div>
      <div className="px-3 py-3">
        <SurveyResponsesMock />
      </div>
    </div>
  )
}

/** スタッフ側：アンケート回答一覧のモック */
function SurveyResponsesMock() {
  return (
    <div className="space-y-3">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <ClipboardList className="w-4 h-4 text-purple-600" />
          事前アンケート回答
        </h3>
        <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 font-medium">
          5/6名回答
        </span>
      </div>

      {/* メンバー一覧 */}
      <div className="space-y-2">
        {/* 展開されたメンバー */}
        <div className="border rounded-lg overflow-hidden">
          <div className="w-full flex items-center justify-between p-3 bg-white">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-500" />
              <span className="font-medium text-sm">山田 太郎</span>
              <span className="text-xs bg-green-100 text-green-700 border border-green-200 rounded-full px-2 py-0.5">
                回答済み
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </div>
          <div className="border-t bg-gray-50">
            <div className="p-3 space-y-3">
              <div className="bg-white rounded p-2">
                <p className="text-xs text-muted-foreground mb-1">Q1. プレイ経験はありますか？</p>
                <p className="text-sm font-medium">初めて</p>
              </div>
              <div className="bg-white rounded p-2">
                <p className="text-xs text-muted-foreground mb-1">Q2. 希望や要望</p>
                <p className="text-sm font-medium">女性キャラクターを希望します</p>
              </div>
            </div>

            {/* 個別メッセージ送信 */}
            <div className="border-t p-3">
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                山田 太郎さんへ個別にお知らせ
              </p>
              <div className="mb-2">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Link className="w-3 h-3" />
                  資料URLを添付
                </p>
                <div className="flex items-center gap-2 border rounded-md px-2 py-1.5 text-sm bg-white">
                  <span className="text-gray-900">エリカ</span>
                  <ChevronDown className="w-3 h-3 text-gray-400 ml-auto" />
                </div>
              </div>
              <div className="mb-2">
                <label className="flex items-start gap-2">
                  <div className="w-4 h-4 border-2 border-blue-600 rounded flex items-center justify-center mt-0.5 bg-blue-600">
                    <CheckCircle className="w-3 h-3 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      定型文を添付
                    </span>
                    <p className="text-xs text-muted-foreground bg-gray-100 rounded px-2 py-1 mt-1">
                      公演ではこちらのキャラクターをお願いいたします。資料をお読みいただき、当日までにご準備ください。
                    </p>
                  </div>
                </label>
              </div>
              <div className="border rounded-md p-2 text-sm text-gray-400 bg-[#F6F9FB] min-h-[40px]">
                メッセージを入力...
              </div>
              <div className="flex justify-end mt-2">
                <button className="text-xs bg-blue-600 text-white rounded px-3 py-1.5 flex items-center gap-1 font-medium">
                  <Send className="w-3 h-3" />
                  送信
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 折りたたまれたメンバー */}
        <MemberRowMock name="田中 花子" status="responded" />
        <MemberRowMock name="鈴木 一郎" status="responded" />
        <MemberRowMock name="佐藤 誠" status="responded" />
        <MemberRowMock name="高橋 純" status="responded" />
        <MemberRowMock name="渡辺 美咲" status="pending" />
      </div>
    </div>
  )
}

/** スタッフ側：個別お知らせ送信UIのモック（実際の画面に近い形） */
function IndividualNoticeSendMock() {
  return (
    <div className="border rounded-lg bg-white shadow-sm overflow-hidden max-w-md">
      {/* メンバーヘッダー */}
      <div className="flex items-center justify-between p-3 bg-white border-b">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-gray-500" />
          <span className="font-medium text-sm">山田 太郎</span>
          <span className="text-xs bg-green-100 text-green-700 border border-green-200 rounded-full px-2 py-0.5">
            回答済み
          </span>
        </div>
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </div>

      {/* 回答表示エリア */}
      <div className="bg-gray-50 p-3 space-y-2 border-b">
        <div className="bg-white rounded p-2">
          <p className="text-xs text-muted-foreground mb-1">Q1. プレイ経験はありますか？</p>
          <p className="text-sm font-medium">初めて</p>
        </div>
        <div className="bg-white rounded p-2">
          <p className="text-xs text-muted-foreground mb-1">Q2. 希望や要望</p>
          <p className="text-sm font-medium">女性キャラクターを希望します</p>
        </div>
      </div>

      {/* 個別お知らせ送信セクション */}
      <div className="p-3 space-y-3">
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <MessageSquare className="w-3 h-3" />
          山田 太郎さんへ個別にお知らせ
        </p>

        {/* ① キャラクター選択 */}
        <div className="relative">
          <div className="absolute -left-1 -top-1 w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center text-[9px] text-white font-bold z-10">①</div>
          <div>
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1 pl-4">
              <Link className="w-3 h-3" />
              資料URLを添付
            </p>
            <div className="flex items-center gap-2 border rounded-md px-2 py-1.5 text-sm bg-white">
              <span className="text-gray-900">エリカ</span>
              <ChevronDown className="w-3 h-3 text-gray-400 ml-auto" />
            </div>
            <p className="text-[10px] text-blue-600 mt-1 pl-1">← キャラを選ぶと資料URLと説明文が自動添付されます</p>
          </div>
        </div>

        {/* ② 定型文チェック */}
        <div className="relative">
          <div className="absolute -left-1 -top-1 w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center text-[9px] text-white font-bold z-10">②</div>
          <label className="flex items-start gap-2 pl-4">
            <div className="w-4 h-4 border-2 border-blue-600 rounded flex items-center justify-center mt-0.5 bg-blue-600 shrink-0">
              <CheckCircle className="w-3 h-3 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <FileText className="w-3 h-3" />
                定型文を添付
              </span>
              <p className="text-xs text-muted-foreground bg-gray-100 rounded px-2 py-1 mt-1 whitespace-pre-wrap">
                公演ではこちらのキャラクターをお願いいたします。資料をお読みいただき、当日までにご準備ください。
              </p>
            </div>
          </label>
          <p className="text-[10px] text-blue-600 mt-1 pl-5">← シナリオ編集の「アンケート設定」で事前登録（任意）</p>
        </div>

        {/* ③ メッセージ入力 */}
        <div className="relative">
          <div className="absolute -left-1 -top-1 w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center text-[9px] text-white font-bold z-10">③</div>
          <div className="pl-4">
            <div className="border rounded-md p-2 text-sm text-gray-500 bg-[#F6F9FB] min-h-[50px]">
              追加メッセージを入力...（任意）
            </div>
          </div>
        </div>

        {/* ④ 送信ボタン */}
        <div className="relative flex justify-end">
          <div className="absolute -right-1 -top-1 w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center text-[9px] text-white font-bold z-10">④</div>
          <button className="text-xs bg-blue-600 text-white rounded px-4 py-1.5 flex items-center gap-1.5 font-medium">
            <Send className="w-3 h-3" />
            送信
          </button>
        </div>

        {/* 送信履歴 */}
        <div className="pt-2 border-t border-dashed">
          <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-green-500" />
            送信履歴
          </p>
          <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
            <span>4/9 14:30</span>
            <span>運営スタッフ</span>
            <span className="text-[9px] border rounded px-1 py-0.5">エリカ</span>
            <span className="text-green-600">✓</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function MemberRowMock({ name, status }: { name: string; status: 'responded' | 'pending' }) {
  return (
    <div className="border rounded-lg">
      <div className="w-full flex items-center justify-between p-3 bg-white">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-gray-500" />
          <span className="font-medium text-sm">{name}</span>
          <span className={`text-xs rounded-full px-2 py-0.5 border ${
            status === 'responded'
              ? 'bg-green-100 text-green-700 border-green-200'
              : 'bg-amber-100 text-amber-700 border-amber-200'
          }`}>
            {status === 'responded' ? '回答済み' : '未回答'}
          </span>
        </div>
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* メインコンポーネント                                                   */
/* ------------------------------------------------------------------ */

export function PreReadingSurveyManual() {
  return (
    <div className="space-y-10 max-w-3xl mx-auto pb-12">

      {/* タイトル */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">事前アンケート・配役</h2>
        <p className="text-muted-foreground leading-relaxed">
          貸切公演のお客様にアンケートを送り、回答を確認してキャラクターを配役するまでの手順です。
          お客様のチャット画面に表示されるUIを交えて説明します。
        </p>
      </div>

      {/* 全体フロー概要 */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold">全体の流れ</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="border-2 border-purple-200 rounded-xl p-4 bg-purple-50 space-y-2">
            <span className="font-bold text-purple-800">配役方法①：アンケートで希望を伝える</span>
            <p className="text-xs text-purple-700 leading-relaxed">
              お客様がアンケートで希望を回答 → スタッフが回答を確認して配役を決定 → 個別お知らせで資料送付。
              <strong>事前読み込みがあるシナリオではこちらが推奨</strong>です。
            </p>
          </div>
          <div className="border rounded-xl p-4 bg-gray-50 space-y-2">
            <span className="font-bold text-gray-700">配役方法②：自分たちで決める</span>
            <p className="text-xs text-gray-600 leading-relaxed">
              お客様同士がチャット内で希望キャラを選択 → 主催者が最終確定。
              スタッフの介入なしでお客様が完結できます。
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════════ PART 1: お客様に見える画面 ═══════════════ */}
      <section className="space-y-2">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
            <Users className="h-4 w-4 text-purple-600" />
          </div>
          <h3 className="text-lg font-semibold">お客様に見える画面（グループ招待ページ）</h3>
        </div>

        <div className="bg-gray-50 border rounded-lg p-4 mb-4">
          <p className="text-sm text-gray-600">
            お客様はグループ招待リンク（<code className="bg-gray-200 rounded px-1">/group/invite/xxxx</code>）から
            参加し、以下の流れで進みます。
          </p>
        </div>

        <Step num={1} color="#9333ea" title="日程確定 → ステップ表示が更新される">
          <p>
            店舗が日程を承認すると、お客様の画面に進行ステップが表示されます。
            <strong>STEP 6「事前アンケート」</strong>と<strong>STEP 7「配役確定」</strong>が追加されます。
          </p>
          <div className="mt-3">
            <CustomerStepsMock />
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mt-3 text-xs text-blue-700">
            キャラクター設定がないシナリオでは STEP 6・7 は表示されません。
          </div>
        </Step>

        <Step num={2} color="#9333ea" title="主催者がチャットで配役方法を選択">
          <p>
            日程確定後、<strong>主催者のチャット画面にのみ</strong>配役方法の選択カードが表示されます。
            主催者以外のメンバーには表示されません。
          </p>
          <div className="mt-3">
            <CharAssignmentMethodMock />
          </div>
          <div className="space-y-1 mt-3 text-xs text-gray-500">
            <p><strong>「アンケートで希望を伝える」</strong>→ スタッフが配役を決定するフロー（以降の手順で説明）</p>
            <p><strong>「自分たちで決める」</strong>→ お客様同士でキャラを選び、主催者が確定するフロー</p>
          </div>
        </Step>

        <Step num={3} color="#9333ea" title="お客様がアンケートに回答する">
          <p>
            「アンケートで希望を伝える」が選択されると、各メンバーの画面に<strong>公演前アンケートフォーム</strong>が表示されます。
            お客様はこのフォームから回答を送信します。
          </p>
          <div className="mt-3">
            <SurveyFormMock />
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-md p-3 mt-3 text-xs text-gray-600 space-y-1">
            <p><strong>質問の種類：</strong>テキスト入力、単一選択、複数選択、5段階評価</p>
            <p><strong>回答期限：</strong>シナリオ設定の「回答期限（公演の○日前まで）」に基づく目安が表示されます</p>
            <p><strong>再編集：</strong>公演日まで何度でも回答を更新できます</p>
          </div>
        </Step>

        <Step num={4} color="#9333ea" title="事前読み込み通知がチャットに届く">
          <p>
            シナリオに「事前読み込みあり」が設定されている場合、日程確定時にチャットへ<strong>事前読み込みについての通知</strong>が自動投稿されます。
          </p>
          <div className="mt-3">
            <PreReadingNoticeMock />
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mt-3 text-xs text-amber-700">
            通知のメッセージ内容は「設定 → 全体設定 → 事前読み込み通知設定」から編集できます。
          </div>
        </Step>

        <Step num={5} color="#9333ea" title="スタッフからの個別お知らせが届く" last>
          <p>
            スタッフが配役を決定し個別お知らせを送ると、
            <strong>対象者本人だけに</strong>チャット内でメッセージが表示されます。
            他のメンバーには見えません。
          </p>
          <div className="mt-3">
            <IndividualNoticeMock />
          </div>
          <div className="bg-indigo-50 border border-indigo-200 rounded-md p-3 mt-3 text-xs text-indigo-700">
            🔒 このお知らせは対象のお客様本人にのみ表示されます。他のグループメンバーには見えません。
          </div>
        </Step>
      </section>

      {/* ═══════════════ PART 2: スタッフの操作手順 ═══════════════ */}
      <section className="space-y-2">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <ClipboardList className="h-4 w-4 text-blue-600" />
          </div>
          <h3 className="text-lg font-semibold">スタッフの操作手順（アンケート確認 → 配役）</h3>
        </div>

        <Step num={1} color="#3b82f6" title="スケジュール管理から公演を開く">
          <p>
            ナビゲーションの<strong>「スケジュール」</strong>から対象日の公演をタップして、公演編集ダイアログを開きます。
          </p>
        </Step>

        <Step num={2} color="#3b82f6" title="「アンケート」タブでアンケート回答を確認する">
          <p>
            公演ダイアログ上部の<strong>「アンケート」タブ</strong>を選択します。
            回答状況（○/○名回答）と各メンバーの回答内容を確認できます。
          </p>
          <div className="mt-3">
            <SurveyTabMock />
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-md p-3 mt-3 text-xs text-gray-600 space-y-1">
            <p>・メンバーの行をタップすると回答が展開されます</p>
            <p>・右上のバッジで回答状況を確認できます（全員回答済みは緑、未完了は黄色）</p>
          </div>
        </Step>

        <Step num={3} color="#3b82f6" title="回答を確認し、配役を決定する">
          <p>
            各メンバーの回答（希望や要望など）を確認して、キャラクターの配役を決定します。
            配役はシステム上で決定ボタンを押す操作はなく、
            <strong>次のステップでお知らせを送信することで配役を伝えます</strong>。
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mt-3 text-xs text-blue-700 space-y-1">
            <p><strong>配役のコツ：</strong></p>
            <p>・お客様の希望を尊重しつつ、性別やキャラ設定を考慮する</p>
            <p>・初心者にはわかりやすい役を割り当てると満足度が上がります</p>
          </div>
        </Step>

        <Step num={4} color="#3b82f6" title="各メンバーに個別お知らせを送信する" last>
          <p>
            メンバーを展開すると下部に<strong>「○○さんへ個別にお知らせ」</strong>セクションがあります。
            以下の画面から個別にお知らせを送信します。
          </p>

          <div className="mt-3">
            <IndividualNoticeSendMock />
          </div>

          <div className="mt-4 bg-green-50 border border-green-200 rounded-md p-3 flex gap-2">
            <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-800">
              全メンバーへの送信が完了したら配役完了です。お客様はチャットから資料を確認して準備を進めます。
            </p>
          </div>
        </Step>
      </section>

      {/* ═══════════════ 貸切管理画面からの確認 ═══════════════ */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <FileText className="h-4 w-4 text-green-600" />
          </div>
          <h3 className="text-lg font-semibold">別の確認方法：貸切管理画面</h3>
        </div>
        <div className="border rounded-lg p-4 bg-gray-50 space-y-2">
          <p className="text-sm text-gray-700">
            スケジュール管理以外にも、ナビゲーションの<strong>「貸切管理」</strong>からアンケート回答を確認できます。
          </p>
          <p className="text-sm text-gray-700">
            貸切リクエストの詳細画面を開くと、「アンケート回答」セクションが表示されます。
            こちらからも各メンバーの回答確認が可能です。
          </p>
        </div>
      </section>

      {/* ═══════════════ よくあるトラブル ═══════════════ */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <HelpCircle className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">よくあるトラブルと対応</h3>
        </div>

        <TroubleRow
          q="アンケートタブに「アンケート回答・配役データがありません」と表示される"
          a="シナリオ編集でアンケートが有効になっていないか、質問が設定されていません。シナリオ編集 → アンケート設定でONにし、質問を追加してください。"
        />
        <TroubleRow
          q="お客様が「アンケートフォームが表示されない」と言っている"
          a="日程が確定済みかつ配役方法が選択済みであることを確認してください。主催者がチャットで配役方法を選んでいない場合、アンケートフォームは表示されません。"
        />
        <TroubleRow
          q="回答期限を過ぎた後でもお客様は回答できるか"
          a="はい。期限は目安として表示されるだけで、公演日までは回答・更新が可能です。"
        />
        <TroubleRow
          q="個別お知らせを送り間違えた"
          a="お知らせは削除できません。再度正しい内容でお知らせを送信してください。お客様のチャットには送信順に表示されます。"
        />
        <TroubleRow
          q="配役方法を変更したい（アンケート → 自分たちで、またはその逆）"
          a="主催者がチャット画面から「方法変更」をタップすると変更できます。ただし、既に送信されたアンケート回答はリセットされます。"
        />
        <TroubleRow
          q="事前読み込み通知がチャットに表示されない"
          a="シナリオマスターで「事前読み込みあり」が有効になっているか確認してください。また、日程確定時に自動投稿されるため、確定前は表示されません。"
        />
      </section>

    </div>
  )
}
