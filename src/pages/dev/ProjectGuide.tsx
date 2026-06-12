/**
 * プロジェクト理解ガイド（運営管理者専用・非公開ページ）
 *
 * URL: /dev/project-guide
 * 権限: checkIsLicenseAdmin（license_admin または QW組織のadmin）のみ。
 *       それ以外はトップへリダイレクト。
 *
 * このページは「プロジェクト全体を理解するための地図」。
 * コードと運用の構造、リファクタリングの歩み、教訓、残タスクをまとめる。
 * 内容を更新したら下の LAST_UPDATED も更新すること。
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization, checkIsLicenseAdmin } from '@/hooks/useOrganization'

const LAST_UPDATED = '2026-06-12'

const phases = [
  { name: 'Phase 0: 安全網の整備', status: 'done', detail: 'tsc/lint/buildのベースライン確認、knip（未使用コード検出）導入、削除前チェック手順の明文化' },
  { name: 'Phase 1: 死にコードの全面削除', status: 'done', detail: '約22,000行・80ファイル超を削除。シナリオ編集モーダルの旧3世代、無効化されたまま残っていた旧UI、未到達ページ（AuthorReport等）、重複APIバレルなど' },
  { name: 'Phase 2: 型と定数の整理', status: 'done', detail: 'types/index.ts（1,082行）を15のドメインファイルに分割（バレル方式で既存importは無傷）。ScheduleEvent の二重定義を発見・隔離' },
  { name: 'Phase 3: 状態管理の統一', status: 'done', detail: 'ストレージ系5フックの役割を文書化（docs/STATE_MANAGEMENT.md）。手書きスクロール復元の残骸を標準Providerに統一' },
  { name: 'Phase 4: 巨大フックの分割', status: 'todo', detail: '★最重要・リスク高。useEventOperations(2,422行)を操作系統別に分割、純関数抽出＋ユニットテスト、ScheduleEvent二重定義の統合。スケジュール管理の中核なので動作確認を挟みながら' },
  { name: 'Phase 5: 巨大モーダルの解体', status: 'todo', detail: 'KitManagementDialog(3,124行)・ReservationList(2,219行)・PerformanceModal(1,930行)等をUI＋ロジックフックに分離' },
  { name: 'Phase 6: 巨大ページの解体', status: 'todo', detail: 'PrivateGroupInvite(3,468行・最大)・ScheduleManager(2,056行)・MyPage(1,749行)等の分割' },
  { name: 'Phase 7: ルーティング整理と仕上げ', status: 'todo', detail: 'AdminDashboard の手書きルート分岐(parsePath)を宣言的なルート定義へ。最終knip・計測' },
]

const lessons = [
  {
    title: 'マルチテナント事故（2026-06-11 発見・修正済み）',
    body: '貸切申込RPCのシナリオ検索が「マスタIDが複数組織にヒットすると不定の組織を採用」する実装で、予約が無関係な組織に紐づいていた（本番で3週間、5件が行方不明状態）。Discord通知のGM検索にも組織フィルタがなく他組織GMに通知が飛んでいた。教訓: scenario_master_id は組織間で共有される。マスタ起点の検索には必ず organization_id を併用すること。',
  },
  {
    title: '環境越えの罠（app_config）',
    body: 'staging の app_config（supabase_url 等）が本番→stagingミラーで本番値に上書きされ、stagingのDBトリガーが「本番の」Edge Functionを呼んでいた。stagingで何を直しても通知挙動が変わらない怪現象の正体。ミラースクリプトに退避・復元処理を追加済み。教訓: 設定がコードでなくデータにあると、データコピーが配線をすり替える。',
  },
  {
    title: '死にコードは事故の温床',
    body: '「どれが本番コードか分からない」が誤修正・誤解の根源だった。シナリオ編集は4世代併存、@/lib/api は死んだバレルを推奨するコメント付き、deprecated注記が現役コードに付き推奨先が死んでいた例も。教訓: 使われなくなったコードはフラグで眠らせず消す。消す前に grep + knip + tsc で参照ゼロを証明する。',
  },
  {
    title: '日付は jstDate に統一',
    body: 'TZ依存の toLocaleDateString は非JST環境で1日ズレる。顧客向けの公演日・候補日は「2026年7月1日(水)」形式（formatJstDateJa）に統一済み。ルールは src/utils/jstDate.ts のヘッダに記載。',
  },
  {
    title: 'フィードバックのないUIは「壊れた」と誤認される',
    body: '貸切承認は成功時に何も表示せず、確定されたか分からなかった（トースト追加済み）。スタッフ編集も成功時無言。操作の結果は必ず可視化する。',
  },
]

const remaining = [
  '本番の汚染5件（5/20〜22の Factor 貸切申込、グループ=QW/予約=そしき に分裂、pending のまま）→ 削除 or 付け替えの判断待ち',
  '既存 lint error 3件（PerformanceModal の直接delete違反 / StaffProfile の冗長Boolean×2）',
  'org_scope API化の残り（scenarioMaster×2 / scenario×1 / store×1）+ .eq(organization_id) CI grep ガード + RLS監査',
  'Supabase キーのローテーション（5/22にチャットへ貼った prod/staging sb_secret）+ 6/11 にチャットへ貼った Discord Bot トークン',
  'Phase 4〜7（左の進捗表を参照）',
]

export function ProjectGuide() {
  const { user, loading: authLoading } = useAuth()
  const { organizationId, isLoading: orgLoading } = useOrganization()
  const navigate = useNavigate()
  // 認証・組織情報のロード完了前に判定するとロード中=権限なしと誤判定して
  // リダイレクトしてしまうため、必ず両方の完了を待つ
  const ready = !authLoading && !orgLoading
  const allowed = ready && checkIsLicenseAdmin(user?.role, organizationId)

  useEffect(() => {
    if (ready && !allowed) navigate('/', { replace: true })
  }, [ready, allowed, navigate])

  if (!ready || !allowed) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">プロジェクト理解ガイド</h1>
            <Badge variant="outline">運営管理者専用</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            MMQ予約システムの全体像・リファクタリングの歩み・教訓・残タスク（最終更新: {LAST_UPDATED}）
          </p>
        </div>

        {/* ① システム全体図 */}
        <Card>
          <CardHeader><CardTitle>① システム全体図</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <pre className="bg-slate-900 text-slate-100 text-xs p-4 rounded overflow-x-auto leading-relaxed">{`ブラウザ (React SPA / Vite)
  │
  ├─ Vercel ──────────── フロント配信 + /api/* (サーバーレス関数: org境界をJWTで強制)
  │
  └─ Supabase ────────── PostgreSQL (RLSでマルチテナント分離)
       ├─ RPC (create_private_booking_request 等: 複雑な書き込みをアトミックに)
       ├─ DBトリガー ──→ net.http_post ──→ Edge Functions
       │                  ※宛先URLは app_config テーブル（環境越え注意！）
       └─ Edge Functions ──→ Discord (貸切Bot) / Resend (メール)

環境:
  本番     cznpcewciwywcqcxktba  ←─ main ブランチ (Vercel自動デプロイ)
  staging  lavutzztfqbdndjiwluc  ←─ staging ブランチ
  ローカル  npm run dev:vercel (localhost:5173)
           → フロントだけローカル。/api と DB は staging を共有
           ※「ローカルでテスト」= stagingデータを見ている。本番画面での操作は本番DBに入る`}</pre>
            <p className="text-sm text-gray-600">
              デプロイ順序の鉄則: <b>DB（マイグレーション）→ Edge Functions → フロント</b>。
              本番→stagingのデータミラー後は app_config の復元が必要（スクリプト対応済み）。
            </p>
          </CardContent>
        </Card>

        {/* ② コードの地図 */}
        <Card>
          <CardHeader><CardTitle>② コードの地図（データの流れ）</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <pre className="bg-slate-900 text-slate-100 text-xs p-4 rounded overflow-x-auto leading-relaxed">{`src/
  AppRoot.tsx            ルーティングの起点（認証・Provider・スクロール復元）
  pages/AdminDashboard   44ページへの手書きディスパッチ（Phase 7 で宣言化予定）
  pages/<機能>/           ページ本体 + components/ + hooks/（機能ごとに自己完結）
  components/ui          shadcn系の共通部品 / patterns: テーブル・モーダルの型
  hooks/                 横断フック（useScheduleData, useEventOperations ★Phase4対象）
  lib/api/               APIクライアント層（21モジュール）→ /api/* または supabase 直
  types/                 ドメイン別の型（index.ts はバレル。2026-06 分割済み）
  utils/jstDate.ts       日付表示はここに集約（TZ事故防止 + 表示ルール文書）

データの流れ（例: シナリオ一覧）:
  Component → React Query フック (pages/*/hooks) → lib/api/scenarioApi
    → /api/scenarios (org境界) or supabase.from() (RLS) → PostgreSQL

ドメイン語彙:
  scenario_masters（全組織共有の原本）⇔ organization_scenarios（組織ごとの採用・上書き）
  reservations.reservation_source='web_private' が貸切申込
  private_groups（貸切の主催グループ）→ reservations → schedule_events（確定公演）
  gm_availability_responses（GMの出欠回答: 未送信/未回答/回答済み）`}</pre>
            <p className="text-sm text-gray-600">
              詳細ドキュメント: <code>docs/REFACTORING_PLAN.md</code>（進捗台帳）/
              <code> docs/STATE_MANAGEMENT.md</code>（状態の保存先ガイド）/
              <code> CLAUDE.md</code>（開発ルール）
            </p>
          </CardContent>
        </Card>

        {/* ③ リファクタリングの歩み */}
        <Card>
          <CardHeader><CardTitle>③ リファクタリングの歩み（2026-06〜）</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {phases.map(p => (
                <div key={p.name} className="flex items-start gap-3 p-3 rounded border bg-white">
                  <Badge variant={p.status === 'done' ? 'default' : 'outline'} className="mt-0.5 shrink-0">
                    {p.status === 'done' ? '完了' : '未着手'}
                  </Badge>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{p.detail}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-3">
              成果指標: 死にコード約22,000行削除 / types 1,082行→15ファイル分割 /
              800行超ファイル約30本のうち分割は Phase 4〜6 で実施
            </p>
          </CardContent>
        </Card>

        {/* ④ 教訓集 */}
        <Card>
          <CardHeader><CardTitle>④ 直したバグと教訓</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {lessons.map(l => (
              <div key={l.title} className="p-3 rounded border bg-amber-50 border-amber-200">
                <p className="text-sm font-medium text-amber-900">{l.title}</p>
                <p className="text-xs text-amber-800 mt-1 leading-relaxed">{l.body}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ⑤ 残タスク */}
        <Card>
          <CardHeader><CardTitle>⑤ 残タスク</CardTitle></CardHeader>
          <CardContent>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-700">
              {remaining.map(r => <li key={r}>{r}</li>)}
            </ul>
          </CardContent>
        </Card>

        <p className="text-xs text-gray-400 text-center pb-8">
          このページはコードに埋め込まれた静的ガイドです。実装: src/pages/dev/ProjectGuide.tsx
        </p>
      </div>
    </div>
  )
}
