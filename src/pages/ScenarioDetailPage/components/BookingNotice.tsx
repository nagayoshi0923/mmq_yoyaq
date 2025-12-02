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
  
  // 共通の注意事項
  const commonNotices = [
    '入店可能時間は開演時間の10分前です',
    '飲み物や軽食程度の持ち込みは可能です（匂いの強いものはご遠慮ください）',
    'イベントの途中抜け・途中退出はできません',
    '公演時間は目安です。多少前後する場合がございます',
    '当日キャンセルで公演不成立となった場合、参加者全員分の料金をご負担いただきます',
  ]

  // オープン公演のみの注意事項
  const openOnlyNotices = [
    '当シナリオ未プレイの方のみ参加可能です',
    'キャンセルは2日前までにお願いします',
    'キャンセル料：前日50%、当日100%',
  ]

  // 貸切公演のみの注意事項
  const privateOnlyNotices = [
    '予約サイトの表記時間は【予約枠】の時間です。実際の開始時間は承認メールをご確認ください',
    'お支払いは現金、クレジットカード、交通系IC、iD、QUICPay、QRコード決済に対応しています',
    '体験済の見学者をお呼びする場合は事前にご相談ください（見学料1,500円）',
    'お着替えが必要な場合、更衣室（お手洗い）は1か所のみです。開演時間に遅れないようご注意ください',
    '当会場はエレベーターがございません',
    'スリッパにお履き替えいただきます',
    'ゴミは各自お持ち帰りください',
    '廊下は声が響きやすいため、私語はお控えください',
    'スタッフ研修目的の見学が入る場合がございます',
    'キャンセル料：7日前50%、3日前以降100%',
    'キャンセルはサイトから行えません。お問い合わせ・メール・Twitter DMにてご連絡ください',
  ]

  // モードに応じて注意事項を組み立て
  const notices = mode === 'private' 
    ? [...commonNotices, ...privateOnlyNotices]
    : [...commonNotices, ...openOnlyNotices]

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

