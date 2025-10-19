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
      <h3 className="font-semibold mb-3 flex items-center gap-2 text-purple-800">
        <Users className="w-4 h-4" />
        顧客情報
      </h3>
      <div className="space-y-2 text-sm p-4 bg-background rounded-lg border">
        <div className="flex items-center gap-2">
          <span className="font-medium min-w-[80px]">お名前:</span>
          <span>{request.customer_name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium min-w-[80px]">メール:</span>
          <span>{request.customer_email || '未登録'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium min-w-[80px]">電話番号:</span>
          <span>{request.customer_phone || '未登録'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium min-w-[80px]">参加人数:</span>
          <span>{request.participant_count}名</span>
        </div>
      </div>
    </div>
  )
}

