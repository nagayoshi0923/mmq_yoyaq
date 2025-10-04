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

// デフォルトカラーパレット
const defaultColors = [
  '#3B82F6', // blue-500
  '#10B981', // green-500
  '#F59E0B', // amber-500
  '#EF4444', // red-500
  '#8B5CF6', // violet-500
  '#EC4899', // pink-500
  '#06B6D4', // cyan-500
  '#84CC16', // lime-500
]

// 名前からカラーを決定
const getColorFromName = (name: string): string => {
  if (!name) return defaultColors[0]
  
  // 名前の文字コードの合計を計算
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  
  // ハッシュ値をカラーパレットのインデックスに変換
  return defaultColors[hash % defaultColors.length]
}

export function StaffAvatar({ 
  name, 
  avatarUrl, 
  avatarColor, 
  size = 'md',
  className 
}: StaffAvatarProps) {
  const initials = getInitials(name)
  const bgColor = avatarColor || getColorFromName(name)
  
  return (
    <Avatar className={`${sizeClasses[size]} ${className || ''}`}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
      <AvatarFallback 
        style={{ backgroundColor: bgColor }}
        className="text-white font-semibold"
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}

