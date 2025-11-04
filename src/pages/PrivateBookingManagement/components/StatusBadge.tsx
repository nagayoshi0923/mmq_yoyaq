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
        <Badge variant="secondary" className="bg-gray-100 text-gray-800 border-0 rounded-[2px] font-normal">
          GM確認待ち
        </Badge>
      )
    case 'gm_confirmed':
    case 'pending_store':
      return (
        <Badge variant="secondary" className="bg-gray-100 text-gray-800 border-0 rounded-[2px] font-normal">
          店舗確認待ち
        </Badge>
      )
    case 'confirmed':
      return (
        <Badge variant="secondary" className="bg-gray-100 text-gray-800 border-0 rounded-[2px] font-normal">
          承認済み
        </Badge>
      )
    case 'cancelled':
      return (
        <Badge variant="secondary" className="bg-gray-100 text-gray-800 border-0 rounded-[2px] font-normal">
          却下
        </Badge>
      )
    default:
      return null
  }
}

