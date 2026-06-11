export interface StoreFixedCost {
  item: string
  amount: number
  frequency?: 'monthly' | 'yearly' | 'one-time'
  notes?: string
  startDate?: string  // 毎月/毎年の開始時期、または一過性の発生月
  endDate?: string    // 毎月/毎年の終了時期（オプション）
  status?: 'active' | 'legacy'  // アクティブまたは過去の設定
  usageCount?: number  // 使用回数
}

// 店舗関連の型定義
export interface Store {
  id: string
  organization_id?: string  // マルチテナント対応（移行期間中はオプショナル）
  name: string
  short_name: string
  address: string
  access_info?: string
  phone_number: string
  email: string
  opening_date: string
  manager_name: string
  status: 'active' | 'temporarily_closed' | 'closed'
  ownership_type?: 'corporate' | 'franchise' | 'office'  // 直営店 or フランチャイズ or オフィス
  franchise_fee?: number  // フランチャイズ登録手数料（円）
  capacity: number
  rooms: number
  notes?: string
  color: string
  fixed_costs?: StoreFixedCost[]
  venue_cost_per_performance?: number  // 1公演あたりの会場費（家賃按分）
  is_temporary?: boolean  // 臨時会場フラグ
  temporary_date?: string  // 【非推奨】temporary_dates を使用してください
  temporary_dates?: string[]  // 臨時会場が使用される日付の配列（例: ["2025-11-01", "2025-11-05"]）
  temporary_venue_names?: Record<string, string>  // 日付ごとのカスタム会場名（例: {"2025-11-01": "スペースマーケット渋谷"}）
  display_order?: number  // 表示順序（設定画面で変更可能）
  region?: string  // 地域（例: "東京", "県外"）- 店舗選択でグループ分け表示に使用
  transport_allowance?: number  // 交通費（担当店舗以外のスタッフが出勤した場合に加算される金額）
  kit_group_id?: string | null  // キットグループの親店舗ID（同じ値を持つ店舗はキット移動計算で同一拠点として扱う）
  kit_fixed?: boolean  // true の場合、この店舗からキットを移動しない（拠点固定）
  created_at: string
  updated_at: string
}

// 「臨時会場」用途で必要な最小フィールド
// （stores テーブルの全カラムをselectしない画面向け）
export type TemporaryVenue = Pick<
  Store,
  | 'id'
  | 'name'
  | 'short_name'
  | 'is_temporary'
  | 'temporary_dates'
  | 'temporary_venue_names'
  | 'display_order'
>

// スタッフ関連の型定義
