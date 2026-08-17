import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { PartnerStoreReportRow } from '@/types'

type PartnerStoreReportTableProps = {
  rows: PartnerStoreReportRow[]
  showAuthor?: boolean
  emptyMessage?: string
}

export function PartnerStoreReportTable({
  rows,
  showAuthor = true,
  emptyMessage = 'この期間の店舗別報告はまだありません',
}: PartnerStoreReportTableProps) {
  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">{emptyMessage}</p>
    )
  }

  const authors = new Map<string, PartnerStoreReportRow[]>()
  for (const row of rows) {
    const key = showAuthor ? row.author : row.scenario_title
    const list = authors.get(key) ?? []
    list.push(row)
    authors.set(key, list)
  }

  return (
    <div className="space-y-4">
      {[...authors.entries()].map(([groupName, groupRows]) => {
        const scenarios = new Map<string, PartnerStoreReportRow[]>()
        for (const row of groupRows) {
          const list = scenarios.get(row.scenario_master_id) ?? []
          list.push(row)
          scenarios.set(row.scenario_master_id, list)
        }

        return (
          <Card key={groupName}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {showAuthor ? groupName : groupRows[0]?.scenario_title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[...scenarios.entries()].map(([scenarioId, scenarioRows]) => {
                const title = scenarioRows[0]?.scenario_title ?? '不明な作品'
                const scenarioTotal = scenarioRows.reduce((sum, row) => sum + row.license_fee, 0)
                return (
                  <div key={scenarioId} className="space-y-2">
                    {showAuthor && (
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{title}</p>
                        <p className="text-sm text-muted-foreground">
                          ¥{scenarioTotal.toLocaleString()}
                        </p>
                      </div>
                    )}
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>店舗</TableHead>
                          <TableHead className="text-right">回数</TableHead>
                          <TableHead className="text-right">単価</TableHead>
                          <TableHead className="text-right">金額</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {scenarioRows.map(row => (
                          <TableRow key={`${row.scenario_master_id}-${row.partner_store_id}`}>
                            <TableCell>{row.partner_store_name}</TableCell>
                            <TableCell className="text-right">{row.performance_count}</TableCell>
                            <TableCell className="text-right">¥{row.license_amount.toLocaleString()}</TableCell>
                            <TableCell className="text-right">¥{row.license_fee.toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
