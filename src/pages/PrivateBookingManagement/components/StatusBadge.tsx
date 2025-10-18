import { Badge } from '@/components/ui/badge'

interface StatusBadgeProps {
  status: string
}

/**
 * 貸切予約ステータスバッジ
 */
export const StatusBadge = ({ status }: StatusBadgeProps) => {
  switch (status) {
    case 'pending':
    case 'pending_gm':
      return (
        <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">
          GM確認待ち
        </Badge>
      )
    case 'gm_confirmed':
    case 'pending_store':
      return (
        <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-200">
          店舗確認待ち
        </Badge>
      )
    case 'confirmed':
      return (
        <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
          承認済み
        </Badge>
      )
    case 'cancelled':
      return (
        <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">
          却下
        </Badge>
      )
    default:
      return null
  }
}

