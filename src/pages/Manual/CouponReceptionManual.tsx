/**
 * クーポン受付対応マニュアル
 * スタッフ向け：お客さまがクーポンを使う際の受付手順
 */
import { CheckCircle, AlertTriangle, Smartphone, Scissors, Clock, HelpCircle, Ticket } from 'lucide-react'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import type { HardcodedPageContent } from '@/types/hardcodedContent'

export const COUPON_RECEPTION_DEFAULT: HardcodedPageContent = {
  description: "クーポンはお客さまがご自身のスマホで操作します。\nスタッフは声がけ・案内・確認をするだけでOKです。",
  sections: [
    {
      heading: "受付の手順",
      items: [
        { title: "クーポンを持っていることを確認する", body: "お客さまに「クーポンはお持ちですか？」と確認します。", scene: "声がけ例: 「本日クーポンはご利用になりますか？」" },
        { title: "マイページ →「クーポン」タブを開いてもらう", body: "お客さまのスマホで予約サイトのマイページを開いてもらいます。", scene: "声がけ例: 「マイページの『クーポン』タブを開いていただけますか？」" },
        { title: "クーポンカードをタップしてもらう", body: "「利用可能なクーポン」に以下のようなカードが表示されます。\n右上の「タップして使う」ラベルが目印です。カード全体をタップしてもらいます。", scene: "声がけ例: 「カードをタップしてください」" },
        { title: "公演を選んで「もぎる」を押してもらう", body: "タップすると下のようなダイアログが開きます。\n本日参加する公演が表示されるので選択して、「もぎる」ボタンを押してもらいます。", scene: "声がけ例: 「参加される公演を選んで『もぎる』を押してください」" },
        { title: "「使用済み」になったことを確認する", body: "「もぎる」後、クーポンカードが以下のようなグレーの「使用済み」表示に変わります。\nこれを目視で確認したら受付完了です。" },
      ]
    },
    {
      heading: "よくあるトラブルと対応",
      items: [
        { title: "「現在進行中の予約がありません」と表示される", body: "公演開始の3時間前〜公演終了の1時間後の間だけ使用できます。時間外の場合は公演当日の時間帯に再度案内してください。予約がない・確定していない可能性もあります。" },
        { title: "クーポンが表示されない（クーポン欄が空）", body: "クーポンが付与されていないか、すでに使用済みの可能性があります。クーポン管理ページでお客さまのクーポン状況を確認してください。" },
        { title: "「もぎる」ボタンが押せない（グレーのまま）", body: "公演が選択されていません。ダイアログ内の公演カードをタップして選択してから再度お試しください。" },
        { title: "「このタイトルには既にクーポンをご利用済みです」と表示される", body: "同じシナリオに対してはクーポンを2回以上使用できません。別のシナリオの公演であれば使用可能です。" },
        { title: "貸切グループに参加し忘れた状態で来店された（貸切参加のお客さま）", body: "公演終了の1時間後までにグループへの参加手続きを完了すれば使用可能です。MMQ未登録の場合はまず登録が必要です。①MMQに登録 → ②グループの招待リンクからグループに参加（「参加する」を押す）→ ③マイページのクーポンで使用、の順で案内してください。公演終了から1時間以内であれば動作しますが、それ以降はシステム上の判定ができなくなるため、なるべく公演開始前か休憩時間内に案内してください。" },
        { title: "ログインできていない", body: "予約サイトにログインしていないとマイページが開けません。登録済みのメールアドレスとパスワードでログインしてもらってください。" },
      ]
    }
  ]
}

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
        <div className="mt-2 text-sm text-gray-700 leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  )
}

function ScriptBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 bg-blue-50 border-l-4 border-blue-400 px-4 py-3 rounded-r-md text-sm text-blue-900">
      <span className="font-bold text-xs text-blue-600 block mb-1">声がけ例</span>
      {children}
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

/** 実際のクーポンカードUIを再現したモックアップ */
function CouponCardMock({ label = '¥500 OFF', name = '新規登録クーポン' }: { label?: string; name?: string }) {
  return (
    <div
      className="bg-white border border-gray-200 overflow-hidden w-full max-w-xs"
      style={{ borderRadius: 0 }}
    >
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ backgroundColor: THEME.primaryLight }}
      >
        <div className="flex items-center gap-2">
          <Ticket className="w-5 h-5" style={{ color: THEME.primary }} />
          <span className="text-base font-bold" style={{ color: THEME.primary }}>{label}</span>
        </div>
        <span className="text-xs px-2 py-1 bg-orange-100 text-orange-700 font-bold flex items-center gap-1">
          <Scissors className="w-3 h-3" />
          タップして使う
        </span>
      </div>
      <div className="px-4 py-3">
        <p className="font-medium text-gray-900 text-sm">{name}</p>
        <p className="text-xs text-gray-400 mt-1">2026/12/31まで</p>
      </div>
    </div>
  )
}

/** もぎるダイアログのモックアップ */
function MogiruDialogMock() {
  return (
    <div className="bg-white rounded-lg shadow-xl w-full max-w-xs overflow-hidden border border-gray-200">
      {/* ヘッダー */}
      <div
        className="px-5 py-4 text-center"
        style={{ backgroundColor: THEME.primaryLight }}
      >
        <Scissors className="w-8 h-8 mx-auto mb-1" style={{ color: THEME.primary }} />
        <h3 className="font-bold text-sm" style={{ color: THEME.primary }}>
          クーポンを使用しますか？
        </h3>
      </div>
      {/* 割引情報 */}
      <div className="px-5 pt-4 pb-2">
        <div className="bg-gray-50 rounded-lg p-3 mb-3 text-center">
          <p className="text-xl font-bold" style={{ color: THEME.primary }}>¥500 OFF</p>
          <p className="text-xs text-gray-500 mt-0.5">新規登録クーポン</p>
        </div>
        {/* 公演選択 */}
        <p className="text-xs font-bold text-gray-600 mb-2">紐付ける公演</p>
        <div className="border-2 border-green-500 bg-green-50 rounded-lg p-2.5 mb-3 flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-3 h-3 text-white" />
          </div>
          <div className="text-xs">
            <p className="font-bold text-gray-900">或ル胡蝶ノ夢</p>
            <p className="text-gray-500">高田馬場 ｜ 14:00〜</p>
          </div>
        </div>
        <p className="text-xs text-gray-400 text-center mb-3">使用後は元に戻せません</p>
      </div>
      {/* ボタン */}
      <div className="flex gap-2 px-5 pb-4">
        <div className="flex-1 border border-gray-200 rounded text-center py-2 text-sm text-gray-500">
          キャンセル
        </div>
        <div
          className="flex-1 rounded text-center py-2 text-sm text-white font-bold"
          style={{ backgroundColor: THEME.primary }}
        >
          もぎる
        </div>
      </div>
    </div>
  )
}

/** 使用済みカードのモックアップ */
function UsedCardMock() {
  return (
    <div
      className="bg-white border border-gray-200 p-3 opacity-60 w-full max-w-xs"
      style={{ borderRadius: 0 }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ticket className="w-4 h-4 text-gray-400" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-500">¥500 OFF</span>
              <span className="text-xs text-gray-400">- 新規登録クーポン</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">4/5 14:12 使用</p>
          </div>
        </div>
        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 flex items-center gap-1 ml-2">
          <CheckCircle className="w-3 h-3" />
          使用済み
        </span>
      </div>
    </div>
  )
}

export function CouponReceptionManual({ content }: { content?: HardcodedPageContent }) {
  const c = content ?? COUPON_RECEPTION_DEFAULT

  const stepSection = c.sections[0]
  const troubleSection = c.sections[1]

  const steps = stepSection?.items ?? []
  const troubles = troubleSection?.items ?? []

  // Extract script from scene field (format: "声がけ例: ...")
  const getScript = (scene?: string) => {
    if (!scene) return null
    const match = scene.match(/^声がけ例: (.+)$/)
    return match ? match[1] : scene
  }

  return (
    <div className="space-y-10 max-w-3xl mx-auto pb-12">

      {/* タイトル */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">クーポン受付対応</h2>
        <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
          {c.description}
        </p>
      </div>

      {/* 対象のお客さま */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 flex gap-3">
        <Ticket className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-blue-800">MMQで予約したお客様のみ対応可能</p>
          <p className="text-sm text-blue-700">
            クーポンは<strong>MMQ経由で予約されたお客様のみ</strong>ご利用いただけます。
            電話予約や他サイト経由のお客様はクーポン対象外となりますのでご注意ください。
          </p>
        </div>
      </div>

      {/* 重要ポイント */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 flex gap-3">
        <Clock className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-amber-800">使用できる時間に注意</p>
          <p className="text-sm text-amber-700">
            クーポンは<strong>公演開始の3時間前〜公演終了の1時間後</strong>の間しか使用できません。
            早すぎても遅すぎても「現在進行中の予約がありません」と表示されます。
          </p>
        </div>
      </div>

      {/* 受付ステップ */}
      <section className="space-y-2">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Smartphone className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">{stepSection?.heading ?? ''}</h3>
        </div>

        <Step num={1} color="#4f86c6" title={steps[0]?.title ?? ''}>
          <p>{steps[0]?.body?.split('\n')[0] ?? ''}</p>
          {getScript(steps[0]?.scene) && (
            <ScriptBox>{getScript(steps[0]?.scene)}</ScriptBox>
          )}
        </Step>

        <Step num={2} color="#4f86c6" title={steps[1]?.title ?? ''}>
          <p>{steps[1]?.body}</p>
          {getScript(steps[1]?.scene) && (
            <ScriptBox>{getScript(steps[1]?.scene)}</ScriptBox>
          )}
          <div className="mt-3 bg-gray-50 border border-gray-200 rounded-md p-3 text-xs text-gray-600 space-y-1">
            <p className="font-medium">お客さまの操作：</p>
            <p>① サイトにログイン → ② メニューから「マイページ」→ ③「クーポン」タブをタップ</p>
          </div>
        </Step>

        <Step num={3} color="#4f86c6" title={steps[2]?.title ?? ''}>
          <p className="whitespace-pre-line">
            {steps[2]?.body}
          </p>
          <div className="mt-4 mb-2">
            <CouponCardMock />
          </div>
          {getScript(steps[2]?.scene) && (
            <ScriptBox>{getScript(steps[2]?.scene)}</ScriptBox>
          )}
        </Step>

        <Step num={4} color="#4f86c6" title={steps[3]?.title ?? ''}>
          <p className="whitespace-pre-line">
            {steps[3]?.body}
          </p>
          <div className="mt-4 mb-2">
            <MogiruDialogMock />
          </div>
          <div className="mt-3 bg-gray-50 border border-gray-200 rounded-md p-3 text-xs text-gray-600 space-y-1">
            <p>・公演が表示されない → 下のトラブル対応を参照</p>
            <p>・「もぎる」がグレーのまま → 公演を選択するとボタンが有効になる</p>
          </div>
          {getScript(steps[3]?.scene) && (
            <ScriptBox>{getScript(steps[3]?.scene)}</ScriptBox>
          )}
        </Step>

        <Step num={5} color="#22a861" title={steps[4]?.title ?? ''} last>
          <p className="whitespace-pre-line">
            {steps[4]?.body}
          </p>
          <div className="mt-4 mb-2">
            <UsedCardMock />
          </div>
          <div className="mt-3 bg-green-50 border border-green-200 rounded-md p-3 flex gap-2">
            <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-800">
              「使用済み」と表示されていれば正常に完了しています。
            </p>
          </div>
        </Step>
      </section>

      {/* トラブル対応 */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <HelpCircle className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">{troubleSection?.heading ?? ''}</h3>
        </div>

        {troubles.map((item, i) => (
          <TroubleRow key={i} q={item.title} a={item.body ?? ''} />
        ))}
      </section>

    </div>
  )
}
