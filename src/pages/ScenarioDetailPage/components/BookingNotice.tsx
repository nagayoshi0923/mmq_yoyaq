import { memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'

interface BookingNoticeProps {
  reservationDeadlineHours: number
  hasPreReading: boolean
}

export const BookingNotice = memo(function BookingNotice({
  reservationDeadlineHours,
  hasPreReading
}: BookingNoticeProps) {
  return (
    <div>
      <h3 className="font-bold mb-3 sm:mb-4 text-lg sm:text-xl">注意事項</h3>
      <Card>
        <CardContent className="p-3 sm:p-4 md:p-5">
          <ul className="space-y-2 sm:space-y-2.5 text-base text-muted-foreground">
            <li>• 予約は公演開始の{reservationDeadlineHours}時間前まで可能です</li>
            <li>• キャンセルは公演開始の24時間前まで無料で可能です</li>
            <li>• 遅刻された場合、入場をお断りする場合がございます</li>
            {hasPreReading && (
              <li>• 事前読解が必要なシナリオです。予約確定後に資料をお送りします</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
})

