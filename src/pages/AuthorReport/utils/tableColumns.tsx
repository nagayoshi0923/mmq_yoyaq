import { Copy, Mail, Check, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Column } from '@/components/patterns/table'
import type { AuthorPerformance } from '../types'

interface AuthorTableActions {
  onCopy: (author: AuthorPerformance) => void
  onEmail: (author: AuthorPerformance) => void
  onToggleExpand: (authorName: string) => void
}

interface AuthorTableContext {
  copiedAuthor: string | null
  expandedAuthors: Set<string>
}

/**
 * AuthorReport用のテーブル列定義を生成
 */
export function createAuthorColumns(
  context: AuthorTableContext,
  actions: AuthorTableActions
): Column<AuthorPerformance>[] {
  const { copiedAuthor, expandedAuthors } = context
  const { onCopy, onEmail, onToggleExpand } = actions

  return [
    {
      key: 'expand',
      header: '',
      sortable: false,
      width: 'w-[50px]',
      render: (author) => {
        const isExpanded = expandedAuthors.has(author.author)
        return (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggleExpand(author.author)}
            className="h-6 w-6 p-0"
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        )
      }
    },
    {
      key: 'author',
      header: '作者',
      sortable: true,
      width: 'flex-1',
      render: (author) => (
        <span className="">{author.author}</span>
      )
    },
    {
      key: 'totalEvents',
      header: '公演数',
      sortable: true,
      width: 'w-24',
      align: 'right',
      render: (author) => `${author.totalEvents}回`
    },
    {
      key: 'totalLicenseCost',
      header: 'ライセンス料',
      sortable: true,
      width: 'w-32',
      align: 'right',
      render: (author) => (
        <span className="">¥{author.totalLicenseCost.toLocaleString()}</span>
      )
    },
    {
      key: 'totalDuration',
      header: '所要時間',
      sortable: true,
      width: 'w-28',
      align: 'right',
      render: (author) => `${Math.round(author.totalDuration / 60)}時間`
    },
    {
      key: 'actions',
      header: 'アクション',
      sortable: false,
      width: 'w-[150px]',
      align: 'right',
      render: (author) => (
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onCopy(author)}
            className="h-8"
          >
            {copiedAuthor === author.author ? (
              <>
                <Check className="h-4 w-4 mr-1" />
                コピー済み
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-1" />
                コピー
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEmail(author)}
            className="h-8"
          >
            <Mail className="h-4 w-4 mr-1" />
            Gmail
          </Button>
        </div>
      )
    }
  ]
}

/**
 * 展開時の詳細行をレンダリング
 * onScenarioClick を渡すと、シナリオタイトルをクリック可能にする
 */
export function renderExpandedRow(
  author: AuthorPerformance,
  onScenarioClick?: (scenarioTitle: string) => void
) {
  return (
    <div className="py-4 px-6 space-y-2 bg-muted/30">
      <h4 className="mb-3">シナリオ別詳細</h4>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>シナリオ</TableHead>
            <TableHead className="text-right">公演数</TableHead>
            <TableHead className="text-right">単価</TableHead>
            <TableHead className="text-right">ライセンス料</TableHead>
            <TableHead className="text-right">時間</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {author.scenarios.map((scenario) => (
            <TableRow key={scenario.title}>
              <TableCell>
                {onScenarioClick ? (
                  <button
                    type="button"
                    onClick={() => onScenarioClick(scenario.title)}
                    className="text-blue-600 hover:text-blue-700 underline underline-offset-2 cursor-pointer"
                    title="シナリオを編集"
                  >
                    {scenario.title}
                  </button>
                ) : (
                  scenario.title
                )}
              </TableCell>
              <TableCell className="text-right">{scenario.events}回</TableCell>
              <TableCell className="text-right">
                ¥{scenario.licenseAmountPerEvent.toLocaleString()}
              </TableCell>
              <TableCell className="text-right">
                ¥{scenario.licenseCost.toLocaleString()}
              </TableCell>
              <TableCell className="text-right">
                {Math.round(scenario.totalDuration / 60)}h
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

