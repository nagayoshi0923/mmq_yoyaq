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
      // @ts-ignore
      return <Badge size="sm" variant="success">在籍中</Badge>
    case 'inactive':
      // @ts-ignore
      return <Badge size="sm" variant="warning">休職中</Badge>
    case 'on_leave':
      // @ts-ignore
      return <Badge size="sm" variant="warning">休暇中</Badge>
    case 'resigned':
      // @ts-ignore
      return <Badge size="sm" variant="gray">退職</Badge>
    default:
      return <Badge size="sm" variant="outline">{status}</Badge>
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
    // @ts-ignore
    <Badge key={index} size="sm" variant="gray" className="font-normal">
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
