import { memo, useState, useEffect } from 'react'
import { logger } from '@/utils/logger'
import { Card, CardContent } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { Loader2 } from 'lucide-react'

export interface BookingNoticeProps {
  reservationDeadlineHours?: number
  hasPreReading?: boolean
  mode?: 'schedule' | 'private'
  storeId?: string | null
}

interface Notice {
  id: string
  content: string
  applicable_types: string[]
  store_id: string | null
}

export const BookingNotice = memo(function BookingNotice({
  reservationDeadlineHours,
  hasPreReading,
  mode = 'schedule',
  storeId = null
}: BookingNoticeProps) {
  const [notices, setNotices] = useState<Notice[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // DBから注意事項を取得
  useEffect(() => {
    const fetchNotices = async () => {
      try {
        // modeをDBのcategory名にマッピング
        const categoryType = mode === 'schedule' ? 'open' : 'private'

        const { data, error } = await supabase
          .from('booking_notices')
          .select('id, content, applicable_types, store_id')
          .eq('is_active', true)
          .contains('applicable_types', [categoryType])
          .order('sort_order', { ascending: true })

        if (error) throw error

        // 店舗フィルタリング（全店舗共通 OR 指定店舗）
        const filtered = (data || []).filter(notice => 
          notice.store_id === null || notice.store_id === storeId
        )

        setNotices(filtered)
      } catch (error) {
        logger.error('注意事項の取得に失敗:', error)
        setNotices([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchNotices()
  }, [mode, storeId])

  if (isLoading) {
    return (
      <div>
        <h3 className="mb-3 md:mb-4 text-base md:text-lg font-semibold">
          注意事項
          <span className="text-xs font-normal text-red-500 ml-2">※必ずご確認ください</span>
        </h3>
        <Card>
          <CardContent className="p-3 md:p-4 flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    )
  }

  // 注意事項がない場合は表示しない
  if (notices.length === 0 && !hasPreReading) {
    return null
  }

  return (
    <div>
      <h3 className="mb-3 md:mb-4 text-base md:text-lg font-semibold">
        注意事項
        <span className="text-xs font-normal text-red-500 ml-2">※必ずご確認ください</span>
      </h3>
      <Card>
        <CardContent className="p-3 md:p-4">
          <ul className="space-y-1.5 text-xs md:text-sm text-muted-foreground">
            {notices.map((notice) => (
              <li key={notice.id}>• {notice.content}</li>
            ))}
            {hasPreReading && mode === 'schedule' && (
              <li>• 事前読解が必要なシナリオです。予約確定後に資料をお送りします</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
})

