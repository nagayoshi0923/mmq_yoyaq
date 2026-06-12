import { Badge } from '@/components/ui/badge'

interface StatusBadgeProps {
  status: string
  /** 一度確定（承認）された後のキャンセルか（承認者の有無で判定） */
  wasConfirmed?: boolean
}

/**
 * 貸切予約ステータスバッジ
 */
export const StatusBadge = ({ status, wasConfirmed }: StatusBadgeProps) => {
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
      // 一度承認された申込のキャンセル（公演削除等）と、承認前の却下を区別する
      return (
        <Badge variant="secondary" className="bg-gray-100 text-gray-800 border-0 rounded-[2px] font-normal">
          {wasConfirmed ? '確定後キャンセル' : '却下'}
        </Badge>
      )
    default:
      return null
  }
}

