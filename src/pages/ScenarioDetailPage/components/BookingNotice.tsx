import { memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'

interface BookingNoticeProps {
  reservationDeadlineHours: number
  hasPreReading: boolean
  mode?: 'schedule' | 'private'
}

export const BookingNotice = memo(function BookingNotice({
  reservationDeadlineHours,
  hasPreReading,
  mode = 'schedule'
}: BookingNoticeProps) {
  
  // オープン公演の注意事項
  const openNotices = [
    '開催時間の10分前に会場へお越しください',
    '飲食物の持ち込みは飲み物や軽食程度なら可能です',
    'イベントの途中抜け・途中退出は不可となります',
    '当シナリオ未プレイの方のみ参加可能です',
    '公演時間は目安です。スケジュールが前後する場合がございます',
    'キャンセルは2日前までにお願いします',
    '前日キャンセル：50%、当日キャンセル：100%のキャンセル料が発生します',
    '当日キャンセルで公演不成立の場合、参加者全員分の料金をご負担いただきます',
  ]

  // 貸切公演の注意事項
  const privateNotices = [
    '予約サイトの表記時間は【予約枠】の時間です。実際の開始時間は予約承認メールをご確認ください',
    'お支払いは現金、クレジットカード、交通系IC、iD、QUICPay、QRコード決済に対応',
    '体験済の見学者をお呼びする場合は事前にご相談ください（見学料1,500円）',
    '入店可能時間は開催時間の10分前です',
    'お着替えが必要な場合、更衣可能場所（お手洗い）は1か所のみです',
    '当会場はエレベーターがございません',
    'スリッパにお履き替えいただきます',
    'ゴミは各自お持ち帰りください',
    '廊下は声が響きやすいため、私語はお控えください',
    'スタッフ研修目的の見学が入る場合がございます',
    '飲み物や軽食程度の持ち込みは可能です（匂いの強いものはNG）',
    'イベントの途中抜け・途中退出は不可となります',
    '公演時間は目安です。スケジュールが前後する場合がございます',
    'キャンセル料：7日前50%、3日前以降100%',
    'キャンセルはサイトから行えません。お問い合わせ・メール・Twitter DMにてご連絡ください',
    '当日キャンセルで公演不成立の場合、参加者全員分の料金をご負担いただきます',
  ]

  const notices = mode === 'private' ? privateNotices : openNotices

  return (
    <div>
      <h3 className="mb-3 md:mb-4 text-base md:text-lg font-semibold">
        注意事項
        <span className="text-xs font-normal text-red-500 ml-2">※必ずご確認ください</span>
      </h3>
      <Card>
        <CardContent className="p-3 md:p-4">
          <ul className="space-y-1.5 text-xs md:text-sm text-muted-foreground">
            {notices.map((notice, index) => (
              <li key={index}>• {notice}</li>
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

