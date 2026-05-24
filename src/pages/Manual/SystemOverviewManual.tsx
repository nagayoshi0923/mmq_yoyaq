import { LayoutDashboard, CalendarDays, ClipboardCheck, Users, BookOpen, TrendingUp, Settings, Shield, UserCheck, Globe } from 'lucide-react'

const FEATURES = [
  {
    icon: LayoutDashboard,
    title: 'ダッシュボード',
    description: '本日の公演・来店状況をリアルタイムで確認。チェックインもここから行えます。',
  },
  {
    icon: CalendarDays,
    title: 'スケジュール管理',
    description: '公演日程の登録・GM（ゲームマスター）の割り当て・シフト管理を一括で行います。',
  },
  {
    icon: ClipboardCheck,
    title: '貸切・予約管理',
    description: '貸切リクエストの承認・却下から、通常予約のステータス管理まで対応します。',
  },
  {
    icon: Users,
    title: 'スタッフ管理',
    description: 'スタッフの招待・権限設定・退職処理を行います。招待メールを送るだけで完了です。',
  },
  {
    icon: BookOpen,
    title: 'シナリオ管理',
    description: '上演するシナリオを登録し、店舗・公演と紐付けます。MMQ申請も管理画面から行います。',
  },
  {
    icon: TrendingUp,
    title: '売上・レポート',
    description: '公演別・月別・スタッフ別の売上を分析。公演報告書の送付もここから行います。',
  },
  {
    icon: Settings,
    title: '設定',
    description: '組織情報・店舗設定・予約設定・メール通知など、運営に必要な全設定を管理します。',
  },
]

const ROLES = [
  {
    name: '管理者（admin）',
    color: 'bg-blue-50 border-blue-200',
    labelColor: 'text-blue-700 bg-blue-100',
    desc: '全機能にアクセスできます。組織の運営責任者が持つ権限です。',
    items: ['全ページの閲覧・編集', 'スタッフ招待・削除', '設定の変更', '売上レポートの閲覧'],
  },
  {
    name: 'スタッフ（staff）',
    color: 'bg-green-50 border-green-200',
    labelColor: 'text-green-700 bg-green-100',
    desc: '日常業務に必要な機能に絞ってアクセスできます。',
    items: ['スケジュール確認・GM登録', 'シフト提出', 'マニュアル閲覧', 'チェックイン操作'],
  },
  {
    name: '顧客（customer）',
    color: 'bg-slate-50 border-slate-200',
    labelColor: 'text-slate-700 bg-slate-100',
    desc: '予約サイトのみ利用できます。管理画面には入れません。',
    items: ['予約の申し込み', 'マイページの閲覧', '貸切リクエストの送信'],
  },
]

export function SystemOverviewManual() {
  return (
    <div className="space-y-10 max-w-4xl mx-auto pb-12">
      <div className="space-y-3">
        <h2 className="text-2xl font-bold tracking-tight">システム概要</h2>
        <p className="text-muted-foreground leading-relaxed">
          このシステムは、マーダーミステリー公演を主催する団体向けの<strong>予約・運営管理プラットフォーム</strong>です。
          予約受付から当日の受付業務、スタッフ管理、売上分析まで、公演運営に必要な機能をひとつの画面で管理できます。
        </p>
      </div>

      {/* 主な機能 */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Globe className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">主な機能</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FEATURES.map(f => (
            <div key={f.title} className="flex gap-3 p-4 rounded-lg border border-border bg-slate-50/50">
              <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <f.icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">{f.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{f.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 権限と役割 */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">権限と役割</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          ユーザーには以下の権限が設定されます。スタッフには必要な権限のみを付与することで、誤操作を防止できます。
        </p>
        <div className="space-y-3">
          {ROLES.map(role => (
            <div key={role.name} className={`rounded-lg border p-4 ${role.color}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${role.labelColor}`}>{role.name}</span>
                <span className="text-sm text-slate-600">{role.desc}</span>
              </div>
              <ul className="flex flex-wrap gap-2">
                {role.items.map(item => (
                  <li key={item} className="text-xs bg-white/70 border border-slate-200 rounded px-2 py-1 text-slate-600">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* 管理画面と予約サイト */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <UserCheck className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">管理画面と予約サイト</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-4 rounded-lg border border-blue-200 bg-blue-50">
            <p className="text-sm font-semibold text-blue-800 mb-1">管理画面（このページ）</p>
            <p className="text-xs text-blue-700 leading-relaxed">
              管理者・スタッフが使用する運営用ツールです。
              左サイドバーで各機能にアクセスできます。
            </p>
          </div>
          <div className="p-4 rounded-lg border border-green-200 bg-green-50">
            <p className="text-sm font-semibold text-green-800 mb-1">予約サイト（お客様向け）</p>
            <p className="text-xs text-green-700 leading-relaxed">
              お客様が予約申し込みを行うサイトです。
              左サイドバー上部の「予約サイト」から確認できます。
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
