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
  store_ids: string[] | null
  requires_pre_reading: boolean
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
          .select('id, content, applicable_types, store_id, store_ids, requires_pre_reading')
          .eq('is_active', true)
          .contains('applicable_types', [categoryType])
          .order('sort_order', { ascending: true })

        if (error) throw error

        // フィルタリング
        const filtered = (data || []).filter(notice => {
          // 店舗フィルタ（store_ids優先、後方互換でstore_idも対応）
          const storeIds = notice.store_ids?.length > 0 ? notice.store_ids : (notice.store_id ? [notice.store_id] : [])
          const storeMatch = storeIds.length === 0 || (storeId && storeIds.includes(storeId))
          
          // 事前読み込み条件（requires_pre_readingがtrueの場合、hasPreReadingがtrueでないと表示しない）
          const preReadingMatch = !notice.requires_pre_reading || hasPreReading === true
          
          return storeMatch && preReadingMatch
        })

        setNotices(filtered)
      } catch (error) {
        logger.error('注意事項の取得に失敗:', error)
        setNotices([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchNotices()
  }, [mode, storeId, hasPreReading])

  if (isLoading) {
    return (
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">
          注意事項
          <span className="text-red-500 ml-2">※必ずご確認ください</span>
        </h3>
        <Card>
          <CardContent className="p-3 flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    )
  }

  // 注意事項がない場合は表示しない
  if (notices.length === 0) {
    return null
  }

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">
        注意事項
        <span className="text-red-500 ml-2">※必ずご確認ください</span>
      </h3>
      <Card>
        <CardContent className="p-3">
          <ul className="space-y-1 text-xs text-muted-foreground">
            {notices.map((notice) => (
              <li key={notice.id}>• {notice.content}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
})

