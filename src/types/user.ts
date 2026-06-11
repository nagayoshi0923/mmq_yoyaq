export interface User {
  id: string
  email: string
  role: 'admin' | 'staff' | 'customer' | 'license_admin'
  created_at: string
  updated_at: string
}

// 店舗識別色の型定義
export type StoreColorTheme = {
  bg: string
  badge: string
  accent: string
  dot: string
}

// 公演カテゴリ色の型定義
export type CategoryColorTheme = {
  badge: string
  card: string
  accent: string
}

// 売上データの型定義
