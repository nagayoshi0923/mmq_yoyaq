import { Users } from 'lucide-react'

interface CustomerInfoProps {
  customerName: string
  customerEmail: string
  customerPhone: string
  participantCount: number
}

/**
 * 顧客情報表示コンポーネント
 */
export const CustomerInfo = ({ 
  customerName, 
  customerEmail, 
  customerPhone, 
  participantCount 
}: CustomerInfoProps) => {
  return (
    <div>
      <h3 className="font-semibold mb-3 flex items-center gap-2 text-purple-800">
        <Users className="w-4 h-4" />
        顧客情報
      </h3>
      <div className="space-y-2 text-sm p-4 bg-background rounded-lg border">
        <div className="flex items-center gap-2">
          <span className="font-medium min-w-[80px]">お名前:</span>
          <span>{customerName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium min-w-[80px]">メール:</span>
          <span>{customerEmail || '未登録'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium min-w-[80px]">電話番号:</span>
          <span>{customerPhone || '未登録'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium min-w-[80px]">参加人数:</span>
          <span>{participantCount}名</span>
        </div>
      </div>
    </div>
  )
}

