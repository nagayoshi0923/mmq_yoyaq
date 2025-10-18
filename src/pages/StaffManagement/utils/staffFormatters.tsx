import { Badge } from '@/components/ui/badge'

/**
 * スタッフ管理 - フォーマット関数
 */

/**
 * ステータスバッジを取得
 */
export function getStatusBadge(status: string) {
  switch (status) {
    case 'active':
      return <Badge size="sm" className="bg-green-100 text-green-800 font-normal text-xs">在籍中</Badge>
    case 'inactive':
      return <Badge size="sm" className="bg-gray-100 text-gray-800 font-normal text-xs">休職中</Badge>
    case 'on_leave':
      return <Badge size="sm" className="bg-yellow-100 text-yellow-800 font-normal text-xs">休暇中</Badge>
    case 'resigned':
      return <Badge size="sm" className="bg-red-100 text-red-800 font-normal text-xs">退職</Badge>
    default:
      return <Badge size="sm" className="bg-gray-100 text-gray-800 font-normal text-xs">{status}</Badge>
  }
}

/**
 * 役割バッジを取得
 */
export function getRoleBadges(roles: string[]) {
  const roleNames: Record<string, string> = {
    'gm': 'GM',
    'manager': 'マネージャー',
    'staff': 'スタッフ',
    'trainee': '研修生',
    'admin': '管理者'
  }

  return roles.map((role, index) => (
    <Badge key={index} size="sm" className="font-normal text-xs px-1 py-0.5 bg-gray-100 text-gray-800">
      {roleNames[role] || role}
    </Badge>
  ))
}

/**
 * 店舗カラーを取得
 */
export function getStoreColors(storeName: string): string {
  const storeColorMap: Record<string, string> = {
    '高田馬場店': 'bg-blue-100 text-blue-800',
    '別館①': 'bg-green-100 text-green-800',
    '別館②': 'bg-purple-100 text-purple-800',
    '大久保店': 'bg-orange-100 text-orange-800',
    '大塚店': 'bg-red-100 text-red-800',
    '埼玉大宮店': 'bg-amber-100 text-amber-800'
  }
  return storeColorMap[storeName] || 'bg-gray-100 text-gray-800'
}

