import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

interface StaffAvatarProps {
  name: string
  avatarUrl?: string | null
  avatarColor?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizeClasses = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg'
}

// 名前から2文字を抽出（日本語対応）
const getInitials = (name: string): string => {
  if (!name) return '??'
  
  // 空白で分割
  const parts = name.trim().split(/\s+/)
  
  if (parts.length >= 2) {
    // 名前が2つ以上の部分に分かれている場合、各部分の最初の1文字を取得
    return parts.slice(0, 2).map(part => part.charAt(0)).join('')
  } else {
    // 名前が1つの場合、最初の2文字を取得
    return name.slice(0, 2)
  }
}

// 淡い8色パレット（背景色用）
const defaultColors = [
  '#EFF6FF', // blue-50 - 薄青
  '#F0FDF4', // green-50 - 薄緑
  '#FFFBEB', // amber-50 - 薄黄
  '#FEF2F2', // red-50 - 薄赤
  '#F5F3FF', // violet-50 - 薄紫
  '#FDF2F8', // pink-50 - 薄ピンク
  '#ECFEFF', // cyan-50 - 薄シアン
  '#F7FEE7', // lime-50 - 薄ライム
]

// 各背景色に対応する文字色
const textColors = [
  'text-blue-600',   // blue用
  'text-green-600',  // green用
  'text-amber-600',  // amber用
  'text-red-600',    // red用
  'text-violet-600', // violet用
  'text-pink-600',   // pink用
  'text-cyan-600',   // cyan用
  'text-lime-600',   // lime用
]

// 名前からカラーインデックスを決定
const getColorIndexFromName = (name: string): number => {
  if (!name) return 0
  
  // 名前の文字コードの合計を計算
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  
  // ハッシュ値をカラーパレットのインデックスに変換
  return hash % defaultColors.length
}

export function StaffAvatar({ 
  name, 
  avatarUrl, 
  avatarColor, 
  size = 'md',
  className 
}: StaffAvatarProps) {
  const initials = getInitials(name)
  
  // avatarColorが設定されていればそれを使用、なければ名前から自動選択
  let bgColor: string
  let textColorClass: string
  let textColorHex: string
  
  if (avatarColor) {
    // カスタム色が設定されている場合
    bgColor = avatarColor
    // 各背景色に対応する文字色を設定
    const colorMap: Record<string, string> = {
      '#EFF6FF': '#2563EB', // blue
      '#F0FDF4': '#16A34A', // green
      '#FFFBEB': '#D97706', // amber
      '#FEF2F2': '#DC2626', // red
      '#F5F3FF': '#7C3AED', // violet
      '#FDF2F8': '#DB2777', // pink
      '#ECFEFF': '#0891B2', // cyan
      '#F7FEE7': '#65A30D', // lime
    }
    textColorHex = colorMap[avatarColor] || '#374151' // デフォルトはgray-700
    textColorClass = ''
  } else {
    // カスタム色がない場合は名前から自動選択
    const colorIndex = getColorIndexFromName(name)
    bgColor = defaultColors[colorIndex]
    textColorClass = textColors[colorIndex]
    textColorHex = ''
  }
  
  return (
    <Avatar className={`${sizeClasses[size]} ${className || ''}`}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
      <AvatarFallback 
        style={{ 
          backgroundColor: bgColor,
          ...(textColorHex ? { color: textColorHex } : {})
        }}
        className={`${textColorClass} font-semibold`}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}

