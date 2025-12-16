/**
 * ライセンス集計カード
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BarChart3, FileText, Building2 } from 'lucide-react'
import type { LicensePerformanceSummary } from '@/types'

interface LicenseSummaryCardProps {
  summary: LicensePerformanceSummary[]
}

export function LicenseSummaryCard({ summary }: LicenseSummaryCardProps) {
  // 合計を計算
  const totalInternal = summary.reduce((sum, s) => sum + s.internal_performance_count, 0)
  const totalExternal = summary.reduce((sum, s) => sum + s.external_performance_count, 0)
  const totalPerformances = summary.reduce((sum, s) => sum + s.total_performance_count, 0)
  const totalLicenseFee = summary.reduce((sum, s) => sum + s.total_license_fee, 0)

  // 著者別にグループ化
  const byAuthor = summary.reduce((acc, s) => {
    if (!acc[s.author]) {
      acc[s.author] = {
        author: s.author,
        scenarios: [],
        total_performance_count: 0,
        total_license_fee: 0,
      }
    }
    acc[s.author].scenarios.push(s)
    acc[s.author].total_performance_count += s.total_performance_count
    acc[s.author].total_license_fee += s.total_license_fee
    return acc
  }, {} as Record<string, { author: string; scenarios: LicensePerformanceSummary[]; total_performance_count: number; total_license_fee: number }>)

  const authorList = Object.values(byAuthor).sort((a, b) => b.total_license_fee - a.total_license_fee)

  return (
    <div className="space-y-6">
      {/* 全体サマリー */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{totalPerformances}</div>
            <div className="text-sm text-muted-foreground">総公演回数</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{totalInternal}</div>
            <div className="text-sm text-muted-foreground">内部公演</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{totalExternal}</div>
            <div className="text-sm text-muted-foreground">外部報告</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              ¥{totalLicenseFee.toLocaleString()}
            </div>
            <div className="text-sm text-muted-foreground">総ライセンス料</div>
          </CardContent>
        </Card>
      </div>

      {/* 著者別サマリー */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            著者別集計
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {authorList.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              データがありません
            </p>
          ) : (
            authorList.map((author) => (
              <div key={author.author} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-lg">{author.author}</span>
                    <Badge variant="outline">
                      {author.scenarios.length}作品
                    </Badge>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-green-600">
                      ¥{author.total_license_fee.toLocaleString()}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {author.total_performance_count}回
                    </div>
                  </div>
                </div>
                
                {/* シナリオ別の内訳 */}
                <div className="space-y-2 mt-3 pt-3 border-t">
                  {author.scenarios.map((scenario) => (
                    <div 
                      key={scenario.scenario_id}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span>{scenario.scenario_title}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-muted-foreground">
                          {scenario.internal_performance_count}回（内部）
                          {scenario.external_performance_count > 0 && (
                            <> + {scenario.external_performance_count}回（外部）</>
                          )}
                        </span>
                        <span className="font-medium">
                          ¥{scenario.total_license_fee.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* シナリオ別詳細テーブル */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            シナリオ別詳細
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3">シナリオ</th>
                  <th className="text-left py-2 px-3">著者</th>
                  <th className="text-right py-2 px-3">ライセンス単価</th>
                  <th className="text-right py-2 px-3">内部</th>
                  <th className="text-right py-2 px-3">外部</th>
                  <th className="text-right py-2 px-3">合計回数</th>
                  <th className="text-right py-2 px-3">ライセンス料</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.scenario_id} className="border-b hover:bg-muted/50">
                    <td className="py-2 px-3 font-medium">{s.scenario_title}</td>
                    <td className="py-2 px-3">{s.author}</td>
                    <td className="py-2 px-3 text-right">
                      ¥{s.license_amount.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {s.internal_performance_count}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {s.external_performance_count}
                    </td>
                    <td className="py-2 px-3 text-right font-medium">
                      {s.total_performance_count}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-green-600">
                      ¥{s.total_license_fee.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted">
                  <td colSpan={3} className="py-2 px-3 font-bold">合計</td>
                  <td className="py-2 px-3 text-right font-bold">{totalInternal}</td>
                  <td className="py-2 px-3 text-right font-bold">{totalExternal}</td>
                  <td className="py-2 px-3 text-right font-bold">{totalPerformances}</td>
                  <td className="py-2 px-3 text-right font-bold text-green-600">
                    ¥{totalLicenseFee.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

