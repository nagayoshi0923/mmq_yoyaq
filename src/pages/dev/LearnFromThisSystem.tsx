/**
 * このシステムで学ぶプログラミング＆システム設計（運営管理者専用・非公開）
 *
 * URL: /dev/learn
 * 権限: /dev/project-guide と同じ（checkIsLicenseAdmin）
 *
 * 非エンジニアのオーナーが「自分のシステムを教材に」プログラミングと
 * システム設計を学ぶためのページ。全ての概念を、このプロジェクトで
 * 実際に起きた例・実在するファイルで説明する。
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization, checkIsLicenseAdmin } from '@/hooks/useOrganization'

/* ──────────────────────────────────────────────
 * 教材データ
 * 各章: concept（考え方）/ code（実例コード）/ example（このシステムでの実話）/ try（やってみよう）
 * ────────────────────────────────────────────── */

interface Chapter {
  id: string
  no: number
  title: string
  subtitle: string
  sections: {
    heading: string
    text: string
    code?: { caption: string; body: string }
    story?: string
    tryIt?: string
  }[]
}

const chapters: Chapter[] = [
  {
    id: 'program',
    no: 1,
    title: 'プログラムの材料は5つだけ',
    subtitle: '値・変数・関数・条件分岐・繰り返し — 全システムはこの組み合わせ',
    sections: [
      {
        heading: 'プログラム＝コンピュータへの指示書',
        text: 'プログラムとは、コンピュータに渡す「上から順に実行される指示書」です。指示書はファイル（例: jstDate.ts）に書かれ、ファイルが約700個集まったものがこのシステムです。そして指示書に書ける材料は、基本的に5つしかありません：①値 ②変数 ③関数 ④条件分岐 ⑤繰り返し。この章でその5つを、全部このシステムの実物で見ていきます。',
      },
      {
        heading: '材料①② 値（データ）と変数（名前付きの入れ物）',
        text: '値（あたい / value）はデータそのもの。文字（\'えいきち\'）、数（7000）、はい/いいえ（true / false）などの種類があります。変数（へんすう / variable）は、値に名前を付けた入れ物です。名前を付けるのは、後の指示で「さっきのアレ」と呼べるようにするためです。',
        code: {
          caption: '値と変数の例（このシステムの予約データ風）',
          body: `const customerName = 'えいきち'   // 文字の値に customerName と名付ける
const participantCount = 7        // 数の値
const isConfirmed = false         // はい/いいえの値（真偽値）
const eventDate = '2026-07-01'    // 日付も実は「ただの文字」で届く ← 重要！

// 変数は後の指示で使い回せる（+ は文字をつなぐ）
const message = customerName + 'さん、' + participantCount + '名で受付ました'
// → 'えいきちさん、7名で受付ました'`,
        },
        story: 'データベースから届く公演日は「2026-07-01」というただの文字です。画面に出る「2026年7月1日(水)」は、誰かがこの文字を加工して作っている——その「誰か」が次の材料③、関数です。',
      },
      {
        heading: '材料③ 関数 — 手順に名前を付けて「使い回す」',
        text: 'ここがあなたの質問「なぜページごとに関数を呼び出すのか」の核心です。「2026-07-01 を 2026年7月1日(水) に変える」には、分解→組み立て→曜日計算と数十行の手順が必要です。日付を表示する画面はこのシステムに50以上あります。もし全画面にこの手順をコピーして書いたら？——直すとき50箇所を直すことになり、必ず直し漏れが出ます。そこで手順に formatJstDateJa という名前を付けて1箇所（jstDate.ts）に置き、各画面からは名前で呼ぶだけにする。これが関数（function）であり、ページが関数を呼び出す理由です。1箇所直せば、全画面が直る。',
        code: {
          caption: 'src/utils/jstDate.ts より（説明用に簡略化）',
          body: `// 「日付の文字」を受け取り（引数）、「日本語の日付」を返す（戻り値）関数
function formatJstDateJa(value) {
  const t = getJstParts(value)            // ① 別の関数を呼んで年月日に分解
  if (!t) return ''                       // ② 変な入力なら空文字を返す（防御）
  return t.y + '年' + t.mo + '月' + t.d + '日'   // ③ 部品をつないで返す
}

// 各画面からは名前で呼ぶだけ。中の手順を知らなくていい
formatJstDateJa('2026-07-01')   // → '2026年7月1日'`,
        },
        story: 'あなたが見た「7/1」「2026年7月1日」の表記揺れの正体：日付の関数が2つあり（formatJstMonthDay と formatJstDateJa）、ページごとに違う方を呼んでいました。修正は「呼び出す関数を統一」しただけ。50画面を1つずつ直したわけではありません——これが関数の威力です。',
        tryIt: 'VS Code で src/utils/jstDate.ts を開いてください。冒頭のコメントに「どの画面はどの関数を呼ぶか」のルールが書いてあります。',
      },
      {
        heading: '材料④ 条件分岐（if）= 場合分け',
        text: '「もし〜なら A、そうでなければ B」。業務ルールはほぼ全部これで書かれています。例えば貸切承認のボタンは「結果が成功ならトースト表示、失敗ならエラー表示」という場合分けです。',
        code: {
          caption: 'src/pages/PrivateBookingManagement/index.tsx より — 承認結果の場合分け',
          body: `const result = await handleApprove(...)   // 承認の関数を呼び出し、結果を待つ
if (result?.success) {
  showToast.success('貸切予約を確定しました。確定メールとGM通知を送信します。')
} else if (result?.error) {
  showToast.error(getSafeErrorMessage(result.error, '処理に失敗しました'))
}`,
        },
        story: '「確定したか分からない」と報告してくれたバグの正体は、この場合分けに『成功のとき』の枝が無かったこと。失敗時しか書かれていなかったので、成功しても何も起きませんでした。',
      },
      {
        heading: '材料⑤ 繰り返し（ループ）= 件数ぶん同じことをする',
        text: 'マイページの予約一覧は「予約が5件あれば、カードを5回作る」という繰り返しでできています。このシステムでは map（配列の各要素に同じ処理を適用する道具…正式には配列のメソッド）をよく使います。',
        code: {
          caption: '一覧画面の典型パターン — 予約の数だけカードを作る',
          body: `reservations.map(r =>
  <ReservationCard
    title={r.title}                       // それぞれの予約の値を
    date={formatJstDateJa(r.date)}        // 関数で整形して
  />                                      // カード部品に渡す
)`,
        },
        story: 'この数行に材料が全部入っています：reservations が変数、r.date が値、formatJstDateJa が関数の呼び出し、map が繰り返し。どんな複雑な画面も、読み解けば必ずこの5つの材料に分解できます。',
      },
    ],
  },
  {
    id: 'frontend',
    no: 2,
    title: '画面（フロントエンド）の仕組み',
    subtitle: 'React =「状態が変わると画面が描き直される」',
    sections: [
      {
        heading: '画面は「部品（コンポーネント）」の組み合わせ',
        text: 'このシステムの画面は React という仕組みで作られています。考え方は1つだけ：「データ（状態）を持ち、状態が変わったら画面が自動で描き直される」。ボタンも一覧もモーダルも全部「状態 → 見た目」の変換関数です。',
        code: {
          caption: '最小のコンポーネント例 — 状態(count)が変わると表示が変わる',
          body: `function Counter() {
  const [count, setCount] = useState(0)        // 状態: いまの数
  return (
    <button onClick={() => setCount(count + 1)}>
      {count} 回押された                        // 状態を見た目に変換
    </button>
  )
}`,
        },
        story: 'マイページの「貸切タブ」は、DBから取った予約データ（状態）をカード（見た目）に変換しています。表記揺れ修正で直したのは「変換のしかた」だけで、データ自体は触っていません。見た目とデータを分けて考えるのがコツです。',
        tryIt: '予約サイトを開いて右クリック→「検証」(開発者ツール)。Elements タブで画面のHTMLが、コンポーネントの出力結果です。',
      },
      {
        heading: '「読み込み中」という第3の状態',
        text: '画面の状態は「ある/ない」の2択ではなく「まだ分からない（読み込み中）」を含む3択です。これを2択で扱うとバグになります。',
        code: {
          caption: 'src/pages/dev/ProjectGuide.tsx より — 読み込み完了を待ってから判定',
          body: `const ready = !authLoading && !orgLoading          // 両方の読み込みが終わった？
const allowed = ready && checkIsLicenseAdmin(...)  // 終わってから権限判定
if (!ready) return null                            // 読み込み中は「何もしない」`,
        },
        story: 'ガイドページが「すぐトップに飛ばされる」と報告してくれたバグ。読み込み中（まだ分からない）を権限なし（ダメ）と誤判定していました。「不明」と「否」を区別する——システム設計全般で一番よく踏む穴の1つです。',
      },
    ],
  },
  {
    id: 'database',
    no: 3,
    title: 'データベース = 表の集まりと「関係」',
    subtitle: 'あなたの業務データはこう保存されている',
    sections: [
      {
        heading: 'テーブル＝Excelの表、行＝1件、列＝項目',
        text: 'データベース（Supabase の中身は PostgreSQL）は、厳格なルール付きのExcelだと思ってください。「reservations（予約）」という表に、1予約＝1行で入っています。表同士は ID で繋がっていて、これを「リレーション（関係）」と呼びます。',
        code: {
          caption: '貸切まわりの表の関係（実際のテーブル名）',
          body: `scenario_masters（シナリオの原本・全組織共有）
   └─ organization_scenarios（組織ごとの採用設定。料金の上書き等）

private_groups（貸切の主催グループ）
   └─ reservations（申込。 private_group_id で上のグループに繋がる）
        └─ schedule_events（承認されると公演としてカレンダーに載る）

gm_availability_responses（GMの出欠回答。reservation_id で申込に繋がる）`,
        },
        story: '「貸切申込が管理画面に出ない」事件では、グループは正しい組織・予約は別の組織、と親子で組織がズレていました。表の関係を知っていると「どの表のどの行がおかしいか」を特定できます。実際、調査はSQL（表への質問文）で行いました。',
      },
      {
        heading: 'SQL = 表への質問文',
        text: 'SQLは「どの表から・どの条件で・何を取り出すか」を書く言語です。読めるだけでも、障害調査の会話が分かるようになります。',
        code: {
          caption: '実際にバグ調査で使った質問（簡略版）',
          body: `SELECT r.id, r.created_at, o.name AS 組織名
FROM reservations r                       -- 予約の表から
JOIN organizations o                      -- 組織の表と繋いで
  ON o.id = r.organization_id
WHERE r.reservation_source = 'web_private'  -- 貸切申込だけに絞り
ORDER BY r.created_at DESC                  -- 新しい順に並べる
LIMIT 5;                                    -- 5件だけ見る`,
        },
        tryIt: 'Supabase のダッシュボード → Table Editor で reservations 表を開くと、この「Excel」を直接見られます（staging 側で見るのが安全）。',
      },
    ],
  },
  {
    id: 'backend',
    no: 4,
    title: 'バックエンドと API — 画面と金庫の間の受付',
    subtitle: 'なぜ画面から直接DBを触らせないのか',
    sections: [
      {
        heading: 'API = 注文窓口',
        text: '画面（ブラウザ）は信用できない場所です。悪意ある人が改造できるからです。だから大事な処理は、サーバー側の「窓口（API）」を通します。窓口は注文者が誰か（認証）と、その注文をしてよいか（認可）を確認してから厨房（DB）に通します。',
        code: {
          caption: 'このシステムの3種類の窓口',
          body: `① /api/*（Vercel上の関数）
   例: /api/scenarios … 「どの組織の注文か」をログイン情報(JWT)から確定
② RPC（DB内の定型処理ボタン）
   例: create_private_booking_request … 申込作成を一括で安全に
③ RLS（DBの門番）
   どの窓口を通っても最後にDB自身が「他組織の行は見せない」を強制`,
        },
        story: '貸切申込の組織化けバグは、②のRPCの中の「組織の決め方」が曖昧だったのが原因。複数の防御層（API・RPC・RLS）があっても、1層のロジックが緩いと事故は起きます。逆に言うと、層が分かれていたから被害が「組織の取り違え」で済み、データ漏洩には至りませんでした。',
      },
      {
        heading: 'イベント駆動 = 「〜が起きたら自動で〜する」',
        text: '人が押すボタンだけでなく、「予約が作られたら通知を送る」のような自動連鎖もシステムの重要な部品です。このシステムでは DBトリガー（自動スイッチ）が Edge Function（出前係）を呼び、Discord に通知します。',
        code: {
          caption: '貸切申込の通知が届くまでの連鎖',
          body: `お客様が申込ボタンを押す
 → RPC が reservations に1行追加
   → DBトリガーが発火（「予約が増えた！」）
     → app_config 表に書いてあるURLへ通知係を呼び出し  ← ※ここが教訓②の現場
       → Edge Function が担当GMを検索して Discord へ送信`,
        },
        story: '「stagingで直したのに通知が変わらない」怪事件は、この連鎖の④で呼ぶ先のURLが（データコピーの副作用で）本番を指していたから。自動連鎖は便利ですが、配線がデータの中にあると目で追いにくい——だから図にして残すのが大事です。',
      },
    ],
  },
  {
    id: 'design',
    no: 5,
    title: 'システム設計の原則 — なぜ「分ける」のか',
    subtitle: '今回のリファクタリングがやっていることの意味',
    sections: [
      {
        heading: '関心の分離：1つのものは1つの仕事だけ',
        text: '設計の最重要原則です。「画面の見た目」「データの取得」「業務ルール」「保存」を別の場所に書く。混ぜると、1つ直すときに全部を理解しないといけなくなり、修正が事故になります。',
        code: {
          caption: 'このシステムの層（上から下へ一方通行）',
          body: `画面（pages/）          … 見た目と操作だけ
  ↓ 使う
データ取得係（hooks/）   … 「いつ取りに行くか・キャッシュ」だけ
  ↓ 使う
API層（lib/api/）       … 「伝票の書き方」だけ
  ↓ 使う
DB（Supabase）          … 保存と門番だけ

逆流（DBが画面を知っている等）は禁止。`,
        },
        story: 'Phase 5 で解体予定の「2,000行のモーダル」は、この原則の違反例です。1つのポップアップに見た目・取得・業務ルール・保存が全部入っていて、トースト1つ足すにも全体を読む必要がある。リファクタリングとは、この「混ざり」をほどく作業です。',
      },
      {
        heading: '命名と死にコード：読む人のための設計',
        text: 'コードは書く時間より読まれる時間の方が圧倒的に長い。だから「名前が実態を表すこと」「使わないものは消すこと」自体が設計です。',
        story: 'このプロジェクトでは、シナリオ編集画面が4世代併存し、案内コメントが死んでいる方を推奨していました。Phase 1 で約22,000行を消した結果、「どれが本物か」を考える時間がゼロになった。消すことは立派な設計行為です。',
        tryIt: 'git log --oneline -30 をターミナルで打つと、この1ヶ月の変更履歴（コミット）が読めます。コミットメッセージも「読む人のための文章」です。',
      },
      {
        heading: 'トレードオフ：設計に正解はなく「選択」がある',
        text: '日付表示の議論を思い出してください。「7/1 は短いが年が分からない / 2026年7月1日 は明確だが長い」。どちらも正しく、業務（年をまたぐ予約がある）に合わせて選びました。設計とは技術の問題である以上に、業務の優先順位を決めることです。あなたが一番得意な部分です。',
      },
    ],
  },
  {
    id: 'multitenant',
    no: 6,
    title: 'マルチテナントとセキュリティ',
    subtitle: '複数の組織が同居するシステムの守り方',
    sections: [
      {
        heading: 'テナント分離：全データに「誰のものか」の札を付ける',
        text: 'このシステムは複数の組織（クインズワルツ・そしき等）が1つのDBに同居しています。だからほぼ全ての表に organization_id 列があり、検索には必ず「自組織のものだけ」という条件を付けます。これが1箇所でも抜けると、他社の顧客情報が見える事故になります。',
        code: {
          caption: '教訓①のバグの本質（1行の条件が抜けていた）',
          body: `-- ❌ バグ: マスタIDだけで担当GMを検索（全組織のGMがヒット）
SELECT staff_id FROM staff_scenario_assignments
WHERE scenario_master_id = '...'

-- ✅ 修正: 組織の条件を必ず付ける
SELECT staff_id FROM staff_scenario_assignments
WHERE scenario_master_id = '...'
  AND organization_id = '予約の組織ID'`,
        },
        story: '実害は「そしきの申込がクインズワルツのGMに通知される」でした。共有されるもの（マスタシナリオ）と組織固有のもの（採用設定・GM・予約）の境界線を意識する——マルチテナント設計の核心です。',
      },
      {
        heading: '秘密情報（シークレット）の扱い',
        text: 'Botトークンのような「鍵」は、コードに書かず専用の金庫（環境変数・シークレット）に入れます。鍵をチャットやメモに貼ったら、使い終わったら作り直す（ローテーション）が原則です。',
        story: 'Discord のトークン騒動で体験した通り：鍵は再発行すると古いものが即死ぬ／本物の鍵は二度と表示されない／環境ごとに金庫が別。この3点を知っているだけで、次回のトラブルは10分で終わります。',
      },
    ],
  },
  {
    id: 'change',
    no: 7,
    title: '変更を安全に届ける技術',
    subtitle: 'Git・環境・検証 — 今回の改修で毎回やっていたこと',
    sections: [
      {
        heading: 'Git = 変更のタイムマシン＋作業の単位',
        text: '全ての変更は「コミット」という単位で記録され、いつでも巻き戻せます。このプロジェクトのルールは「1作業=1コミット」。理由は、問題が起きたとき**その作業だけ**を取り消せるからです。',
        code: {
          caption: '変更が本番に届くまでの道（このプロジェクトの場合）',
          body: `手元で修正
 → コミット（変更に名前と説明を付けて記録）
  → staging ブランチへ push（リハーサル環境に自動反映）
   → 動作確認（あなたの仕事！実際に何度もバグを見つけてくれた）
    → main へマージ（本番に自動反映）

DBの構造変更があるときは「DB → 通知係 → 画面」の順番が鉄則`,
        },
      },
      {
        heading: '機械にやらせる検証：tsc / lint / knip',
        text: '人間の目視だけに頼らず、毎コミット前に機械検査を通します。tsc（型チェック）は「設計図と矛盾する使い方」を、lint は「危険な書き方」を、knip は「使われていないコード」を見つけます。',
        story: '22,000行の削除が事故ゼロだったのは、消すたびに tsc で「誰も使っていない」ことを機械に証明させたから。「人間は信じない、検証を信じる」が安全な変更の基本姿勢です。',
        tryIt: 'ターミナルで npx tsc --noEmit を打つと型チェックが走ります（何も出なければ合格）。あなたのシステムの健康診断です。',
      },
      {
        heading: '環境の取り違えに注意',
        text: '「ローカル＝stagingのデータ／本番サイト＝本番のデータ」。スタッフ編集の保存が「消えた」事件は、本番画面で編集し、stagingでテストしていたのが原因でした。いま自分がどの環境を見ているかを常に意識する——開発に関わる全員の基本動作です。',
      },
    ],
  },
  {
    id: 'next',
    no: 8,
    title: '学びを続けるには',
    subtitle: 'このシステムを教材にし続ける方法',
    sections: [
      {
        heading: 'おすすめの学び方（このプロジェクト活用法）',
        text: '一般の教材より、自分のシステムで学ぶ方が圧倒的に身につきます。おすすめの順番：①このページの各章の「やってみよう」を全部やる → ②小さい実ファイル（jstDate.ts → ScenarioFilters 系 → 小さめのページ）を上から読む → ③次の修正のとき「どのファイルをどう直すか」の説明を聞きながら一緒に追う → ④軽微な修正（文言変更など）を自分でやってみる。',
      },
      {
        heading: 'AIとの協働で学ぶ',
        text: 'これからの開発は「AIに書かせて、人間が判断する」が標準になります。あなたの仕事は仕様の判断（どの形式に統一する？削除する？付け替える？）と、実環境での検証。今回のバグ発見は全部あなたの実機テストが起点でした。コードが読めるほど、AIへの指示と検収の精度が上がります。',
      },
      {
        heading: '深掘りしたくなったら',
        text: 'キーワードだけ置いておきます（検索や私への質問に使ってください）：HTML/CSS/JavaScript の基礎 → React 公式チュートリアル → SQL の基礎（SELECT文）→ 「リレーショナルデータベース設計」→ 「Git 入門」→ 「ソフトウェア設計 関心の分離」。どれも、このページの実例と突き合わせながら読むと2倍速で理解できます。',
      },
    ],
  },
]

/* ────────────────────────────────────────────── */

export function LearnFromThisSystem() {
  const { user, loading: authLoading } = useAuth()
  const { organizationId, isLoading: orgLoading } = useOrganization()
  const navigate = useNavigate()
  const ready = !authLoading && !orgLoading
  const allowed = ready && checkIsLicenseAdmin(user?.role, organizationId)
  const [openId, setOpenId] = useState<string>(chapters[0].id)

  useEffect(() => {
    if (ready && !allowed) navigate('/', { replace: true })
  }, [ready, allowed, navigate])

  if (!ready || !allowed) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">📚 このシステムで学ぶ プログラミング＆システム設計</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            教材はあなた自身のシステム。すべての概念を、ここで実際に起きた出来事と実在のコードで説明します。
            <a href="/dev/project-guide" className="text-blue-600 underline ml-2">← 全体ガイドに戻る</a>
          </p>
        </div>

        {/* 目次 */}
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm font-semibold text-blue-900 mb-2">カリキュラム（クリックで開閉）</p>
            <div className="grid sm:grid-cols-2 gap-1">
              {chapters.map(c => (
                <button
                  key={c.id}
                  onClick={() => {
                    setOpenId(c.id)
                    document.getElementById(`ch-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  className="text-left text-sm text-blue-800 hover:underline py-0.5"
                >
                  第{c.no}章 {c.title}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 例え話と正式名称の対応表 */}
        <Card className="border-purple-200 bg-purple-50">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm font-semibold text-purple-900 mb-1">🔤 例え話 ↔ 正式名称 対応表</p>
            <p className="text-xs text-purple-800 mb-2">
              このページの例え話は理解の入口です。人と話すとき・検索するときは右の正式名称を使ってください。
            </p>
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr className="text-left text-purple-900 border-b border-purple-200">
                    <th className="py-1 pr-3">このページの例え話</th>
                    <th className="py-1 pr-3">正式名称</th>
                    <th className="py-1 pr-3">英語</th>
                  </tr>
                </thead>
                <tbody className="text-purple-800">
                  {[
                    ['機械・道具', '関数', 'function'],
                    ['機械に入れるもの', '引数（ひきすう）', 'argument / parameter'],
                    ['機械から出てくるもの', '戻り値（もどりち）', 'return value'],
                    ['機械を動かす', '呼び出す', 'call'],
                    ['画面の部品', 'コンポーネント', 'component'],
                    ['いまの数・画面が覚えている値', '状態', 'state'],
                    ['データ取得係（ウェイター）', 'フック（React Query を使ったデータ取得フック）', 'hook'],
                    ['注文窓口・伝票', 'API（エーピーアイ）／エンドポイント', 'API / endpoint'],
                    ['厨房と金庫', 'データベース', 'database (DB)'],
                    ['表・行・列', 'テーブル／レコード（行）／カラム（列）', 'table / record / column'],
                    ['表への質問文', 'SQL（エスキューエル）クエリ', 'SQL query'],
                    ['門番', 'RLS（行レベルセキュリティ）', 'Row Level Security'],
                    ['定型処理のボタン', 'RPC（ストアドプロシージャの呼び出し）', 'RPC / stored procedure'],
                    ['自動スイッチ', 'トリガー', 'trigger'],
                    ['出前係', 'Edge Function（サーバーレス関数）', 'edge function'],
                    ['データの設計図', '型（かた）／型定義', 'type'],
                    ['鍵・金庫の中の秘密', 'シークレット／環境変数', 'secret / environment variable'],
                    ['変更の記録単位', 'コミット', 'commit'],
                    ['リハーサル環境', 'ステージング環境', 'staging environment'],
                  ].map(([a, b, c]) => (
                    <tr key={a} className="border-b border-purple-100">
                      <td className="py-1 pr-3">{a}</td>
                      <td className="py-1 pr-3 font-semibold">{b}</td>
                      <td className="py-1 pr-3 font-mono">{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* 章 */}
        {chapters.map(c => {
          const open = openId === c.id
          return (
            <Card key={c.id} id={`ch-${c.id}`}>
              <CardHeader
                className="cursor-pointer select-none"
                onClick={() => setOpenId(open ? '' : c.id)}
              >
                <CardTitle className="flex items-center justify-between text-base">
                  <span>
                    <Badge variant="outline" className="mr-2">第{c.no}章</Badge>
                    {c.title}
                  </span>
                  <span className="text-gray-400 text-sm">{open ? '▲ 閉じる' : '▼ 開く'}</span>
                </CardTitle>
                <p className="text-sm text-muted-foreground">{c.subtitle}</p>
              </CardHeader>
              {open && (
                <CardContent className="space-y-5">
                  {c.sections.map(s => (
                    <div key={s.heading} className="space-y-2">
                      <h3 className="text-sm font-bold border-l-4 border-blue-400 pl-2">{s.heading}</h3>
                      <p className="text-sm text-gray-700 leading-relaxed">{s.text}</p>
                      {s.code && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">{s.code.caption}</p>
                          <pre className="bg-slate-900 text-slate-100 text-xs p-3 rounded overflow-x-auto leading-relaxed">{s.code.body}</pre>
                        </div>
                      )}
                      {s.story && (
                        <div className="p-3 rounded border bg-amber-50 border-amber-200">
                          <p className="text-xs font-semibold text-amber-900 mb-0.5">💡 このシステムでの実話</p>
                          <p className="text-xs text-amber-800 leading-relaxed">{s.story}</p>
                        </div>
                      )}
                      {s.tryIt && (
                        <div className="p-3 rounded border bg-green-50 border-green-200">
                          <p className="text-xs font-semibold text-green-900 mb-0.5">✋ やってみよう（安全・読むだけ）</p>
                          <p className="text-xs text-green-800 leading-relaxed">{s.tryIt}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          )
        })}

        <p className="text-xs text-gray-400 text-center pb-8">
          実装: src/pages/dev/LearnFromThisSystem.tsx ／ 章の追加・修正はこのファイルの chapters 配列を編集
        </p>
      </div>
    </div>
  )
}
