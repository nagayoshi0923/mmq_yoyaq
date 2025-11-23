import type { AuthorPerformance } from '../types'

interface AuthorLicenseEmailPreviewProps {
  author: AuthorPerformance
  year: number
  month: number
  email: string
}

export function AuthorLicenseEmailPreview({
  author,
  year,
  month,
  email
}: AuthorLicenseEmailPreviewProps) {
  // 振込予定日を計算（翌月20日）
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const paymentDate = `${nextYear}年${nextMonth}月20日`

  return (
    <div className="border rounded-lg p-4 bg-white max-h-[500px] overflow-y-auto">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-3">
        <h2 className="text-blue-600 text-lg mb-1">
          【{year}年{month}月】ライセンス料レポート - {author.author}
        </h2>
        <p className="text-sm mb-1">{author.author} 様</p>
        <p className="text-xs text-gray-600">
          いつもお世話になっております。
        </p>
      </div>

      <div className="mb-3">
        <p className="text-sm text-gray-700 mb-2">
          {year}年{month}月のライセンス料をご報告いたします。
        </p>
      </div>

      <div className="bg-gray-50 rounded-lg p-3 mb-3">
        <h3 className="text-gray-700 mb-2 text-sm">■ 概要</h3>
        <table className="w-full text-sm">
          <tbody>
            <tr>
              <td className="py-1 text-gray-700">総公演数</td>
              <td className="py-1 text-gray-900 text-right">{author.totalEvents}回</td>
            </tr>
            <tr>
              <td className="py-1 text-gray-700">総ライセンス料</td>
              <td className="py-1 text-gray-900 text-right text-base">
                ¥{author.totalLicenseCost.toLocaleString()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-gray-50 rounded-lg p-3 mb-3">
        <h3 className="text-gray-700 mb-2 text-sm">■ 詳細</h3>
        <div className="space-y-2">
          {author.scenarios.map((scenario, index) => {
            const gmTestLabel = scenario.isGMTest ? '（GMテスト）' : ''
            const licenseInfo = `@¥${scenario.licenseAmountPerEvent.toLocaleString()}/回`
            return (
              <div key={index} className="text-sm text-gray-700 border-b border-gray-200 pb-2 last:border-0">
                <div className="">{scenario.title}{gmTestLabel}</div>
                <div className="text-xs text-gray-600 ml-2">
                  {scenario.events}回 × {licenseInfo} = ¥{scenario.licenseCost.toLocaleString()}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="bg-blue-50 border-l-4 border-blue-600 rounded p-3 mb-3">
        <h3 className="text-blue-900 mb-1 text-sm">■ お支払いについて</h3>
        <p className="text-blue-900 text-xs">
          お支払い予定日: {paymentDate}まで
        </p>
        <p className="text-blue-900 text-xs mt-1">
          請求書は queens.waltz@gmail.com 宛にお送りください。
        </p>
      </div>

      <div className="bg-gray-50 rounded-lg p-3 text-center mb-3">
        <p className="text-gray-600 text-xs">
          何かご不明点がございましたら、お気軽にお問い合わせください。
        </p>
        <p className="text-gray-600 text-xs mt-1">
          よろしくお願いいたします。
        </p>
      </div>

      <div className="text-center pt-3 border-t border-gray-200 text-gray-400 text-xs">
        <p className="mb-0.5">Murder Mystery Queue (MMQ)</p>
        <p className="mb-0.5">このメールは自動送信されています</p>
        <p>ご不明な点がございましたら、お気軽にお問い合わせください</p>
      </div>
    </div>
  )
}

