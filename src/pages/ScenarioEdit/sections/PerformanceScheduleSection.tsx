import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScheduleTable } from '@/components/schedule/ScheduleTable'
import { useScheduleTable } from '@/hooks/useScheduleTable'
import { useMonthNavigation } from '@/pages/ScheduleManager/hooks/useMonthNavigation'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditModal/types'

interface PerformanceScheduleSectionProps {
  formData: ScenarioFormData
  scenarioId: string | null
}

export function PerformanceScheduleSection({ 
  formData, 
  scenarioId 
}: PerformanceScheduleSectionProps) {
  // 月ナビゲーション（常に呼び出す - Hooksのルール）
  const { currentDate, setCurrentDate } = useMonthNavigation()

  // スケジュールテーブルの共通フック（常に呼び出す - Hooksのルール）
  const scheduleTableProps = useScheduleTable({ currentDate })

  // シナリオタイトル
  const scenarioTitle = formData.title
  const hasScenario = !!(scenarioId || scenarioTitle)

  // このシナリオの公演だけをフィルタリング
  const filteredScheduleTableProps = useMemo(() => {
    if (!hasScenario) {
      // 新規作成中または保存前の場合は空を返す
      return {
        ...scheduleTableProps,
        dataProvider: {
          ...scheduleTableProps.dataProvider,
          getEventsForSlot: () => []
        }
      }
    }

    // シナリオタイトルで公演をフィルタリング
    return {
      ...scheduleTableProps,
      dataProvider: {
        ...scheduleTableProps.dataProvider,
        getEventsForSlot: (date: string, venue: string, timeSlot: 'morning' | 'afternoon' | 'evening') => {
          const events = scheduleTableProps.dataProvider.getEventsForSlot(date, venue, timeSlot)
          // シナリオタイトルが一致する公演のみを返す
          return events.filter(event => event.scenario === scenarioTitle)
        }
      }
    }
  }, [scheduleTableProps, hasScenario, scenarioTitle])

  // 月を変更する関数
  const changeMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate)
    if (direction === 'prev') {
      newDate.setMonth(currentDate.getMonth() - 1)
    } else {
      newDate.setMonth(currentDate.getMonth() + 1)
    }
    setCurrentDate(newDate)
  }

  // 早期リターンをなくし、条件分岐でレンダリング（Hooksのルール）
  const showEmptyState = !hasScenario

  // 公演数をカウント
  const totalPerformances = useMemo(() => {
    const { stores } = scheduleTableProps.viewConfig
    const { monthDays } = scheduleTableProps.viewConfig
    
    let count = 0
    stores.forEach(store => {
      monthDays.forEach(day => {
        ['morning', 'afternoon', 'evening'].forEach(timeSlot => {
          const events = filteredScheduleTableProps.dataProvider.getEventsForSlot(
            day.date, 
            store.id, 
            timeSlot as 'morning' | 'afternoon' | 'evening'
          )
          count += events.length
        })
      })
    })
    
    return count
  }, [filteredScheduleTableProps, scheduleTableProps.viewConfig])

  if (showEmptyState) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>公演予定</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            <p className="mb-2">シナリオを保存すると公演予定が表示されます</p>
            <p className="text-sm">このシナリオを使用した公演スケジュールを確認できます</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>公演予定</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                「{formData.title}」の公演スケジュール
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => changeMonth('prev')}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[120px] text-center">
                {currentDate.getFullYear()}年{currentDate.getMonth() + 1}月
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => changeMonth('next')}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {totalPerformances > 0 ? (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                この月は <span className="font-bold text-lg">{totalPerformances}</span> 公演予定があります
              </p>
            </div>
          ) : (
            <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
              <p className="text-sm text-gray-600">
                この月の公演予定はありません
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* スケジュールテーブル */}
      <ScheduleTable {...filteredScheduleTableProps} />
    </div>
  )
}

