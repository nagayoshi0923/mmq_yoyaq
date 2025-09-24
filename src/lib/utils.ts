import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 店舗識別色の取得
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
