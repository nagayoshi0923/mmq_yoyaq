import { Users, Copy, Check } from 'lucide-react'
import { useState } from 'react'

interface CustomerInfoProps {
  request: {
    customer_name: string
    customer_email?: string
    customer_phone?: string
    participant_count: number
    invite_code?: string
  }
}

/**
 * 顧客情報表示コンポーネント
 */
export const CustomerInfo = ({ request }: CustomerInfoProps) => {
  const [copied, setCopied] = useState(false)

  const handleCopyInviteCode = async () => {
    if (!request.invite_code) return
    try {
      await navigator.clipboard.writeText(request.invite_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('コピーに失敗しました:', err)
    }
  }

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-purple-800">
        <Users className="w-4 h-4" />
        顧客情報
      </h3>
      <div className="space-y-2 text-sm p-3 bg-background rounded-lg border">
        <div className="flex items-center gap-2">
          <span className="min-w-[80px]">お名前:</span>
          <span>{request.customer_name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="min-w-[80px]">メール:</span>
          <span>{request.customer_email || '未登録'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="min-w-[80px]">電話番号:</span>
          <span>{request.customer_phone || '未登録'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="min-w-[80px]">参加人数:</span>
          <span>{request.participant_count}名</span>
        </div>
        {request.invite_code && (
          <div className="flex items-center gap-2">
            <span className="min-w-[80px]">招待コード:</span>
            <span className="font-mono bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
              {request.invite_code}
            </span>
            <button
              onClick={handleCopyInviteCode}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
              title="コピー"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-600" />
              ) : (
                <Copy className="w-4 h-4 text-gray-500" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

