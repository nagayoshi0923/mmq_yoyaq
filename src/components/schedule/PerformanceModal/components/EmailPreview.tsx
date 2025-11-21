// メールプレビューコンポーネント

import type { EmailContent } from '../types'

interface EmailPreviewProps {
  content: EmailContent
}

export function EmailPreview({ content }: EmailPreviewProps) {
  const formatDate = (dateStr: string): string => {
    if (!dateStr) return ''
    try {
      const date = new Date(dateStr)
      const weekdays = ['日', '月', '火', '水', '木', '金', '土']
      return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日(${weekdays[date.getDay()]})`
    } catch {
      return dateStr
    }
  }

  const formatTime = (timeStr: string): string => {
    return timeStr.slice(0, 5)
  }

  const hasCancellationFee = content.cancellationFee > 0

  return (
    <div className="border rounded-lg p-3 md:p-4 bg-white max-h-[400px] overflow-y-auto">
      <div className="bg-red-50 border border-red-200 rounded-lg p-3 md:p-4 mb-3">
        <h2 className="text-red-600 text-base md:text-lg font-bold mb-1">公演中止のお知らせ</h2>
        <p className="text-xs md:text-sm mb-1">{content.customerName} 様</p>
        <p className="text-[10px] md:text-xs text-gray-600">
          誠に申し訳ございませんが、以下の公演を中止させていただくこととなりました。
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-3 md:p-4 mb-3">
        <h3 className="text-sm md:text-base font-semibold mb-3 pb-2 border-b border-gray-300">中止された公演</h3>
        <table className="w-full text-xs md:text-sm">
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="py-2 font-medium text-gray-600 w-1/3">予約番号</td>
              <td className="py-2 text-gray-900">{content.reservationNumber}</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-2 font-medium text-gray-600">シナリオ</td>
              <td className="py-2 text-gray-900">{content.scenarioTitle}</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-2 font-medium text-gray-600">日時</td>
              <td className="py-2 text-gray-900">
                {formatDate(content.eventDate)}<br />
                {formatTime(content.startTime)}〜{formatTime(content.endTime)}
              </td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-2 font-medium text-gray-600">会場</td>
              <td className="py-2 text-gray-900">{content.storeName}</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-2 font-medium text-gray-600">参加人数</td>
              <td className="py-2 text-gray-900">{content.participantCount}名</td>
            </tr>
            <tr className={hasCancellationFee ? 'border-b border-gray-100' : ''}>
              <td className="py-2 font-medium text-gray-600">予約金額</td>
              <td className="py-2 text-gray-600">¥{content.totalPrice.toLocaleString()}</td>
            </tr>
            {hasCancellationFee && (
              <tr>
                <td className="py-2 font-medium text-red-600">キャンセル料</td>
                <td className="py-2 text-red-600 text-sm md:text-base font-bold">¥{content.cancellationFee.toLocaleString()}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {content.cancellationReason && (
        <div className="bg-gray-50 border-l-4 border-gray-500 rounded p-3 mb-3">
          <h3 className="text-gray-700 font-semibold mb-1 text-xs md:text-sm">中止理由</h3>
          <p className="text-gray-600 whitespace-pre-line text-[10px] md:text-xs">{content.cancellationReason}</p>
        </div>
      )}

      <div className="bg-red-50 border-l-4 border-red-600 rounded p-3 mb-3">
        <h3 className="text-red-900 font-semibold mb-1 text-xs md:text-sm">お詫び</h3>
        <p className="text-red-900 text-[10px] md:text-xs">
          ご迷惑をおかけし、大変申し訳ございません。
          {hasCancellationFee 
            ? 'キャンセル料につきましては、別途ご案内させていただきます。'
            : 'ご予約いただいた金額は全額返金させていただきます。'}
        </p>
      </div>

      <div className="bg-gray-50 rounded-lg p-3 text-center mb-3">
        <p className="text-gray-600 text-[10px] md:text-xs">
          返金処理につきましては、通常3〜5営業日以内に完了いたします。<br />
          ご不明な点がございましたら、お気軽にお問い合わせください。
        </p>
      </div>

      <div className="text-center pt-3 border-t border-gray-200 text-gray-400 text-[9px] md:text-xs">
        <p className="mb-0.5">Murder Mystery Queue (MMQ)</p>
        <p className="mb-0.5">このメールは自動送信されています</p>
        <p>ご不明な点がございましたら、お気軽にお問い合わせください</p>
      </div>
    </div>
  )
}

