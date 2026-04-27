/**
 * 既存ハードコードマニュアルページのシードデータ
 *
 * 各ページのコンテンツをブロック配列として定義し、
 * runSeedLegacyPages() で現在の組織の DB に一括登録する。
 *
 * slug は元のハードコード ID と同一にすること。
 * index.tsx がこの slug を使ってハードコード項目を自動的に非表示にする。
 */
import { manualPageApi, manualBlockApi } from '@/lib/api/manualApi'
import type { BlockType, BlockContentMap, ManualPage } from '@/types/manual'

// ---------------------------------------------------------------------------
// 型ヘルパー
// ---------------------------------------------------------------------------
type BlockSeed = {
  block_type: BlockType
  content: BlockContentMap[BlockType]
}

type PageSeed = {
  slug: string
  title: string
  description: string
  category: 'staff' | 'admin'
  icon_name: string
  display_order: number
  blocks: BlockSeed[]
}

// ---------------------------------------------------------------------------
// 各ページのシードデータ
// ---------------------------------------------------------------------------

const PAGES: PageSeed[] = [

  // ==========================================================================
  // 1. 受付・チェックイン (checkin)
  // ==========================================================================
  {
    slug: 'checkin',
    title: '受付・チェックイン',
    description: 'お客さまが来店されたら、予約を確認して「チェックイン」ボタンを押します。',
    category: 'staff',
    icon_name: 'ClipboardCheck',
    display_order: 10,
    blocks: [
      {
        block_type: 'paragraph',
        content: {
          text: 'お客さまが来店されたら、予約を確認して「チェックイン」ボタンを押します。\nチェックインで来店記録が残り、参加者数の管理に使われます。',
        },
      },
      {
        block_type: 'two_column',
        content: {
          left: {
            title: 'ダッシュボードから（簡単）',
            body: 'ホーム画面の「直近の出勤予定」から今日の公演をすぐに開けます。スケジュール管理画面へ移動せず、そのままチェックインまで完結します。',
          },
          right: {
            title: 'スケジュール管理から',
            body: 'ナビゲーションの「スケジュール」から本日の公演を探してタップします。他の公演を探したり、編集も同時に行いたい場合はこちらを使います。',
          },
        },
      },
      {
        block_type: 'section_header',
        content: { title: 'ダッシュボードからの手順' },
      },
      {
        block_type: 'steps',
        content: {
          items: [
            {
              title: 'ホーム画面の「直近の出勤予定」を確認する',
              description: 'ログイン後のホーム画面（ダッシュボード）に、今日以降の出勤予定が最大5件表示されます。今日の公演の行をタップしてください。',
            },
            {
              title: '公演ダイアログが開いたら「予約者」タブを選ぶ',
              description: 'タップすると公演の詳細ダイアログが開きます。上部タブの「予約者」を選ぶと予約一覧が表示されます。',
            },
            {
              title: 'お客さまの名前・人数を確認する',
              description: '予約者の名前・人数が一覧で表示されます。来店されたお客さまの行を確認してください。',
              sub_note: '確認すること：お名前（予約者名と一致しているか）・人数（違う場合は人数ボタンで変更）・支払方法（「詳細」を開くと確認可）',
            },
            {
              title: '「チェックイン」ボタンを押す',
              description: '確認が完了したら、右側の「チェックイン」ボタンを押します。押すと「✓ 来店済」に変わり、受付完了です。',
            },
          ],
        },
      },
      {
        block_type: 'alert',
        content: {
          type: 'success',
          body: '「✓ 来店済」になったら受付完了です。ダイアログはそのまま閉じて大丈夫です。',
        },
      },
      {
        block_type: 'section_header',
        content: { title: 'よくあるトラブルと対応' },
      },
      {
        block_type: 'faq',
        content: {
          items: [
            { question: 'ダッシュボードに今日の公演が表示されない', answer: 'スタッフ情報にGMとして登録されていない可能性があります。スケジュール管理でGM欄を確認してください。また、ログイン直後はデータ読み込みに数秒かかる場合があります。' },
            { question: '予約一覧にお客さまの名前がない', answer: 'お客様のマイページ予約詳細・予約確認メールで予約内容を確認してください。内容に問題があれば運営に即電話で連絡してください。' },
            { question: '人数が来店者数と違う', answer: 'お客様のマイページ予約詳細・予約確認メールで申込人数を確認してください。内容に問題があれば運営に即電話で連絡してください。' },
            { question: 'ステータスが「保留中」になっている', answer: '「確定」に変更してからチェックインしてください。ステータス表示部分がドロップダウンになっています。' },
            { question: '「チェックイン」ボタンが表示されない', answer: 'すでにチェックイン済（「✓ 来店済」表示）か、キャンセル済の予約です。' },
          ],
        },
      },
    ],
  },

  // ==========================================================================
  // 2. 事前アンケート・配役 (pre-reading-survey)
  // ==========================================================================
  {
    slug: 'pre-reading-survey',
    title: '事前アンケート・配役',
    description: '貸切公演のお客様にアンケートを送り、回答を確認してキャラクターを配役するまでの手順です。',
    category: 'staff',
    icon_name: 'ClipboardList',
    display_order: 20,
    blocks: [
      {
        block_type: 'paragraph',
        content: {
          text: '貸切公演のお客様にアンケートを送り、回答を確認してキャラクターを配役するまでの手順です。\nお客様のチャット画面に表示されるUIを交えて説明します。',
        },
      },
      {
        block_type: 'section_header',
        content: { title: '全体の流れ' },
      },
      {
        block_type: 'two_column',
        content: {
          left: {
            title: '配役方法①：アンケートで希望を伝える',
            body: 'お客様がアンケートで希望を回答 → スタッフが回答を確認して配役を決定 → 個別お知らせで資料送付。事前読み込みがあるシナリオではこちらが推奨です。',
          },
          right: {
            title: '配役方法②：自分たちで決める',
            body: 'お客様同士がチャット内で希望キャラを選択 → 主催者が最終確定。スタッフの介入なしでお客様が完結できます。',
          },
        },
      },
      {
        block_type: 'section_header',
        content: { title: 'お客様に見える流れ' },
      },
      {
        block_type: 'steps',
        content: {
          items: [
            {
              title: '日程確定 → ステップ表示が更新される',
              description: '店舗が日程を承認すると、お客様の画面に進行ステップが表示されます。STEP 6「事前アンケート」と STEP 7「配役確定」が追加されます。',
              sub_note: 'キャラクター設定がないシナリオでは STEP 6・7 は表示されません。',
            },
            {
              title: '主催者がチャットで配役方法を選択',
              description: '日程確定後、主催者のチャット画面にのみ配役方法の選択カードが表示されます。主催者以外のメンバーには表示されません。',
            },
            {
              title: 'お客様がアンケートに回答する',
              description: '「アンケートで希望を伝える」が選択されると、各メンバーの画面に公演前アンケートフォームが表示されます。',
              sub_note: '質問の種類：テキスト入力・単一選択・複数選択・5段階評価。公演日まで何度でも回答を更新できます。',
            },
            {
              title: '事前読み込み通知がチャットに届く',
              description: 'シナリオに「事前読み込みあり」が設定されている場合、日程確定時にチャットへ通知が自動投稿されます。',
              sub_note: '通知メッセージは「設定 → 全体設定 → 事前読み込み通知設定」から編集できます。',
            },
            {
              title: 'スタッフからの個別お知らせが届く',
              description: 'スタッフが配役を決定し個別お知らせを送ると、対象者本人だけにチャット内でメッセージが表示されます。他のメンバーには見えません。',
            },
          ],
        },
      },
      {
        block_type: 'section_header',
        content: { title: 'スタッフの操作手順（アンケート確認 → 配役）' },
      },
      {
        block_type: 'steps',
        content: {
          items: [
            {
              title: 'スケジュール管理から公演を開く',
              description: 'ナビゲーションの「スケジュール」から対象日の公演をタップして、公演編集ダイアログを開きます。',
            },
            {
              title: '「アンケート」タブでアンケート回答を確認する',
              description: '公演ダイアログ上部の「アンケート」タブを選択します。回答状況（○/○名回答）と各メンバーの回答内容を確認できます。',
              sub_note: 'メンバーの行をタップすると回答が展開されます。右上のバッジで回答状況を確認できます。',
            },
            {
              title: '回答を確認し、配役を決定する',
              description: '各メンバーの回答（希望や要望など）を確認して、キャラクターの配役を決定します。配役はシステム上でボタンを押す操作はなく、次のステップでお知らせを送信することで配役を伝えます。',
            },
            {
              title: '各メンバーに個別お知らせを送信する',
              description: 'メンバーを展開すると下部に「○○さんへ個別にお知らせ」セクションがあります。① キャラクター選択（資料URL自動添付）→ ② 定型文チェック → ③ 追加メッセージ入力 → ④ 送信',
            },
          ],
        },
      },
      {
        block_type: 'alert',
        content: {
          type: 'success',
          body: '全メンバーへの送信が完了したら配役完了です。お客様はチャットから資料を確認して準備を進めます。',
        },
      },
      {
        block_type: 'section_header',
        content: { title: '別の確認方法：貸切管理画面' },
      },
      {
        block_type: 'paragraph',
        content: {
          text: 'スケジュール管理以外にも、ナビゲーションの「貸切管理」からアンケート回答を確認できます。\n貸切リクエストの詳細画面を開くと、「アンケート回答」セクションが表示されます。',
        },
      },
      {
        block_type: 'section_header',
        content: { title: 'よくあるトラブルと対応' },
      },
      {
        block_type: 'faq',
        content: {
          items: [
            { question: 'アンケートタブに「アンケート回答・配役データがありません」と表示される', answer: 'シナリオ編集でアンケートが有効になっていないか、質問が設定されていません。シナリオ編集 → アンケート設定でONにし、質問を追加してください。' },
            { question: 'お客様が「アンケートフォームが表示されない」と言っている', answer: '日程が確定済みかつ配役方法が選択済みであることを確認してください。主催者がチャットで配役方法を選んでいない場合、アンケートフォームは表示されません。' },
            { question: '回答期限を過ぎた後でもお客様は回答できるか', answer: 'はい。期限は目安として表示されるだけで、公演日までは回答・更新が可能です。' },
            { question: '個別お知らせを送り間違えた', answer: 'お知らせは削除できません。再度正しい内容でお知らせを送信してください。お客様のチャットには送信順に表示されます。' },
            { question: '配役方法を変更したい（アンケート → 自分たちで、またはその逆）', answer: '主催者がチャット画面から「方法変更」をタップすると変更できます。ただし、既に送信されたアンケート回答はリセットされます。' },
            { question: '事前読み込み通知がチャットに表示されない', answer: 'シナリオマスターで「事前読み込みあり」が有効になっているか確認してください。また、日程確定時に自動投稿されるため、確定前は表示されません。' },
          ],
        },
      },
    ],
  },

  // ==========================================================================
  // 3. クーポン受付対応 (coupon-reception)
  // ==========================================================================
  {
    slug: 'coupon-reception',
    title: 'クーポン受付対応',
    description: 'クーポンはお客さまがご自身のスマホで操作します。スタッフは声がけ・案内・確認をするだけでOKです。',
    category: 'staff',
    icon_name: 'Scissors',
    display_order: 30,
    blocks: [
      {
        block_type: 'paragraph',
        content: {
          text: 'クーポンはお客さまがご自身のスマホで操作します。\nスタッフは声がけ・案内・確認をするだけでOKです。',
        },
      },
      {
        block_type: 'alert',
        content: {
          type: 'info',
          title: 'MMQで予約したお客様のみ対応可能',
          body: 'クーポンはMMQ経由で予約されたお客様のみご利用いただけます。電話予約や他サイト経由のお客様はクーポン対象外となりますのでご注意ください。',
        },
      },
      {
        block_type: 'alert',
        content: {
          type: 'warning',
          title: '使用できる時間に注意',
          body: 'クーポンは公演開始の3時間前〜公演終了の1時間後の間しか使用できません。早すぎても遅すぎても「現在進行中の予約がありません」と表示されます。',
        },
      },
      {
        block_type: 'section_header',
        content: { title: '受付の手順' },
      },
      {
        block_type: 'steps',
        content: {
          items: [
            {
              title: 'クーポンを持っていることを確認する',
              description: 'お客さまに「クーポンはお持ちですか？」と確認します。',
            },
            {
              title: 'マイページ →「クーポン」タブを開いてもらう',
              description: 'お客さまのスマホで予約サイトのマイページを開いてもらいます。',
              sub_note: 'お客さまの操作：① サイトにログイン → ② メニューから「マイページ」 → ③「クーポン」タブをタップ',
            },
            {
              title: 'クーポンカードをタップしてもらう',
              description: '「利用可能なクーポン」に表示されたカードをタップしてもらいます。右上の「タップして使う」ラベルが目印です。',
            },
            {
              title: '公演を選んで「もぎる」を押してもらう',
              description: '表示されたダイアログで本日参加する公演を選択し、「もぎる」ボタンを押してもらいます。',
              sub_note: '・公演が表示されない → 時間外またはMMQ予約なしの可能性\n・「もぎる」がグレーのまま → 公演を選択するとボタンが有効になる',
            },
            {
              title: '「使用済み」になったことを確認する',
              description: '「もぎる」後、クーポンカードがグレーの「使用済み」表示に変わります。これを目視で確認したら受付完了です。',
            },
          ],
        },
      },
      {
        block_type: 'alert',
        content: {
          type: 'success',
          body: '「使用済み」と表示されていれば正常に完了しています。',
        },
      },
      {
        block_type: 'section_header',
        content: { title: 'よくあるトラブルと対応' },
      },
      {
        block_type: 'faq',
        content: {
          items: [
            { question: '「現在進行中の予約がありません」と表示される', answer: '公演開始の3時間前〜公演終了の1時間後の間だけ使用できます。時間外の場合は公演当日の時間帯に再度案内してください。予約がない・確定していない可能性もあります。' },
            { question: 'クーポンが表示されない（クーポン欄が空）', answer: 'クーポンが付与されていないか、すでに使用済みの可能性があります。クーポン管理ページでお客さまのクーポン状況を確認してください。' },
            { question: '「もぎる」ボタンが押せない（グレーのまま）', answer: '公演が選択されていません。ダイアログ内の公演カードをタップして選択してから再度お試しください。' },
            { question: '「このタイトルには既にクーポンをご利用済みです」と表示される', answer: '同じシナリオに対してはクーポンを2回以上使用できません。別のシナリオの公演であれば使用可能です。' },
            { question: '貸切グループに参加し忘れた状態で来店された（貸切参加のお客さま）', answer: '公演終了の1時間後までにグループへの参加手続きを完了すれば使用可能です。MMQ未登録の場合はまず登録が必要です。① MMQに登録 → ② グループの招待リンクからグループに参加（「参加する」を押す）→ ③ マイページのクーポンで使用。公演終了から1時間以内であれば動作しますが、それ以降はシステム上の判定ができなくなるため、なるべく公演開始前か休憩時間内に案内してください。' },
            { question: 'ログインできていない', answer: '予約サイトにログインしていないとマイページが開けません。登録済みのメールアドレスとパスワードでログインしてもらってください。' },
          ],
        },
      },
    ],
  },

  // ==========================================================================
  // 4. クーポン・チケット種類 (coupon-types)
  // ==========================================================================
  {
    slug: 'coupon-types',
    title: 'クーポン・チケットの種類と使用方法',
    description: '各クーポン・チケットの使用範囲と受付手順をまとめています。種類によって対応方法が異なるため、確認してから対応してください。',
    category: 'staff',
    icon_name: 'Ticket',
    display_order: 40,
    blocks: [
      {
        block_type: 'section_header',
        content: { title: 'クラファン共通券チケット' },
      },
      {
        block_type: 'check_list',
        content: {
          title: '使用可能範囲',
          items: [
            '✅ 店舗開催の通常マーダーミステリー公演',
            '✅ クインズワルツ運営による特別出張公演',
            '❌ GMテスト（使用不可）',
            '❌ ボードゲーム会（使用不可）',
            '❌ 外部主催公演（使用不可）',
          ],
        },
      },
      {
        block_type: 'steps',
        content: {
          items: [
            { title: 'チケットをもぎる' },
            { title: '使用済みにチェック（必須）' },
            { title: '料金差分は割引券としてチェックをつけて返却' },
          ],
        },
      },
      {
        block_type: 'alert',
        content: {
          type: 'caution',
          body: 'チェックは必ず行うこと。チケットは記念に持ち帰りたいお客さまもいるため、もぎるだけでなく使用済みのチェックを忘れずに行ってください。',
        },
      },
      {
        block_type: 'alert',
        content: {
          type: 'info',
          body: '割引券について：料金差分で返却する割引券は、元のチケット（共通券）と同じ条件で利用可能です。',
        },
      },
      {
        block_type: 'divider',
        content: {},
      },
      {
        block_type: 'section_header',
        content: { title: 'クラファン貸切幹事チケット' },
      },
      {
        block_type: 'check_list',
        content: {
          title: '使用可能範囲',
          items: [
            '✅ 貸切公演の幹事のみ使用可',
            '✅ 店舗開催の通常マーダーミステリー公演（貸切）',
            '✅ クインズワルツ運営による特別出張公演（貸切）',
            '❌ GMテスト（使用不可）',
            '❌ ボードゲーム会（使用不可）',
            '❌ 外部主催公演（使用不可）',
          ],
        },
      },
      {
        block_type: 'steps',
        content: {
          items: [
            { title: 'チケットをもぎる' },
            { title: '使用済みにチェック（必須）' },
            { title: '料金差分は割引券としてチェックをつけて返却' },
          ],
        },
      },
      {
        block_type: 'alert',
        content: {
          type: 'caution',
          body: 'チェックは必ず行うこと。チケットは記念に持ち帰りたいお客さまもいるため、もぎるだけでなく使用済みのチェックを忘れずに行ってください。',
        },
      },
      {
        block_type: 'alert',
        content: {
          type: 'info',
          body: '割引券について：料金差分で返却する割引券は、元のチケット（貸切幹事チケット）と同じ条件で利用可能です。他クーポンとの併用可否は未確認です。',
        },
      },
      {
        block_type: 'divider',
        content: {},
      },
      {
        block_type: 'section_header',
        content: { title: '雑誌クーポン' },
      },
      {
        block_type: 'check_list',
        content: {
          title: '使用可能範囲',
          items: ['全ての公演に使用可能（詳細範囲は未確認）'],
        },
      },
      {
        block_type: 'steps',
        content: {
          items: [{ title: 'チェックをつけて使用' }],
        },
      },
      {
        block_type: 'alert',
        content: {
          type: 'caution',
          body: '他クーポンとの併用可否は未確認です。',
        },
      },
      {
        block_type: 'divider',
        content: {},
      },
      {
        block_type: 'section_header',
        content: { title: 'MMQクーポン' },
      },
      {
        block_type: 'check_list',
        content: {
          title: '使用可能範囲',
          items: [
            'MMQ上の予約の全ての公演に使用可能',
            '出張公演（今後使用不可にする可能性あり※現状は説明していない）',
          ],
        },
      },
      {
        block_type: 'steps',
        content: {
          items: [
            { title: 'チケットもぎりをして使用確認する' },
            { title: '貸切の場合は貸切グループの作成が必要' },
          ],
        },
      },
      {
        block_type: 'alert',
        content: {
          type: 'info',
          body: '他クーポンとの併用：可',
        },
      },
      {
        block_type: 'alert',
        content: {
          type: 'warning',
          body: '出張公演での使用については今後変更の可能性があります。現時点ではお客さまへの案内は行っていません。',
        },
      },
      {
        block_type: 'divider',
        content: {},
      },
      {
        block_type: 'section_header',
        content: { title: 'ポイントカード割引券' },
      },
      {
        block_type: 'check_list',
        content: {
          title: '使用可能範囲',
          items: ['全ての公演に使用可能'],
        },
      },
      {
        block_type: 'steps',
        content: {
          items: [
            { title: '10ポイント貯まったら回収して使用' },
            { title: '記念に持ち帰りたい場合は使用済みがわかるような印をつける' },
          ],
        },
      },
      {
        block_type: 'divider',
        content: {},
      },
      {
        block_type: 'section_header',
        content: { title: '種類ごとの対応まとめ' },
      },
      {
        block_type: 'table',
        content: {
          headers: ['種類', '使用範囲', '他クーポン併用'],
          rows: [
            ['クラファン共通券', '店舗通常公演・QW運営出張（GMテスト/BG会/外部主催 不可）', '未確認'],
            ['クラファン貸切幹事', '貸切幹事のみ（GMテスト/BG会/外部主催 不可）', '未確認'],
            ['雑誌クーポン', '全公演（詳細未確認）', '未確認'],
            ['MMQクーポン', 'MMQ予約の全公演', '可'],
            ['ポイントカード割引券', '全公演', '—'],
          ],
        },
      },
    ],
  },

  // ==========================================================================
  // 5. 予約管理 (reservation)
  // ==========================================================================
  {
    slug: 'reservation',
    title: '予約管理',
    description: '予約の確認、ステータス変更、キャンセル対応など、予約に関する一連の業務フローを解説します。',
    category: 'admin',
    icon_name: 'CalendarDays',
    display_order: 50,
    blocks: [
      {
        block_type: 'section_header',
        content: { title: '予約ステータスと対応フロー' },
      },
      {
        block_type: 'key_value',
        content: {
          rows: [
            { label: '保留 (Pending)', value: '申し込み直後の状態。内容を確認し、問題なければ確定処理を行います。アクション：内容確認 → 確定ボタン' },
            { label: '確定 (Confirmed)', value: 'お客様に参加確定メールが送信され、スケジュール上の席が確保されています。アクション：当日を迎えるのみ' },
            { label: 'キャンセル', value: 'お客様都合または公演中止によりキャンセルされた状態。席は解放されます。注意：復元はできません' },
          ],
        },
      },
      {
        block_type: 'section_header',
        content: { title: '主な対応シーン' },
      },
      {
        block_type: 'faq',
        content: {
          items: [
            {
              question: '貸切リクエストが届いた場合',
              answer: '貸切予約は「リクエスト（承認待ち）」として届きます。\n① 「貸切確認」ページで、希望日時とGMの空き状況を確認\n② 問題なければ「承認」ボタンを押す。自動的に予約が確定し、スケジュールが押さえられる\n③ 都合が悪い場合は、代案を提示するか「却下」を選択',
            },
            {
              question: '直前の人数変更・キャンセル',
              answer: '電話などでキャンセル連絡を受けた場合は、管理画面から手動でステータスを「キャンセル」に変更してください。メモ欄に「電話にて受付（担当：〇〇）」と残しておくと、後で経緯が分かりやすくなります。',
            },
            {
              question: '貸切グループの削除依頼が届いた場合',
              answer: '① メール本文に記載の招待コード（例：A65EPKHY）を手元に控える\n② 管理画面の「貸切確認」ページを開く\n③ 検索欄に招待コードを入力し、該当のグループを見つける\n④ カードをクリックして詳細を開き、一番下にある「この申込を完全に削除する」（赤いリンク）をクリック\n⑤ 確認ダイアログが表示されたら「OK」を押して完了\n\n注意：削除すると、グループ・メンバー・候補日程・チャット履歴がすべて消えます。復元はできないため、お客様の意思を必ず確認してから実行してください。',
            },
            {
              question: '過去の予約を探す',
              answer: '「フィルター」機能を使って、特定のお客様名や電話番号、予約番号で検索できます。「未払い」のみを抽出して、月末の請求漏れチェックにも活用できます。',
            },
          ],
        },
      },
    ],
  },

  // ==========================================================================
  // 6. スタッフ・アカウント管理 (staff)
  // ==========================================================================
  {
    slug: 'staff',
    title: 'スタッフ・アカウント管理',
    description: 'スタッフの採用から退職、再雇用まで、アカウントのライフサイクルに応じた適切な操作方法とシステムの挙動を解説します。',
    category: 'admin',
    icon_name: 'Users',
    display_order: 60,
    blocks: [
      {
        block_type: 'section_header',
        content: { title: '基本ライフサイクル' },
      },
      {
        block_type: 'steps',
        content: {
          items: [
            {
              title: '採用・招待 (Onboarding)',
              description: '新しいスタッフを迎え入れる時。「新規スタッフ」ボタンから名前とメールアドレスを入力し、「招待する」を選択します。招待メールが届き、ログインすると「スタッフ権限」が付与された状態でスタートします。',
            },
            {
              title: '退職・削除 (Offboarding)',
              description: 'スタッフが辞める時。スタッフ一覧から「削除」を実行します。スタッフ名簿からは消えますが、アカウントは消えません。権限が「一般顧客」に戻り、管理画面には入れなくなりますが、個人的な予約履歴などは残ります。',
            },
            {
              title: '復帰・再雇用 (Re-hiring)',
              description: '辞めたスタッフが戻ってきた時。「新規スタッフ」で同じメールアドレスを入力して招待します。既存のアカウントが再利用され、権限が再び「スタッフ」に昇格します。',
            },
            {
              title: '安全装置 (Safety)',
              description: '管理者が自分のスタッフデータを削除しても、管理者権限（admin）は維持されます。システムから閉め出されることはなく、再度自分を登録し直せば元通りです。',
            },
          ],
        },
      },
      {
        block_type: 'section_header',
        content: { title: '招待メール送信後の流れ' },
      },
      {
        block_type: 'paragraph',
        content: {
          text: '「スタッフを招待」ボタンから招待を行うと、指定したメールアドレスに招待メールが送信されます。',
        },
      },
      {
        block_type: 'steps',
        content: {
          items: [
            {
              title: '招待メールを受信',
              description: 'スタッフのメールボックスに招待メールが届きます。',
              sub_note: '件名：【MMQ】スタッフアカウント招待\n既存アカウントの場合は「スタッフアカウント登録完了」というメールになります。',
            },
            {
              title: 'パスワードを設定',
              description: 'メール内のボタンをクリックすると、パスワード設定画面に移動します。新しいパスワードを2回入力して「設定」をクリック。設定完了後、自動的にログイン状態になります。',
              sub_note: '⚠️ リンクには有効期限があります。期限切れの場合は管理者に再招待を依頼してください。',
            },
            {
              title: 'スタッフとしてログイン完了',
              description: 'パスワード設定が完了すると、スタッフ権限でシステムにアクセスできます。スケジュール確認・シフト提出・GM確認・貸切確認が利用可能になります。',
            },
          ],
        },
      },
      {
        block_type: 'faq',
        content: {
          items: [
            { question: 'メールが届きません', answer: '迷惑メールフォルダを確認してください。それでも届かない場合は、管理者に再招待を依頼してください。' },
            { question: 'リンクの有効期限が切れました', answer: '管理者がスタッフ一覧から「連携」→「新規招待」で同じメールアドレスに再度招待を送ることができます。' },
            { question: 'パスワードを忘れました', answer: 'ログイン画面の「パスワードを忘れた方」からリセットできます。または管理者に再招待を依頼してください。' },
          ],
        },
      },
      {
        block_type: 'section_header',
        content: { title: '応用シナリオ' },
      },
      {
        block_type: 'faq',
        content: {
          items: [
            { question: 'スタッフがプライベートで遊びに来る場合', answer: 'スタッフアカウントのまま予約サイトから予約可能です。システムは「スタッフ」と認識しつつ「顧客」として予約を受け付けます。' },
            { question: '常連さんをスタッフとしてスカウトする場合', answer: '既に顧客アカウントを持っている方のメールアドレスで「招待」を行ってください。これまでの予約履歴やアカウント情報を引き継いだまま、スタッフ権限が付与されます。' },
            { question: '紐付けミスを修正する場合', answer: '間違ったアカウントを紐付けてしまった場合は、「連携解除」を行ってください。誤って紐付けられたユーザーは即座に「一般顧客」に戻り、その後正しいメールアドレスで再度招待を行ってください。' },
          ],
        },
      },
      {
        block_type: 'section_header',
        content: { title: 'Discord連携設定' },
      },
      {
        block_type: 'paragraph',
        content: {
          text: 'Discord通知機能を使用するには、各スタッフのDiscord IDとチャンネルIDの設定が必要です。\nこれにより、貸切予約のGM確認通知やシフトリマインダーが届くようになります。',
        },
      },
      {
        block_type: 'two_column',
        content: {
          left: {
            title: 'Discord ID',
            body: '用途：シフト未提出リマインダーでのメンション、貸切予約でGMがボタンを押した時の回答者特定\n\n取得方法：\n① Discordの設定 → 詳細設定 → 「開発者モード」をON\n② 該当ユーザーのアイコンを右クリック\n③ 「ユーザーIDをコピー」を選択\n\n例：1234567890123456789',
          },
          right: {
            title: 'Discord チャンネルID',
            body: '用途：貸切予約のGM確認通知（ボタン付き）、個人用の通知チャンネルとして使用\n\n取得方法：\n① Discordの設定 → 詳細設定 → 「開発者モード」をON\n② 通知を送りたいチャンネルを右クリック\n③ 「チャンネルIDをコピー」を選択\n\n例：9876543210987654321',
          },
        },
      },
      {
        block_type: 'table',
        content: {
          caption: 'Discord通知の種類',
          headers: ['通知タイプ', '送信先', '必要な設定'],
          rows: [
            ['貸切予約GM確認', '各GMの個人チャンネル', 'discord_channel_id'],
            ['シフト提出完了', '全体通知チャンネル', '管理者設定'],
            ['シフト未提出リマインダー', '全体通知チャンネル + メンション', 'discord_id'],
          ],
        },
      },
      {
        block_type: 'alert',
        content: {
          type: 'warning',
          title: '注意事項',
          body: '・Discord IDとチャンネルIDが設定されていないスタッフには、対応する通知が届きません。\n・貸切予約のGM確認通知を受け取るには、そのシナリオの「担当GM」として設定されている必要があります。\n・Botがチャンネルにメッセージを送信する権限を持っていることを確認してください。',
        },
      },
    ],
  },

  // ==========================================================================
  // 7. シフト・スケジュール管理 (schedule)
  // ==========================================================================
  {
    slug: 'schedule',
    title: 'シフト・スケジュール管理',
    description: '毎月のシフト提出から、公演スケジュールの作成、スタッフ配置までの流れを解説します。',
    category: 'admin',
    icon_name: 'FileText',
    display_order: 70,
    blocks: [
      {
        block_type: 'section_header',
        content: { title: '毎月の作業フロー' },
      },
      {
        block_type: 'steps',
        content: {
          items: [
            {
              title: '提出期間の設定',
              description: '「シフト提出」ページで、スタッフがシフトを入力できる期間（例：毎月1日〜10日）と、対象の月を設定します。',
              sub_note: 'ポイント：提出期限を過ぎると、スタッフは画面から入力できなくなります。変更が必要な場合は管理者が直接修正します。',
            },
            {
              title: 'スケジュール作成',
              description: '「スケジュール管理」ページで、日付セルをクリックして公演枠を作成します。または、CSVインポート機能を使って一括登録することも可能です。',
            },
            {
              title: 'スタッフ配置 (GM決定)',
              description: '作成した公演枠にGM（ゲームマスター）を割り当てます。シフト提出済みのスタッフは、空き状況がアイコンで表示されるので、スムーズに配置できます。',
            },
            {
              title: '公開',
              description: 'スケジュールが固まったら、予約サイトでの受付を開始します。（現在は作成と同時に公開される仕様です。将来的に「下書き」機能が追加される可能性があります）',
            },
          ],
        },
      },
      {
        block_type: 'section_header',
        content: { title: '便利な機能' },
      },
      {
        block_type: 'key_value',
        content: {
          title: 'GMロールの管理',
          rows: [
            { label: 'メインGM', value: '公演の進行責任者' },
            { label: 'サブGM', value: '補助スタッフ（給与計算対象）' },
            { label: 'スタッフ参加', value: '人数合わせなどで参加するスタッフ（給与対象外・予約リストに追加）' },
          ],
        },
      },
      {
        block_type: 'paragraph',
        content: {
          text: 'これらを使い分けることで、正確な給与計算と予約管理が可能になります。',
        },
      },
      {
        block_type: 'alert',
        content: {
          type: 'info',
          title: '公演の中止と復活',
          body: '急な事情で公演ができなくなった場合は「中止」に設定します。削除するのではなく「中止」ステータスにすることで、履歴を残しつつ予約受付を停止できます。状況が変われば「復活」させることも可能です。',
        },
      },
    ],
  },

  // ==========================================================================
  // 8. クーポン管理 (coupon)
  // ==========================================================================
  {
    slug: 'coupon',
    title: 'クーポン管理',
    description: 'クーポン機能を使うと、お客さまに割引クーポンを配布・管理できます。新規登録時の自動付与や手動での個別付与に対応しており、使用状況の統計確認も可能です。',
    category: 'admin',
    icon_name: 'Ticket',
    display_order: 80,
    blocks: [
      {
        block_type: 'section_header',
        content: { title: 'クーポンの仕組み' },
      },
      {
        block_type: 'two_column',
        content: {
          left: {
            title: 'キャンペーン',
            body: '「割引額」「有効期間」「付与条件」などのルールを定義したテンプレートです。まずキャンペーンを作成し、そこからお客さまへ付与します。',
          },
          right: {
            title: '顧客クーポン',
            body: 'キャンペーンをもとに各お客さまへ付与された実際のクーポンです。お客さまのマイページから確認・使用できます。',
          },
        },
      },
      {
        block_type: 'alert',
        content: {
          type: 'info',
          body: 'ページへのアクセス：ナビゲーションバーの「クーポン管理」、またはサイドメニューから開けます。',
        },
      },
      {
        block_type: 'section_header',
        content: { title: 'キャンペーンを作成する' },
      },
      {
        block_type: 'steps',
        content: {
          items: [
            {
              title: '「新規キャンペーン」ボタンをクリック',
              description: 'クーポン管理ページ右上のボタンから作成ダイアログを開きます。',
            },
            {
              title: 'キャンペーン情報を入力',
              description: '各項目を入力して「作成」ボタンを押します。',
            },
          ],
        },
      },
      {
        block_type: 'key_value',
        content: {
          title: 'キャンペーン設定項目',
          rows: [
            { label: 'キャンペーン名', value: '管理用の名前。例：「新規登録クーポン500円OFF」' },
            { label: '説明', value: 'お客さまのマイページに表示される説明文' },
            { label: '割引タイプ', value: '固定額（例：500円OFF）または割引率（例：10%OFF）' },
            { label: '割引額・割引率', value: '固定額なら「500」（円）、割引率なら「10」（%）のように入力' },
            { label: '使用回数上限', value: '1人のお客さまが何回使えるか。通常は「1」' },
            { label: '有効日数', value: '付与してから何日間有効か。空欄にすると無制限' },
            { label: '付与方法', value: '新規登録時（自動付与）または手動付与' },
            { label: '対象範囲', value: '全予約または特定シナリオのみ' },
            { label: 'キャンペーン期間', value: '開始日・終了日を設定。空欄にすると期限なし' },
          ],
        },
      },
      {
        block_type: 'alert',
        content: {
          type: 'success',
          body: '新規登録キャンペーンを設定すると、以降に登録したお客さまへ自動でクーポンが付与されます。既存のお客さまには付与されないため、手動付与で対応してください。',
        },
      },
      {
        block_type: 'section_header',
        content: { title: 'お客さまにクーポンを手動付与する' },
      },
      {
        block_type: 'steps',
        content: {
          items: [
            {
              title: 'キャンペーン一覧でメニューを開く',
              description: '付与したいキャンペーンのカード右端にある「︙」（縦三点）アイコンをクリックします。',
            },
            {
              title: '「クーポン付与」を選択',
              description: 'ドロップダウンメニューから「クーポン付与」をクリックすると、検索ダイアログが開きます。',
            },
            {
              title: 'お客さまを検索して付与',
              description: '名前・メールアドレス・電話番号で検索し、対象のお客さまを選んで「付与する」を押します。（2文字以上入力すると検索結果が表示されます）',
            },
          ],
        },
      },
      {
        block_type: 'alert',
        content: {
          type: 'warning',
          body: '同じお客さまへの重複付与はシステムで防止されています。「既にこのクーポンが付与されています」と表示された場合は、すでに付与済みです。',
        },
      },
      {
        block_type: 'section_header',
        content: { title: 'キャンペーンの有効・無効を切り替える' },
      },
      {
        block_type: 'key_value',
        content: {
          rows: [
            { label: '有効（オン）', value: '新規登録キャンペーンは新しいお客さまへ自動付与されます。既に付与済みのクーポンもお客さまが使用できます。' },
            { label: '無効（オフ）', value: '新規登録時の自動付与が停止します。ただし既に付与済みのクーポンは引き続きお客さまが使用できます。' },
          ],
        },
      },
      {
        block_type: 'section_header',
        content: { title: '使用状況（統計）を確認する' },
      },
      {
        block_type: 'steps',
        content: {
          items: [
            {
              title: '「統計を見る」を選択',
              description: 'キャンペーンカードの「︙」メニューから「統計を見る」をクリックします。付与数・使用数・未使用数・割引総額が表示されます。',
            },
          ],
        },
      },
      {
        block_type: 'section_header',
        content: { title: 'よくある質問・注意事項' },
      },
      {
        block_type: 'faq',
        content: {
          items: [
            { question: 'キャンペーンを削除できますか？', answer: '現在、キャンペーンの削除機能はありません。不要なキャンペーンは「無効」にして非表示状態にしてください。' },
            { question: '付与済みのクーポンを取り消せますか？', answer: '管理画面からのクーポン取り消しには現在対応していません。誤って付与した場合はお問い合わせください。' },
            { question: '新規登録キャンペーンは複数設定できますか？', answer: 'はい。有効な新規登録キャンペーンが複数ある場合、登録時に全てのキャンペーンのクーポンが付与されます。' },
            { question: 'お客さまがクーポンを持っているか確認できますか？', answer: '「顧客管理」ページでお客さまを検索し、詳細を開くと保有クーポンを確認できます。' },
            { question: 'クーポンの有効期限はどう決まりますか？', answer: 'キャンペーンに設定した「有効日数」（付与日から）と「キャンペーン終了日」のいずれか早い方が有効期限になります。どちらも未設定の場合は無期限です。' },
            { question: '同タイトルへの重複使用防止について', answer: '同じシナリオ（タイトル）の公演に対しては、クーポンを2回以上使用できません。異なるシナリオの公演であれば、残り回数の範囲内で使用できます。' },
          ],
        },
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// 移行実行関数
// ---------------------------------------------------------------------------

export interface SeedResult {
  success: string[]
  skipped: string[]
  errors: { slug: string; error: string }[]
}

/**
 * 既存ハードコードページを現在の組織の DB に一括登録する。
 * 既に同名 slug のページが存在する場合はスキップ。
 */
export async function runSeedLegacyPages(
  onProgress?: (msg: string) => void,
): Promise<SeedResult> {
  const result: SeedResult = { success: [], skipped: [], errors: [] }

  // 既存ページ一覧を取得してスラッグ重複チェック用に
  const existing = await manualPageApi.list()
  const existingSlugs = new Set(existing.map((p: ManualPage) => p.slug))

  for (const pageSeed of PAGES) {
    if (existingSlugs.has(pageSeed.slug)) {
      onProgress?.(`スキップ: "${pageSeed.title}"（既に存在します）`)
      result.skipped.push(pageSeed.slug)
      continue
    }

    try {
      onProgress?.(`移行中: "${pageSeed.title}"…`)
      const page = await manualPageApi.create({
        title: pageSeed.title,
        slug: pageSeed.slug,
        description: pageSeed.description,
        category: pageSeed.category,
        icon_name: pageSeed.icon_name,
        display_order: pageSeed.display_order,
      })

      await Promise.all(
        pageSeed.blocks.map((block, i) =>
          manualBlockApi.create({
            page_id: page.id,
            block_type: block.block_type,
            content: block.content as BlockContentMap[BlockType],
            display_order: i,
          })
        )
      )

      onProgress?.(`✓ "${pageSeed.title}" 完了`)
      result.success.push(pageSeed.slug)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      onProgress?.(`✗ "${pageSeed.title}" エラー: ${msg}`)
      result.errors.push({ slug: pageSeed.slug, error: msg })
    }
  }

  return result
}
