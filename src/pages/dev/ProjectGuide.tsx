/**
 * プロジェクト理解ガイド（運営管理者専用・非公開ページ）
 *
 * URL: /dev/project-guide
 * 権限: checkIsLicenseAdmin（license_admin または QW組織のadmin）のみ。
 *       それ以外はトップへリダイレクト。
 *
 * このページは「プロジェクト全体を理解するための地図」。
 * 技術者でなくても読み切れるよう、専門用語には日本語の説明を併記する。
 * 内容を更新したら下の LAST_UPDATED も更新すること。
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization, checkIsLicenseAdmin } from '@/hooks/useOrganization'

const LAST_UPDATED = '2026-06-12'

// ──────────────────────────────────────────────
// 用語ミニ辞典
// ──────────────────────────────────────────────
const glossary = [
  { term: 'フロント / バックエンド', desc: 'フロント＝ブラウザで動く画面側。バックエンド＝データを守り処理するサーバー側。' },
  { term: 'Supabase', desc: 'このシステムの「金庫兼厨房」。予約・顧客・公演など全データが入るデータベースのクラウドサービス。' },
  { term: 'RLS', desc: '行レベルセキュリティ。データベース自身が「この行はクインズワルツの人にしか見せない」と門番をする仕組み。組織間でデータが混ざらない最後の砦。' },
  { term: 'RPC', desc: 'データベースの中に置いた「定型処理のボタン」。例：貸切申込RPCは予約作成・グループ更新・GM行作成を一括で安全に行う。' },
  { term: 'Edge Function', desc: 'Supabase上で動く小さなプログラム。Discord通知やメール送信など「外部と話す仕事」を担当。' },
  { term: 'マイグレーション', desc: 'データベースの構造変更の履歴ファイル。「テーブルに列を足す」等を番号付きで記録し、本番にも同じ順で適用する。' },
  { term: 'staging（ステージング）', desc: '本番のリハーサル環境。ローカル開発（localhost）もstagingのデータを見ている。' },
  { term: 'ミラー', desc: '本番のデータをstagingへ丸ごとコピーすること。実データでテストできるが「設定値まで本番のものになる」罠がある（→教訓②）。' },
  { term: 'リファクタリング', desc: '見た目の動きを変えずに、コードの中身を整理整頓すること。事故りにくく・直しやすくするための工事。' },
  { term: '死にコード', desc: 'もう使われていないのに残っているコード。「どれが本物か」を分からなくさせる主犯（→教訓③）。' },
]

// ──────────────────────────────────────────────
// リファクタリングの段階
// ──────────────────────────────────────────────
const phases = [
  {
    name: 'Phase 0: 安全網の整備',
    status: 'done',
    plain: '工事の前に、壊したらすぐ気づける検査体制を作った',
    detail: '型チェック・ビルドが通る状態を確認し、「使われていないコードを自動で見つける道具（knip）」を導入。',
  },
  {
    name: 'Phase 1: 死にコードの全面削除',
    status: 'done',
    plain: '使われていないコード約22,000行・80ファイル超を安全に削除',
    detail: 'シナリオ編集画面の旧3世代、無効化スイッチで眠っていた旧UI、どこからも辿れないページ群など。1件ずつ「本当に未使用」を証明してから削除。',
  },
  {
    name: 'Phase 2: 型と定数の整理',
    status: 'done',
    plain: 'データの「設計図」を1つの巨大ファイルから分野別の15ファイルへ',
    detail: '既存コードを壊さない方式（バレル）で分割。同名で中身が違う型が2つ共存している問題（ScheduleEvent）も発見し、Phase 4 の宿題として記録。',
  },
  {
    name: 'Phase 3: 状態管理の統一',
    status: 'done',
    plain: '「画面の設定はどこに保存される？」に1ファイルで答えられるよう整理',
    detail: '保存系の道具5種の使い分けガイドを文書化（docs/STATE_MANAGEMENT.md）。二重に動いていたスクロール復元の残骸も撤去。',
  },
  {
    name: 'Phase 4: 巨大フックの分割',
    status: 'todo',
    plain: '【次・最重要】スケジュール管理の心臓部（2,400行の処理）を手術',
    detail: '公演の追加・編集・キャンセル等50以上の処理が1ファイルに同居。分割して個別にテスト可能にする。業務の中核なので1歩ごとに動作確認を挟む。',
  },
  {
    name: 'Phase 5: 巨大モーダルの解体',
    status: 'todo',
    plain: '2,000〜3,000行の巨大ポップアップ画面たちを分解',
    detail: 'キット管理(3,124行)・予約一覧(2,219行)・公演編集(1,930行)など。見た目とロジックを分離して変更しやすくする。',
  },
  {
    name: 'Phase 6: 巨大ページの解体',
    status: 'todo',
    plain: '最大3,400行のページを部品に分割',
    detail: '貸切招待ページ(3,468行・最大)・スケジュール管理(2,056行)・マイページ(1,749行)など。',
  },
  {
    name: 'Phase 7: ルーティング整理と仕上げ',
    status: 'todo',
    plain: '「どのURLがどの画面か」の一覧表を整備して総仕上げ',
    detail: '現在は手書きの分岐が約1,000行。宣言的な一覧に置き換え、最終計測で成果を確認。',
  },
]

// ──────────────────────────────────────────────
// 教訓集
// ──────────────────────────────────────────────
const lessons = [
  {
    no: '①',
    title: '貸切申込が他組織に化けていた（本番で3週間）',
    summary: 'マスタシナリオは組織間で共有される。検索には必ず組織IDを付ける。',
    body: '「Factor」のように複数組織が同じマスタシナリオを採用していると、貸切申込の組織決定がランダムになり、申込が無関係な組織に紐づいていた。Discord通知も他組織のGMに飛んでいた。RPCと通知処理の両方を修正済み。',
  },
  {
    no: '②',
    title: 'stagingの設定に本番のURLが紛れ込んでいた',
    summary: 'データをコピーすると「設定」もコピーされ、配線がすり替わる。',
    body: '本番→stagingのデータミラーで、通知の宛先設定（app_config）まで本番値になり、stagingのテストが本番の通知システムを動かしていた。「stagingで直したのに挙動が変わらない」怪現象の正体。ミラー処理に設定の退避・復元を追加済み。',
  },
  {
    no: '③',
    title: '死にコードが誤解と誤修正を生んでいた',
    summary: '使わなくなったコードは眠らせず消す。消す前に未使用を証明する。',
    body: 'シナリオ編集画面が4世代併存し、案内コメントが「死んでいる方」を推奨している箇所まであった。どれが本物か分からない状態は、それ自体がバグの温床。',
  },
  {
    no: '④',
    title: '日付が環境によって1日ズレる・表記がバラバラ',
    summary: '日付は専用の道具（jstDate）経由で表示。形式は「2026年7月1日(水)」に統一。',
    body: 'ブラウザの設定次第で日付が1日ズレる書き方が混ざっていた。また同じ貸切タブ内で「7/1」「2026年7月1日」「8/1(土)」と3形式が混在していたため、年月日形式に統一した。',
  },
  {
    no: '⑤',
    title: '「成功したのに何も言わない」画面は壊れたと誤認される',
    summary: '操作の結果は必ずトースト等で可視化する。',
    body: '貸切承認が成功時に無反応で「確定できたか分からない」事態に。スタッフ編集の保存も無言だった。結果が見えないことは、それ自体が不具合。',
  },
  {
    no: '⑥',
    title: '読み込み中を「権限なし」と誤判定（このページ自身のバグ）',
    summary: '非同期処理の「まだ分からない」と「ダメだった」を区別する。',
    body: 'このガイドページも初版では、ログイン情報の読み込みが終わる前に権限チェックをしてしまい、正規の管理者まで弾いていた。途中状態で結論を出さないこと。',
  },
]

const remaining = [
  { task: '本番の迷子データ5件の後始末', desc: '5/20〜22の貸切申込（教訓①の被害）。削除するか正しい組織へ付け替えるか、判断待ち。' },
  { task: 'Phase 4〜7 のリファクタリング', desc: '上の進捗表のとおり。次はスケジュール管理の心臓部。' },
  { task: 'セキュリティの宿題', desc: 'チャットに貼った各種キーのローテーション、組織境界チェックの自動化（CI）、RLS総点検。' },
  { task: '既知の軽微な警告3件', desc: '昔からあるコード品質警告（予約の直接削除・冗長な記述）。動作には影響なし。' },
]

export function ProjectGuide() {
  const { user, loading: authLoading } = useAuth()
  const { organizationId, isLoading: orgLoading } = useOrganization()
  const navigate = useNavigate()
  // 認証・組織情報のロード完了前に判定するとロード中=権限なしと誤判定して
  // リダイレクトしてしまうため、必ず両方の完了を待つ（→教訓⑥）
  const ready = !authLoading && !orgLoading
  const allowed = ready && checkIsLicenseAdmin(user?.role, organizationId)

  useEffect(() => {
    if (ready && !allowed) navigate('/', { replace: true })
  }, [ready, allowed, navigate])

  if (!ready || !allowed) return null

  const doneCount = phases.filter(p => p.status === 'done').length

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">プロジェクト理解ガイド</h1>
            <Badge variant="outline">運営管理者専用</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            MMQ予約システムの全体像・改修の歩み・教訓・残タスク（最終更新: {LAST_UPDATED}）
          </p>
        </div>

        {/* 3行でわかるこのプロジェクト */}
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-5 pb-5">
            <p className="text-sm font-semibold text-blue-900 mb-2">🗺️ 3行でわかるこのプロジェクト</p>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-blue-900">
              <li>マーダーミステリー店舗の<b>予約・公演・スタッフ管理</b>を、複数の組織（テナント）が同居する1つのシステムで提供している。</li>
              <li>画面は Vercel、データと通知は Supabase という2つのクラウドで動き、<b>本番と staging（リハーサル環境）</b>の2面構成。</li>
              <li>2026年6月から<b>大規模な整理整頓（リファクタリング）を8段階で実施中</b>。現在 {doneCount}/8 段階が完了し、その過程で本番の重大バグ（貸切申込の組織間違い）も発見・修正した。</li>
            </ol>
          </CardContent>
        </Card>

        {/* 学習ページへの導線 */}
        <a href="/dev/learn" className="block">
          <Card className="border-green-300 bg-green-50 hover:bg-green-100 transition-colors">
            <CardContent className="pt-4 pb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-green-900">📚 学習コース: このシステムで学ぶプログラミング＆システム設計</p>
                <p className="text-xs text-green-800 mt-0.5">全8章。すべて実在のコードと実際に起きたバグで学べます → /dev/learn</p>
              </div>
              <span className="text-green-700 text-lg">→</span>
            </CardContent>
          </Card>
        </a>

        {/* ① システム全体図 */}
        <Card>
          <CardHeader><CardTitle>① システムの全体図 — 何がどこで動いているか</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-700">
              レストランに例えると：<b>Vercel が店頭（お客様が見る画面）</b>、<b>Supabase が厨房と金庫（データと処理）</b>、
              Edge Function が<b>出前係（Discord・メールなど外への連絡）</b>です。
            </p>
            <pre className="bg-slate-900 text-slate-100 text-xs p-4 rounded overflow-x-auto leading-relaxed">{`お客様・スタッフのブラウザ（予約サイト / 管理画面）
  │
  ├─ Vercel ……… 店頭。画面の配信と、組織の壁を守る受付（/api）
  │
  └─ Supabase …… 厨房と金庫。全データ（予約・顧客・公演・スタッフ）
       ├─ RLS ……………… 門番。「他組織のデータは見せない」をDB自身が強制
       ├─ RPC ……………… 定型処理のボタン（例: 貸切申込を一括で安全に作成）
       ├─ DBトリガー …… 「予約が入ったら通知係を呼ぶ」自動スイッチ
       │                   ※呼び先のURLは app_config という設定表にある（教訓②）
       └─ Edge Functions … 出前係。Discord（貸切Bot）・メール（Resend）へ連絡

環境は2面 + ローカル:
  本番      …… お客様が使う本物。main ブランチを反映
  staging   …… リハーサル環境。staging ブランチを反映
  ローカル   …… 開発者のPC（localhost:5173）。ただし画面だけローカルで、
               データは staging を共有 ←「ローカルでテスト」の正体
  ⚠️ 本番サイトの管理画面で操作すると本番データが変わる（環境の取り違え注意）`}</pre>
            <p className="text-sm text-gray-600">
              反映の鉄則：<b>データベースの変更 → 通知係（Edge Functions）→ 画面</b> の順。逆にすると新画面が古いDBを叩いて事故になる。
            </p>
          </CardContent>
        </Card>

        {/* ② コードの地図 */}
        <Card>
          <CardHeader><CardTitle>② コードの地図 — 1つの操作がどう流れるか</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-700">
              例：シナリオ一覧を開くと、注文がこう流れます——
              <b>画面（注文）→ データ取得係（ウェイター）→ API層（伝票）→ データベース（厨房）</b>。
              どの階層も役割が決まっていて、飛び越えないのがルールです。
            </p>
            <pre className="bg-slate-900 text-slate-100 text-xs p-4 rounded overflow-x-auto leading-relaxed">{`src/ （コードの本棚）
  pages/<機能名>/   画面そのもの。機能ごとに「画面+部品+データ取得係」で自己完結
  components/      使い回す部品（ボタン・表・モーダルの型）
  hooks/           画面をまたぐ共通ロジック（★Phase 4 の手術対象もここ）
  lib/api/         API層。データベースへの「伝票の書き方」を21分野に整理
  types/           データの設計図（予約とは何か、シナリオとは何か）※分野別に分割済み
  utils/jstDate.ts 日付表示の専用道具（ここを通せば日付事故が起きない）

覚えておきたいデータの関係（貸切まわり）:
  scenario_masters …………… シナリオの原本（全組織で共有）
    └ organization_scenarios … 各組織が採用したシナリオ（料金など組織ごとの上書き）
  private_groups ……………… 貸切の主催グループ（メンバー集め・日程調整）
    └ reservations …………… 申込（reservation_source='web_private' が貸切）
        └ schedule_events … 承認されて確定した公演（カレンダーに載る）
  gm_availability_responses … GMの出欠回答（未送信/未回答/回答済み）`}</pre>
            <p className="text-sm text-gray-600">
              さらに詳しく：<code>docs/REFACTORING_PLAN.md</code>（改修の台帳）/
              <code> docs/STATE_MANAGEMENT.md</code>（設定の保存先ガイド）/
              <code> CLAUDE.md</code>（開発ルール）
            </p>
          </CardContent>
        </Card>

        {/* ③ リファクタリングの歩み */}
        <Card>
          <CardHeader>
            <CardTitle>③ 整理整頓（リファクタリング）の歩み</CardTitle>
          </CardHeader>
          <CardContent>
            {/* 進捗バー */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>進捗 {doneCount} / {phases.length} 段階</span>
                <span>{Math.round((doneCount / phases.length) * 100)}%</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: `${(doneCount / phases.length) * 100}%` }} />
              </div>
            </div>
            <div className="space-y-2">
              {phases.map(p => (
                <div key={p.name} className={`p-3 rounded border ${p.status === 'done' ? 'bg-white' : 'bg-gray-50 border-dashed'}`}>
                  <div className="flex items-start gap-3">
                    <Badge variant={p.status === 'done' ? 'default' : 'outline'} className="mt-0.5 shrink-0">
                      {p.status === 'done' ? '✓ 完了' : '未着手'}
                    </Badge>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-sm text-gray-800 mt-0.5">{p.plain}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{p.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ④ 教訓集 */}
        <Card>
          <CardHeader><CardTitle>④ 直したバグと教訓 — 同じ穴に落ちないために</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {lessons.map(l => (
              <div key={l.no} className="p-3 rounded border bg-amber-50 border-amber-200">
                <p className="text-sm font-medium text-amber-900">{l.no} {l.title}</p>
                <p className="text-sm font-semibold text-amber-800 mt-1">→ {l.summary}</p>
                <p className="text-xs text-amber-700 mt-1 leading-relaxed">{l.body}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ⑤ 残タスク */}
        <Card>
          <CardHeader><CardTitle>⑤ これからやること</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {remaining.map(r => (
                <div key={r.task} className="p-3 rounded border bg-white">
                  <p className="text-sm font-medium">{r.task}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{r.desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ⑥ 用語ミニ辞典 */}
        <Card>
          <CardHeader><CardTitle>⑥ 用語ミニ辞典</CardTitle></CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-2">
              {glossary.map(g => (
                <div key={g.term} className="p-3 rounded border bg-white">
                  <p className="text-sm font-semibold">{g.term}</p>
                  <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{g.desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-gray-400 text-center pb-8">
          このページはコードに埋め込まれた静的ガイドです。実装: src/pages/dev/ProjectGuide.tsx
        </p>
      </div>
    </div>
  )
}
