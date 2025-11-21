import { Users } from 'lucide-react'

interface CustomerInfoProps {
  request: {
    customer_name: string
    customer_email?: string
    customer_phone?: string
    participant_count: number
  }
}

/**
 * 顧客情報表示コンポーネント
 */
export const CustomerInfo = ({ request }: CustomerInfoProps) => {
  return (
    <div>
      <h3 className="font-semibold mb-2 sm:mb-3 flex items-center gap-1.5 sm:gap-2 text-purple-800 text-sm sm:text-base">
        <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
        顧客情報
      </h3>
      <div className="space-y-2 text-xs sm:text-sm p-3 sm:p-4 bg-background rounded-lg border">
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
          <span className="font-medium min-w-[80px] sm:min-w-[80px]">お名前:</span>
          <span className="break-words">{request.customer_name}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
          <span className="font-medium min-w-[80px] sm:min-w-[80px]">メール:</span>
          <span className="break-all">{request.customer_email || '未登録'}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
          <span className="font-medium min-w-[80px] sm:min-w-[80px]">電話番号:</span>
          <span className="break-words">{request.customer_phone || '未登録'}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
          <span className="font-medium min-w-[80px] sm:min-w-[80px]">参加人数:</span>
          <span>{request.participant_count}名</span>
        </div>
      </div>
    </div>
  )
}

