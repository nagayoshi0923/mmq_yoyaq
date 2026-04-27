/**
 * クーポン・チケット種類と使用方法マニュアル
 * スタッフ向け：各クーポン・チケットの使用範囲と受付手順
 */
import { Ticket, AlertTriangle, CheckCircle, Info, AlertCircle } from 'lucide-react'
import type { CouponTypePageContent } from '@/types/hardcodedContent'

export const COUPON_TYPES_DEFAULT: CouponTypePageContent = {
  description: "各クーポン・チケットの使用範囲と受付手順をまとめています。\n種類によって対応方法が異なるため、確認してから対応してください。",
  coupons: [
    {
      title: "ポイントカード割引券",
      scopes: [{ label: "全ての公演に使用可能" }],
      steps: ["10ポイント貯まったら回収して使用", "記念に持ち帰りたい場合は使用済みがわかるような印をつける"],
      notes: [
        { type: "info", text: "チケット・クーポンとの併用可" },
      ]
    },
    {
      title: "MMQクーポン",
      scopes: [
        { label: "MMQで予約した公演にご利用いただけます" },
        { label: "1回のご予約につき1枚使用可能" },
      ],
      steps: ["チケットもぎりをして使用確認する", "貸切参加でのご利用は貸切リクエストグループに入室する必要があります"],
      notes: [
        { type: "warning", text: "同カテゴリ（クーポン）との併用不可 — 雑誌クーポンとの重複利用は不可" },
        { type: "info", text: "チケット・割引券との併用可" },
      ]
    },
    {
      title: "雑誌クーポン",
      scopes: [{ label: "全ての公演に使用可能（詳細範囲は未確認）" }],
      steps: ["チェックをつけて使用"],
      notes: [
        { type: "warning", text: "同カテゴリ（クーポン）との併用不可 — MMQクーポンとの重複利用は不可" },
        { type: "info", text: "チケット・割引券との併用可" },
      ]
    },
    {
      title: "クラファン共通券チケット",
      scopes: [
        { label: "店舗開催の通常マーダーミステリー公演" },
        { label: "クインズワルツ運営による特別出張公演" },
        { label: "GMテスト", disabled: true },
        { label: "ボードゲーム会", disabled: true },
        { label: "外部主催公演", disabled: true },
      ],
      steps: ["チケットをもぎる", "使用済みにチェック（必須）", "料金差分は割引券としてチェックをつけて返却"],
      notes: [
        { type: "caution", text: "チェックは必ず行うこと。チケットは記念に持ち帰りたいお客さまもいるため、もぎるだけでなく使用済みのチェックを忘れずに行ってください。" },
        { type: "info", text: "割引券について：料金差分で返却する割引券は、元のチケット（共通券）と同じ条件で利用可能です。" },
        { type: "warning", text: "同カテゴリ（チケット）との併用不可 — 貸切幹事チケットとの重複利用は不可" },
        { type: "info", text: "クーポン・割引券との併用可" },
      ]
    },
    {
      title: "クラファン貸切幹事チケット",
      scopes: [
        { label: "貸切公演の幹事のみ使用可" },
        { label: "店舗開催の通常マーダーミステリー公演（貸切）" },
        { label: "クインズワルツ運営による特別出張公演（貸切）" },
        { label: "GMテスト", disabled: true },
        { label: "ボードゲーム会", disabled: true },
        { label: "外部主催公演", disabled: true },
      ],
      steps: ["チケットをもぎる", "使用済みにチェック（必須）", "料金差分は割引券としてチェックをつけて返却"],
      notes: [
        { type: "caution", text: "チェックは必ず行うこと。チケットは記念に持ち帰りたいお客さまもいるため、もぎるだけでなく使用済みのチェックを忘れずに行ってください。" },
        { type: "info", text: "割引券について：料金差分で返却する割引券は、元のチケット（貸切幹事チケット）と同じ条件で利用可能です。" },
        { type: "warning", text: "同カテゴリ（チケット）との併用不可 — 共通券チケットとの重複利用は不可" },
        { type: "info", text: "クーポン・割引券との併用可" },
      ]
    },
  ]
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Ticket className="h-4 w-4 text-primary" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
    </div>
  )
}

function ScopeTag({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'warning' | 'disabled' }) {
  const styles = {
    default: 'bg-blue-100 text-blue-800',
    warning: 'bg-yellow-100 text-yellow-800',
    disabled: 'bg-gray-100 text-gray-500 line-through',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${styles[variant]}`}>
      {children}
    </span>
  )
}

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-2 mt-3">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3 items-start">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center mt-0.5">
            {i + 1}
          </span>
          <span className="text-sm text-gray-700 leading-relaxed">{step}</span>
        </li>
      ))}
    </ol>
  )
}

function InfoNote({ type = 'info', children }: { type?: 'info' | 'warning' | 'caution'; children: React.ReactNode }) {
  const styles = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    caution: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  }
  const icons = {
    info: <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />,
    warning: <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />,
    caution: <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />,
  }
  return (
    <div className={`mt-3 border rounded-md p-3 flex gap-2 text-sm ${styles[type]}`}>
      {icons[type]}
      <div className="leading-relaxed">{children}</div>
    </div>
  )
}

function CouponCard({
  number,
  title,
  scopeItems,
  steps,
  notes,
}: {
  number: number
  title: string
  scopeItems: { label: string; disabled?: boolean }[]
  steps: string[]
  notes?: { type: 'info' | 'warning' | 'caution'; text: React.ReactNode }[]
}) {
  return (
    <section className="border rounded-xl overflow-hidden">
      {/* ヘッダー */}
      <div className="bg-slate-50 border-b px-5 py-4 flex items-center gap-3">
        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">
          {number}
        </span>
        <h3 className="font-bold text-base text-gray-900">{title}</h3>
      </div>

      <div className="px-5 py-5 space-y-5">
        {/* 使用可能範囲 */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">使用可能範囲</p>
          <ul className="space-y-1">
            {scopeItems.map((item, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                {item.disabled ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-gray-300 flex items-center justify-center flex-shrink-0">
                      <span className="text-gray-400 text-[10px]">×</span>
                    </span>
                    <span className="text-gray-400 line-through">{item.label}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span className="text-gray-700">{item.label}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* 使用方法 */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">使用方法</p>
          <StepList steps={steps} />
        </div>

        {/* 備考 */}
        {notes && notes.length > 0 && (
          <div className="space-y-2">
            {notes.map((note, i) => (
              <InfoNote key={i} type={note.type}>{note.text}</InfoNote>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

export function CouponTypeManual({ content }: { content?: CouponTypePageContent }) {
  const c = content ?? COUPON_TYPES_DEFAULT

  return (
    <div className="space-y-10 max-w-3xl mx-auto pb-12">

      {/* タイトル */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">クーポン・チケットの種類と使用方法</h2>
        <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
          {c.description}
        </p>
      </div>

      {/* 一覧 */}
      <div className="space-y-6">
        {c.coupons.map((coupon, idx) => (
          <CouponCard
            key={idx}
            number={idx + 1}
            title={coupon.title}
            scopeItems={coupon.scopes}
            steps={coupon.steps}
            notes={coupon.notes.map(n => ({ type: n.type, text: n.text }))}
          />
        ))}
      </div>

      {/* まとめ表 */}
      <section className="space-y-3">
        <SectionHeader title="種類ごとの対応まとめ" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="border px-3 py-2 text-left font-semibold text-gray-700 w-44">種類</th>
                <th className="border px-3 py-2 text-left font-semibold text-gray-700">使用範囲</th>
                <th className="border px-3 py-2 text-left font-semibold text-gray-700 w-20">カテゴリ</th>
                <th className="border px-3 py-2 text-left font-semibold text-gray-700 w-40">他種との併用</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border px-3 py-2 font-medium">ポイントカード割引券</td>
                <td className="border px-3 py-2">全公演</td>
                <td className="border px-3 py-2 text-xs text-gray-500">割引券</td>
                <td className="border px-3 py-2 text-green-700 font-medium">可</td>
              </tr>
              <tr>
                <td className="border px-3 py-2 font-medium">MMQクーポン</td>
                <td className="border px-3 py-2">MMQ予約の全公演</td>
                <td className="border px-3 py-2 text-xs text-gray-500">クーポン</td>
                <td className="border px-3 py-2 text-sm">
                  <span className="text-red-600 font-medium">クーポン同士は不可</span>
                  <br /><span className="text-green-700 text-xs">チケット・割引券は可</span>
                </td>
              </tr>
              <tr>
                <td className="border px-3 py-2 font-medium">雑誌クーポン</td>
                <td className="border px-3 py-2 text-gray-500">全公演（詳細未確認）</td>
                <td className="border px-3 py-2 text-xs text-gray-500">クーポン</td>
                <td className="border px-3 py-2 text-sm">
                  <span className="text-red-600 font-medium">クーポン同士は不可</span>
                  <br /><span className="text-green-700 text-xs">チケット・割引券は可</span>
                </td>
              </tr>
              <tr>
                <td className="border px-3 py-2 font-medium">クラファン共通券</td>
                <td className="border px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    <ScopeTag>店舗通常公演</ScopeTag>
                    <ScopeTag>QW運営出張</ScopeTag>
                    <ScopeTag variant="disabled">GMテスト不可</ScopeTag>
                    <ScopeTag variant="disabled">BG会不可</ScopeTag>
                    <ScopeTag variant="disabled">外部主催不可</ScopeTag>
                  </div>
                </td>
                <td className="border px-3 py-2 text-xs text-gray-500">チケット</td>
                <td className="border px-3 py-2 text-sm">
                  <span className="text-red-600 font-medium">チケット同士は不可</span>
                  <br /><span className="text-green-700 text-xs">クーポン・割引券は可</span>
                </td>
              </tr>
              <tr>
                <td className="border px-3 py-2 font-medium">クラファン貸切幹事</td>
                <td className="border px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    <ScopeTag variant="warning">貸切幹事のみ</ScopeTag>
                    <ScopeTag variant="disabled">GMテスト不可</ScopeTag>
                    <ScopeTag variant="disabled">BG会不可</ScopeTag>
                    <ScopeTag variant="disabled">外部主催不可</ScopeTag>
                  </div>
                </td>
                <td className="border px-3 py-2 text-xs text-gray-500">チケット</td>
                <td className="border px-3 py-2 text-sm">
                  <span className="text-red-600 font-medium">チケット同士は不可</span>
                  <br /><span className="text-green-700 text-xs">クーポン・割引券は可</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

    </div>
  )
}
