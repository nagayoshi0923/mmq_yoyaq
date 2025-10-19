import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface MonthSelectorProps {
  currentMonth: string
  onPrevMonth: () => void
  onNextMonth: () => void
  onSubmit: () => void
  loading: boolean
}

/**
 * 月選択コンポーネント
 */
export function MonthSelector({
  currentMonth,
  onPrevMonth,
  onNextMonth,
  onSubmit,
  loading
}: MonthSelectorProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>シフト提出</CardTitle>
            <CardDescription>希望するシフトを選択して提出してください</CardDescription>
          </div>
          <Button onClick={onSubmit} disabled={loading}>
            {loading ? '送信中...' : 'シフトを提出'}
          </Button>
        </div>
        <div className="flex items-center justify-center gap-4 mt-4">
          <Button variant="outline" size="sm" onClick={onPrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-xl font-bold">{currentMonth}</h3>
          <Button variant="outline" size="sm" onClick={onNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
    </Card>
  )
}

