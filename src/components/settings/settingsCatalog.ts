export type SettingsScope = 'organization' | 'store' | 'scenario' | 'performance'

export const SETTINGS_SCOPES: { id: SettingsScope; label: string; description: string }[] = [
  { id: 'organization', label: '組織共通', description: '自社全体の運用ルールと予約サイト' },
  { id: 'store', label: '店舗別', description: '店舗を選んで営業時間・予約・案内を設定' },
  { id: 'scenario', label: '作品別', description: '共通の作品情報と、自社の料金・開催条件' },
  { id: 'performance', label: '公演別', description: '開催日時ごとの担当・募集・個別案内' },
]

export interface SettingsPageDefinition {
  id: string
  label: string
  scope: 'organization' | 'store'
  description: string
  effect: string
  related?: string[]
  legacy?: boolean
}

export const SETTINGS_PAGES: SettingsPageDefinition[] = [
  { id: 'organization-info', label: '組織情報', scope: 'organization', description: '組織名・連絡先・予約サイトの紹介文', effect: '自社の組織情報を変更します。他の組織の情報には反映しません。' },
  { id: 'organization-design', label: '予約サイトのデザイン', scope: 'organization', description: 'テーマ色・ヘッダー画像・アイコン', effect: '自社の予約サイトの表示に反映します。' },
  { id: 'faq', label: 'FAQ', scope: 'organization', description: '予約サイトに掲載する質問と回答', effect: '自社FAQを編集します。共通FAQの編集は権限のある管理者が行います。' },
  { id: 'blog', label: 'ブログ・お知らせ', scope: 'organization', description: '記事の内容・公開状態', effect: '公開した記事が自社の予約サイトに表示されます。' },
  { id: 'booking-notice', label: '予約時の注意事項', scope: 'organization', description: '対象店舗・予約種別を指定する案内', effect: '組織で管理し、各案内で指定した店舗・予約種別に表示します。', related: ['cancellation'] },
  { id: 'categories', label: 'カテゴリ・作者表記', scope: 'organization', description: '自社で使う作品の分類と作者表記', effect: '自社の作品分類・作者表記を管理します。共通の作品マスタとは別です。' },
  { id: 'recruitment', label: '開催判断・追加募集', scope: 'organization', description: '作品が参照する共通の人数・割合基準', effect: '「組織共通」を選んだ作品に反映します。個別指定の作品と、案内済みの条件・期限は保持します。' },
  { id: 'organization-time-slots', label: '公演の時間帯', scope: 'organization', description: '平日・休日の朝・昼・夜の標準時刻', effect: '公演作成時の標準の時間枠です。作成済み公演の日時を一括変更する操作ではありません。', related: ['performance-schedule'] },
  { id: 'shift', label: 'シフト提出', scope: 'organization', description: '提出期間・対象月・編集期限', effect: '自社スタッフのシフト提出に使用します。' },
  { id: 'salary', label: '報酬の共通基準', scope: 'organization', description: 'GM・GMテスト・受付の報酬と適用日', effect: '公演日に対応する履歴を使用します。作品別のGM報酬もあるため、個別設定と合わせて確認してください。' },
  { id: 'notifications', label: '通知・共通メッセージ', scope: 'organization', description: '通知の有効化・貸切チャットの案内・送信テスト', effect: '自社全体の通知と共通案内を変更します。店舗ごとの予約通知は別に設定します。', related: ['store-notifications', 'email'] },
  { id: 'cancellation-billing', label: 'キャンセル料の請求', scope: 'organization', description: '振込先・請求・照合の設定', effect: 'キャンセル料請求の設定です。予約時のキャンセル規定は店舗別に設定します。', related: ['cancellation'] },
  { id: 'email-logs', label: 'メール送信履歴', scope: 'organization', description: '送信結果を確認', effect: '履歴の確認画面です。メール本文の変更や再送はこの分類の変更では発生しません。', related: ['email'] },
  { id: 'system', label: 'システムの表示名', scope: 'organization', description: '自社で使用するシステム名', effect: '自社の設定です。MMQ全体の管理設定ではありません。' },
  { id: 'business-hours', label: '営業時間', scope: 'store', description: '曜日別の営業時間・休業日', effect: '選択した店舗に保存します。「全店舗に適用」は各店舗への一括保存です。共通設定の継承ではありません。' },
  { id: 'performance-schedule', label: '標準の公演時間', scope: 'store', description: '作品未選択時の標準所要時間', effect: '選択した店舗の公演を新規作成するときに使います。作成済み公演の日時は変更しません。', related: ['organization-time-slots'] },
  { id: 'reservation', label: '予約の受付', scope: 'store', description: '受付期間・支払い方法の案内', effect: '選択した店舗の予約受付設定です。作品・公演の締切も別に確認してください。既存予約の人数・金額を変更する操作ではありません。', related: ['cancellation', 'email'] },
  { id: 'cancellation', label: 'キャンセル・変更', scope: 'store', description: '通常・貸切の規定、期限、料金・返金案内', effect: '選択した店舗の規定を保存します。「全店舗へ一括設定」を選ぶと全店舗へ保存します。保存済み予約の条件や請求を一括変更する操作ではありません。', related: ['cancellation-billing', 'booking-notice'] },
  { id: 'email', label: 'メール・リマインド', scope: 'store', description: '差出人情報・文面・リマインド日程', effect: '予約確定・貸切確定の文面は、公演の個別文面 → 作品の文面 → 店舗の文面 → 標準文面の順です。送信済みメールは変更しません。', related: ['notifications', 'email-logs'] },
  { id: 'store-notifications', label: '店舗の予約通知', scope: 'store', description: '新規予約・キャンセルの通知とWebhook', effect: '選択した店舗の通知設定です。組織全体の通知スイッチは組織共通で設定します。', related: ['notifications'] },
  { id: 'data', label: 'データ出力', scope: 'store', description: '出力形式の保存とデータの書き出し', effect: '出力形式は選択した店舗に保存します。書き出すデータの範囲は各出力処理の説明を確認してください。' },
  { id: 'pricing', label: '料金設定（既存）', scope: 'store', description: '既存の基本料金・割引設定', effect: 'この画面の設定と予約料金の連動は確認が必要です。実際に販売する料金は作品・公演の料金を確認してください。', legacy: true },
  { id: 'sales-report', label: '売上レポート設定（既存）', scope: 'store', description: '締め日・報告先・出力形式', effect: '自動送信は設定だけで稼働を保証するものではありません。配信処理と送信履歴を別途確認してください。', legacy: true },
]

export function getSettingsPage(tab: string) {
  return SETTINGS_PAGES.find(page => page.id === tab)
}

export function settingsPath(slug: string, tab = 'overview', storeId?: string) {
  const query = new URLSearchParams({ tab })
  if (storeId) query.set('store', storeId)
  return `/${encodeURIComponent(slug)}/settings?${query}`
}

export function resolveSettingsStore(stores: { id: string }[], requested: string | null, allowAll: boolean) {
  if (requested === 'all' && allowAll) return 'all'
  if (requested && requested !== 'all') return stores.some(store => store.id === requested) ? requested : ''
  return stores[0]?.id ?? ''
}
