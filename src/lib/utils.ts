import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 店舗識別色の取得（店舗ID用）
export function getStoreColors(storeId: string) {
  const storeColorMap = {
    'takadanobaba': {
      bg: 'bg-blue-50 border-blue-200',
      badge: 'bg-blue-100 text-blue-800',
      accent: 'text-blue-600',
      dot: 'bg-blue-500'
    },
    'bekkan1': {
      bg: 'bg-green-50 border-green-200',
      badge: 'bg-green-100 text-green-800',
      accent: 'text-green-600',
      dot: 'bg-green-500'
    },
    'bekkan2': {
      bg: 'bg-purple-50 border-purple-200',
      badge: 'bg-purple-100 text-purple-800',
      accent: 'text-purple-600',
      dot: 'bg-purple-500'
    },
    'okubo': {
      bg: 'bg-orange-50 border-orange-200',
      badge: 'bg-orange-100 text-orange-800',
      accent: 'text-orange-600',
      dot: 'bg-orange-500'
    },
    'otsuka': {
      bg: 'bg-red-50 border-red-200',
      badge: 'bg-red-100 text-red-800',
      accent: 'text-red-600',
      dot: 'bg-red-500'
    },
    'omiya': {
      bg: 'bg-amber-50 border-amber-200',
      badge: 'bg-amber-100 text-amber-800',
      accent: 'text-amber-600',
      dot: 'bg-amber-500'
    }
  }
  
  return storeColorMap[storeId as keyof typeof storeColorMap] || storeColorMap.takadanobaba
}

// 色名から色コードを取得
export function getColorFromName(colorName: string): string {
  const colorMap: Record<string, string> = {
    'blue': '#3B82F6',
    'green': '#10B981',
    'purple': '#8B5CF6',
    'orange': '#F97316',
    'red': '#EF4444',
    'amber': '#F59E0B'
  }
  
  return colorMap[colorName] || '#6B7280'
}

// 公演カテゴリ色の取得
export function getCategoryColors(category: string) {
  const categoryColorMap = {
    'open': {
      badge: 'bg-blue-100 text-blue-800',
      card: 'bg-blue-50 border-blue-200 text-blue-800',
      accent: 'border-blue-300'
    },
    'private': {
      badge: 'bg-purple-100 text-purple-800',
      card: 'bg-purple-50 border-purple-200 text-purple-800',
      accent: 'border-purple-300'
    },
    'gmtest': {
      badge: 'bg-orange-100 text-orange-800',
      card: 'bg-orange-50 border-orange-200 text-orange-800',
      accent: 'border-orange-300'
    },
    'testplay': {
      badge: 'bg-yellow-100 text-yellow-800',
      card: 'bg-yellow-50 border-yellow-200 text-yellow-800',
      accent: 'border-yellow-300'
    },
    'offsite': {
      badge: 'bg-green-100 text-green-800',
      card: 'bg-green-50 border-green-200 text-green-800',
      accent: 'border-green-300'
    },
    'mtg': {
      badge: 'bg-cyan-100 text-cyan-800',
      card: 'bg-cyan-50 border-cyan-200 text-cyan-800',
      accent: 'border-cyan-300'
    }
  }
  
  return categoryColorMap[category as keyof typeof categoryColorMap] || categoryColorMap.open
}

// 日付フォーマット
export function formatDate(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

// 時間フォーマット
export function formatTime(time: string): string {
  return time.slice(0, 5) // HH:MM形式に変換
}

// 店舗名の取得
export function getStoreName(storeId: string): string {
  const storeNames = {
    'takadanobaba': '高田馬場店',
    'bekkan1': '別館①',
    'bekkan2': '別館②',
    'okubo': '大久保店',
    'otsuka': '大塚店',
    'omiya': '埼玉大宮店'
  }
  
  return storeNames[storeId as keyof typeof storeNames] || storeId
}

// ──────────────────────────────────────────────
// セキュリティ: URL検証ユーティリティ
// ──────────────────────────────────────────────

/**
 * リダイレクト先URLを検証し、安全な値を返す。
 * オープンリダイレクト攻撃を防止するため、以下を拒否する:
 * - 外部URL（http://evil.com）
 * - プロトコル相対URL（//evil.com）
 * - javascript: / data: 等のスキーム
 * - 空文字や null
 */
export function validateRedirectUrl(url: string | null | undefined, defaultUrl = '/'): string {
  if (!url || typeof url !== 'string') return defaultUrl
  const trimmed = url.trim()
  if (!trimmed) return defaultUrl
  // 相対パス（/で始まる）のみ許可
  if (!trimmed.startsWith('/')) return defaultUrl
  // プロトコル相対URL（//）を拒否
  if (trimmed.startsWith('//')) return defaultUrl
  // コロンを含むパスを拒否（javascript:, data: 等を防止）
  if (trimmed.includes(':')) return defaultUrl
  return trimmed
}

/**
 * 外部URLが安全か検証する（http/https のみ許可）。
 * DB由来のURL等を window.open / href に渡す前に使用する。
 */
export function isValidExternalUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

// カテゴリ名の取得
export function getCategoryName(category: string): string {
  const categoryNames = {
    'open': 'オープン公演',
    'private': '貸切公演',
    'gmtest': 'GMテスト',
    'testplay': 'テストプレイ',
    'offsite': '出張公演'
  }
  
  return categoryNames[category as keyof typeof categoryNames] || category
}
