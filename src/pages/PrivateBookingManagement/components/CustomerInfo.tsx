import { Users, Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  formatPrivateBookingParticipantLabel,
  formatScenarioPlayerRange,
  isPlannedCountOutsideScenarioRange
} from '../utils/bookingFormatters'

interface CustomerInfoProps {
  request: {
    customer_name: string
    customer_email?: string
    customer_phone?: string
    participant_count: number
    joined_member_count?: number
    scenario_player_count_range?: { min: number; max: number } | null
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
        <div className="flex items-start gap-2">
          <span className="min-w-[80px] shrink-0">参加人数:</span>
          <span className="text-muted-foreground">
            {formatPrivateBookingParticipantLabel(
              request.participant_count,
              request.joined_member_count
            )}
          </span>
        </div>
        {request.scenario_player_count_range &&
          isPlannedCountOutsideScenarioRange(
            request.participant_count,
            request.scenario_player_count_range
          ) && (
            <Alert variant="default" className="border-amber-400 bg-amber-50 py-2 text-amber-950">
              <AlertTitle className="text-xs font-semibold text-amber-900">
                参加予定がシナリオの人数帯外です
              </AlertTitle>
              <AlertDescription className="text-xs text-amber-900/90">
                予定 <strong>{request.participant_count}名</strong> / 作品の推奨{' '}
                <strong>{formatScenarioPlayerRange(request.scenario_player_count_range)}</strong>
              </AlertDescription>
            </Alert>
          )}
        {request.joined_member_count !== undefined &&
          request.joined_member_count < request.participant_count && (
            <p className="text-xs text-muted-foreground pl-[88px] -mt-1">
              予定人数に対してアプリ上の参加登録が少ない場合があります（未招待・未参加のメンバーがいる可能性）。
            </p>
          )}
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

