import {
  LogIn, Compass, Rocket, Wrench, Mail, LifeBuoy,
} from 'lucide-react'
import type { HardcodedPageContent } from '@/types/hardcodedContent'

export const SITE_OVERVIEW_DEFAULT: HardcodedPageContent = {
  description:
    "マーダーミステリー店舗向け予約・運営管理サイトの全体ガイドです。新しく組織を立ち上げる方はこのページから順番に読み進めてください。各機能の詳しい操作は左サイドバーの個別マニュアルに分かれています。",
  sections: [
    // ─── 1. サインアップ・ログイン ──────────────────────────────────
    {
      heading: "1. サインアップ・ログイン",
      intro: "管理画面へのアクセス方法は「新規に組織を立ち上げる」「既存組織にスタッフとして招待される」の 2 通りです。",
      items: [
        {
          title: "A. 新規に組織を立ち上げる（セルフサインアップ）",
          body: "招待は不要。公開ページ /start から組織情報・代表店舗・代表ユーザーを入力するだけで組織が作成されます。",
          orderedBullets: [
            "/start にアクセスしてフォーム入力（組織名・slug・住所、代表店舗、代表者メール／パスワード）",
            "確認画面で内容チェック → 「登録する」",
            "確認メールが届くので URL をクリックして認証",
            "ログイン後、自分の組織の管理画面が開く",
          ],
          note: "slug（URL）は公開予約サイトの一部になります。重複不可・後から変えるとブックマークが切れます",
          noteType: "warning",
        },
        {
          title: "B. 既存組織にスタッフとして招待される",
          body: "既存組織の管理者が「スタッフ → 招待」からメールアドレスを指定して招待を送信。受け取った人はメールのリンクからアカウント作成します。",
          orderedBullets: [
            "招待メールが届く（リンク有効期限あり）",
            "リンクからメールアドレス・パスワードを設定",
            "プロフィール入力（氏名・電話番号）",
            "ログイン後、招待された組織の管理画面が開く",
          ],
        },
        {
          title: "ログイン後の画面",
          body: "ログイン直後は「ダッシュボード」が表示されます。所属組織が 1 つなら自動で選択され、複数あれば組織選択画面が出ます。",
          note: "パスワードを忘れた場合はログイン画面の「パスワードリセット」から再設定メールを送信できます",
          noteType: "info",
        },
      ],
    },

    // ─── 2. サイドバーの見方 ──────────────────────────────────────
    {
      heading: "2. サイドバーの見方（管理画面ナビゲーション）",
      intro: "サイドバーは機能カテゴリで整理されています。役割に応じて表示される項目が変わります（admin / staff / license_admin）。",
      items: [
        {
          title: "ダッシュボード・スケジュール・店舗・スタッフ・シナリオ",
          body: "管理運営の核となる 5 機能。最上段にフラットに並びます。",
          bullets: [
            "ダッシュボード：本日の予約・売上のサマリー",
            "スケジュール：公演カレンダーと枠管理",
            "店舗：店舗マスタの登録・編集",
            "スタッフ：GM／受付スタッフの登録、シフト権限管理",
            "シナリオ：開催可能なシナリオ一覧と紐付け",
          ],
        },
        {
          title: "シフト・GM",
          body: "スタッフの稼働関連。",
          bullets: [
            "シフト提出：スタッフが自分の出勤可能日を入力",
            "GM確認：GM がアサイン依頼の確認・回答",
            "担当作品：GM が自分のできる作品を申告",
          ],
        },
        {
          title: "貸切・予約",
          body: "公演単位の運営情報。",
          bullets: [
            "貸切管理：貸切リクエストの承認／却下",
            "グループ一覧：作成済みの貸切グループの一覧",
            "予約管理：通常予約と貸切予約の全件一覧、ステータス変更、キャンセル対応",
          ],
        },
        {
          title: "顧客・クーポン",
          body: "お客様データとプロモーション。",
          bullets: [
            "顧客：登録顧客の一覧・編集・予約履歴の確認",
            "クーポン：キャンペーン作成・配布・利用状況の管理",
          ],
        },
        {
          title: "メール",
          body: "メール送信ログ：システムが送ったメール（予約確認・キャンセル・リマインド・クーポン付与など）の履歴と配信状態を確認できます。",
          note: "Resend Webhook で受信した配信／開封／バウンス状態が自動反映されます",
          noteType: "info",
        },
        {
          title: "コンテンツ",
          body: "ブログ：予約サイトのトップに公開するお知らせ記事。",
        },
        {
          title: "運営マニュアル",
          body: "フロア業務向けマニュアル群。",
          bullets: [
            "共通マニュアル：受付・チェックイン／事前アンケート・配役／クーポン受付対応／クーポン種類",
            "新規作成：組織独自のマニュアルページを DB に保存して追加可（admin のみ）",
          ],
        },
        {
          title: "使い方",
          body: "管理サイト自体の操作マニュアル。本ページ「サイト概要・全体ガイド」もここに含まれます。",
          bullets: [
            "サイト概要・全体ガイド（このページ）",
            "予約管理／スタッフ管理／シフト・スケジュール／クーポン管理 の各機能ガイド",
          ],
        },
        {
          title: "売上・管理",
          body: "経営・ライセンス管理。",
          bullets: [
            "売上：日次／月次／シナリオ別の売上集計、グラフ表示、CSV エクスポート",
            "公演報告：シナリオ作者へのライセンス報告書類の集計・提出",
          ],
        },
        {
          title: "設定",
          body: "運営の前提となる各種設定。5 サブカテゴリに分かれます。",
          bullets: [
            "組織：組織情報・デザイン（テーマカラー／ヘッダー画像／FAQ／ブログ等）",
            "店舗・予約：営業時間・公演スケジュール枠・予約フォーム・キャンセルポリシー・料金",
            "スタッフ：勤怠・給与計算ルール",
            "メール・通知：メール文面テンプレ・送信設定・通知連携（Discord 等）・メール送信ログ",
            "システム：データ管理・カテゴリ／作者管理など内部設定",
          ],
          note: "設定変更は即時反映されますが、ブラウザのキャッシュにより数秒遅れて見える場合があります",
          noteType: "info",
        },
        {
          title: "MMQ運営（license_admin のみ）",
          body: "MMQ 運営チーム専用カテゴリ。シナリオマスタの承認、ライセンス管理、組織横断的な管理機能が並びます。通常組織には表示されません。",
        },
      ],
    },

    // ─── 3. 初期セットアップ手順 ──────────────────────────────────
    {
      heading: "3. 初期セットアップ手順",
      intro: "新しく組織を立ち上げて予約受付開始までの推奨フロー。下から順にやれば抜け漏れがありません。",
      items: [
        {
          title: "STEP 1: 組織情報の登録",
          body: "「設定 → 組織情報」で組織名・連絡先・ロゴ・予約サイトのスラッグ（URL）を入力。",
          orderedBullets: [
            "組織名・連絡先メール",
            "予約サイト用 slug（公開 URL の一部になります）",
            "ヘッダー画像・テーマカラー",
          ],
          note: "slug は公開 URL に使われます。後から変更は可能ですが、お客様のブックマークが切れる点に注意",
          noteType: "warning",
        },
        {
          title: "STEP 2: 店舗を登録",
          body: "「店舗」ページで実店舗を登録。1 組織で複数店舗を持てます。住所・営業時間・キャパシティ・地域などを入れます。",
          note: "臨時会場（イベント等）の場合は「臨時会場フラグ」を ON にして特定日付のみ有効化",
          noteType: "info",
        },
        {
          title: "STEP 3: スタッフを招待",
          body: "「スタッフ」ページから招待メールを送信。受け取った人は STEP 1 の流れでアカウント作成します。",
          orderedBullets: [
            "「+ 招待」ボタン → メールアドレスと役割を指定",
            "招待者がメールから登録 → スタッフテーブルに自動紐付け",
            "役割（GM / 受付 / 管理者）を設定",
          ],
        },
        {
          title: "STEP 4: シナリオを登録",
          body: "「シナリオ」ページでマスタから採用したいシナリオを追加。タイトル・人数・所要時間・料金・公開設定を行います。",
          bullets: [
            "MMQ 共通シナリオマスタから選ぶ（推奨）",
            "オリジナルシナリオは「新規作成」",
            "公開状態：サイト表示 ON / 貸切受付 ON / 期間限定 など細かく制御可",
          ],
        },
        {
          title: "STEP 5: 公演スケジュールを作成",
          body: "「スケジュール」で日付・店舗・シナリオ・GM を割り当て。お客様には公開されたスケジュールに対して予約が入ります。",
          note: "繰り返し公演はテンプレ機能で一括生成できます",
          noteType: "info",
        },
        {
          title: "STEP 6: 通知・メール設定の確認",
          body: "「設定 → メール / 通知 / Discord」で送信元アドレス・お知らせ文面・Discord 連携などを確認。デフォルトのまま開業しても OK ですが、組織名やフッターは差し替えるのを推奨。",
        },
        {
          title: "STEP 7: 予約サイトを公開",
          body: "ここまで完了したら予約サイト（/{slug}）が稼働開始。お客様が予約できる状態になります。",
          note: "事前にスタッフでテスト予約を 1 件入れ、確認メールが届くか・予約管理に表示されるかを必ず確認してください",
          noteType: "caution",
        },
      ],
    },

    // ─── 4. 共通操作 ───────────────────────────────────────────────
    {
      heading: "4. 共通操作（どのページでも使える機能）",
      items: [
        {
          title: "検索と絞り込み",
          body: "一覧画面には検索ボックスとフィルターアイコンがあります。",
          bullets: [
            "🔍 検索：予約番号・顧客名・シナリオ名などキーワードで部分一致検索",
            "🪜 フィルター：ステータス・支払い・期間など複数条件を組合せ可",
            "選択状態はブラウザに記憶され、ページ移動後も維持されます",
          ],
        },
        {
          title: "テーブル（一覧表）の操作",
          body: "並び替え可能なカラムはヘッダーに矢印が出ます。クリックで昇順／降順切替。",
          bullets: [
            "列の表示／非表示・並び順は右上の歯車アイコンから設定可（一部画面）",
            "1 ページの表示件数は 50 件、ページネーションで切替",
            "📥 CSV エクスポート可能な画面では右上にダウンロードアイコン",
          ],
        },
        {
          title: "詳細を開く",
          body: "一覧の行をクリックするか「詳細」「編集」ボタンで詳細画面・ダイアログを開きます。変更後は「保存」を必ず押してください。",
        },
        {
          title: "削除と取り消し",
          body: "削除系の操作は確認ダイアログが出ます。基本的には復元不可能なので必ず内容確認してから OK してください。",
          note: "予約のキャンセルは「ステータス変更」であり、削除ではありません。記録は残ります",
          noteType: "info",
        },
      ],
    },

    // ─── 5. メール送信の仕組み ────────────────────────────────────
    {
      heading: "5. メール送信の仕組み",
      intro: "予約確認・キャンセル・リマインド・クーポン付与などのお客様向けメールは Resend という外部サービス経由で自動送信されます。",
      items: [
        {
          title: "送信されるタイミング",
          body: "以下のタイミングで自動送信されます。",
          bullets: [
            "予約完了時 → 予約確認メール",
            "予約変更／キャンセル時 → 変更・中止のお知らせ",
            "公演前日／当日 → リマインドメール",
            "公演中止判定時 → 中止連絡メール",
            "貸切リクエスト時 → 受付メール",
            "クーポン付与時（設定 ON のキャンペーンのみ）→ 付与通知メール",
          ],
        },
        {
          title: "送信ログの確認",
          body: "「メール → メール送信ログ」で全送信履歴と配信状態を確認できます。",
          bullets: [
            "宛先・件名・本文・送信日時",
            "ステータス（送信済 / 配信済 / 開封 / バウンス / 失敗）",
            "種別フィルター（予約確認 / クーポン付与 / リマインドなど）",
            "本文プレビューで実際にお客様に届いた内容を確認可",
          ],
        },
        {
          title: "メール文面・差出人の設定",
          body: "「設定 → メール」で組織独自の差出人名・返信先アドレス・テンプレート文（あいさつ・署名・フッター）を編集できます。",
          note: "差出人アドレスは MMQ 側で検証済みのドメイン（@mmq.game）固定。お客様の返信先（reply-to）に組織のアドレスを設定するのが標準",
          noteType: "info",
        },
      ],
    },

    // ─── 6. トラブルシュート ──────────────────────────────────────
    {
      heading: "6. トラブルシュート（よくある質問）",
      items: [
        {
          title: "予約が管理画面に表示されない",
          body: "以下を順に確認してください。",
          orderedBullets: [
            "店舗フィルター・期間フィルターが意図せず効いていないか",
            "ステータスフィルター（「キャンセル」を除外しているなど）",
            "ブラウザを再読み込み（F5 / ⌘R）してデータ再取得",
            "改善しなければ、お客様が予約完了画面まで到達したかを確認（途中離脱は予約登録されない）",
          ],
        },
        {
          title: "お客様にメールが届かない",
          orderedBullets: [
            "「メール → メール送信ログ」で該当予約の送信状態を確認",
            "ステータスが「バウンス」「失敗」なら、お客様のメールアドレス入力ミスの可能性大",
            "ステータスが「送信済」なのに届かないなら、お客様の迷惑メールフォルダを案内",
            "@mmq.game をドメイン許可設定するよう案内すると確実",
          ],
        },
        {
          title: "スタッフを追加したのに見えない",
          body: "招待メールの URL からアカウント登録が完了するまで「スタッフ一覧」には未掲載になります。招待者にメールが届いているか、迷惑メールに入っていないかを確認してください。",
        },
        {
          title: "クーポンが付与されない",
          orderedBullets: [
            "キャンペーンが「有効」状態か",
            "「配布期間（valid_from / valid_until）」が今日を含んでいるか",
            "「1 人あたり配布数上限」に既に到達していないか",
            "「全体配布数上限」に達していないか",
            "trigger_type（新規登録時 / 手動）が想定どおりか",
          ],
        },
        {
          title: "Discord 通知が来ない",
          body: "「設定 → 連携 → Discord」で Webhook URL が登録されているか確認。チャンネル ID が変わると Discord 側で通知先が失効します。",
        },
        {
          title: "それでも解決しない場合",
          body: "MMQ サポート窓口（運営）までご連絡ください。エラーが発生した時刻・操作内容・お使いのブラウザを添えていただけると調査がスムーズです。",
          note: "ログイン状態でこのページを開いているスクショを送ってもらえると、画面状態の把握が一番早いです",
          noteType: "info",
        },
      ],
    },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// 汎用レンダラ（セクション / アイテム / バレット / ノート を一括描画）
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_ICONS = [LogIn, Compass, Rocket, Wrench, Mail, LifeBuoy]

function noteClass(type?: 'warning' | 'info' | 'caution' | 'success') {
  switch (type) {
    case 'warning': return 'bg-red-50 border-red-200 text-red-700'
    case 'caution': return 'bg-orange-50 border-orange-200 text-orange-700'
    case 'success': return 'bg-green-50 border-green-200 text-green-700'
    case 'info':
    default:        return 'bg-blue-50 border-blue-200 text-blue-700'
  }
}

export function SiteOverviewManual({ content }: { content?: HardcodedPageContent }) {
  const c = content ?? SITE_OVERVIEW_DEFAULT

  return (
    <div className="space-y-10 max-w-4xl mx-auto pb-12">
      <div className="space-y-3">
        <h2 className="text-2xl font-bold tracking-tight">サイト概要・全体マニュアル</h2>
        <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{c.description}</p>
      </div>

      {c.sections.map((section, sIdx) => {
        const Icon = SECTION_ICONS[sIdx] ?? Compass
        return (
          <section key={sIdx} className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">{section.heading}</h3>
            </div>

            {section.intro && (
              <p className="text-sm text-muted-foreground leading-relaxed">{section.intro}</p>
            )}

            <div className="space-y-3">
              {section.items.map((item, iIdx) => (
                <div key={iIdx} className="border rounded-lg p-4 hover:bg-muted/20 transition-colors space-y-2">
                  <h4 className="font-medium text-sm">{item.title}</h4>

                  {item.subtitle && (
                    <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                  )}

                  {item.body && (
                    <p className="text-sm text-muted-foreground whitespace-pre-line">{item.body}</p>
                  )}

                  {item.bullets && item.bullets.length > 0 && (
                    <ul className="list-disc pl-5 space-y-0.5 text-sm text-muted-foreground">
                      {item.bullets.map((b, bi) => <li key={bi}>{b}</li>)}
                    </ul>
                  )}

                  {item.orderedBullets && item.orderedBullets.length > 0 && (
                    <ol className="list-decimal pl-5 space-y-0.5 text-sm text-muted-foreground">
                      {item.orderedBullets.map((b, bi) => <li key={bi}>{b}</li>)}
                    </ol>
                  )}

                  {item.note && (
                    <div className={`border rounded px-3 py-2 text-xs ${noteClass(item.noteType)}`}>
                      {item.note}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
