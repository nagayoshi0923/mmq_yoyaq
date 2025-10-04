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
  let textColor: string
  
  if (avatarColor) {
    // カスタム色が設定されている場合
    bgColor = avatarColor
    // 明るい背景色なので濃いめのテキスト色を使用
    textColor = 'text-gray-700'
  } else {
    // カスタム色がない場合は名前から自動選択
    const colorIndex = getColorIndexFromName(name)
    bgColor = defaultColors[colorIndex]
    textColor = textColors[colorIndex]
  }
  
  return (
    <Avatar className={`${sizeClasses[size]} ${className || ''}`}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
      <AvatarFallback 
        style={{ backgroundColor: bgColor }}
        className={`${textColor} font-semibold !bg-transparent`}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}

