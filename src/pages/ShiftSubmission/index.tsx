import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { CheckSquare, Square } from 'lucide-react'
import { MonthSwitcher } from '@/components/patterns/calendar'
import { useShiftData } from './hooks/useShiftData'
import { useShiftSubmit } from './hooks/useShiftSubmit'
import { getDayOfWeekColor } from './utils/shiftFormatters'
import type { DayInfo } from './types'

/**
 * シフト提出ページ
 */
export function ShiftSubmission() {
  // 月選択
  const [currentDate, setCurrentDate] = useState(() => new Date())
  
  // 月間の日付リストを生成
  const monthDays = useMemo((): DayInfo[] => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    
    const days: DayInfo[] = []
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day)
      const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      days.push({
        date: dateString,
        dayOfWeek: date.toLocaleDateString('ja-JP', { weekday: 'short' }),
        day: day,
        displayDate: `${month + 1}/${day}`
      })
    }
    
    return days
  }, [currentDate])
  
  const formatMonthYear = () => {
    return `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`
  }
  
  const {
    shiftData,
    loading,
    setLoading,
    currentStaffId,
    handleShiftChange,
    handleSelectAll,
    handleDeselectAll
  } = useShiftData({ currentDate, monthDays })
  
  const { handleSubmitShift } = useShiftSubmit({
    currentStaffId,
    shiftData,
    setLoading
  })

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="shift-submission" />
      
      <div className="container mx-auto max-w-7xl px-8 py-6">
        <div className="space-y-6">
          {/* ヘッダー */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">シフト提出</h1>
              <p className="text-muted-foreground">
                出勤可能な日時を選択してください
              </p>
            </div>
            <MonthSwitcher
              value={currentDate}
              onChange={setCurrentDate}
              showToday
              quickJump
            />
          </div>

          {/* メインカード・テーブル */}
          <Card>
            <CardHeader className="bg-muted/30 border-b border-border">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>シフト提出 - {formatMonthYear()}</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    出勤可能な時間帯にチェックを入れてください
                  </CardDescription>
                </div>
                <Button onClick={handleSubmitShift} disabled={loading}>
                  {loading ? '送信中...' : 'シフトを提出'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-20 border-r">日付</TableHead>
                    <TableHead className="w-16 border-r">曜日</TableHead>
                    <TableHead className="w-32 border-r text-center">
                      <div className="flex flex-col items-center space-y-1">
                        <span>午前</span>
                        <span className="text-xs text-muted-foreground">(~12:00)</span>
                        <div className="flex space-x-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSelectAll('morning')}
                            className="h-6 px-2 text-xs"
                          >
                            <CheckSquare className="h-3 w-3 mr-1" />
                            全選択
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeselectAll('morning')}
                            className="h-6 px-2 text-xs"
                          >
                            <Square className="h-3 w-3 mr-1" />
                            全解除
                          </Button>
                        </div>
                      </div>
                    </TableHead>
                    <TableHead className="w-32 border-r text-center">
                      <div className="flex flex-col items-center space-y-1">
                        <span>午後</span>
                        <span className="text-xs text-muted-foreground">(12:00-17:00)</span>
                        <div className="flex space-x-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSelectAll('afternoon')}
                            className="h-6 px-2 text-xs"
                          >
                            <CheckSquare className="h-3 w-3 mr-1" />
                            全選択
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeselectAll('afternoon')}
                            className="h-6 px-2 text-xs"
                          >
                            <Square className="h-3 w-3 mr-1" />
                            全解除
                          </Button>
                        </div>
                      </div>
                    </TableHead>
                    <TableHead className="w-32 border-r text-center">
                      <div className="flex flex-col items-center space-y-1">
                        <span>夜間</span>
                        <span className="text-xs text-muted-foreground">(17:00~)</span>
                        <div className="flex space-x-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSelectAll('evening')}
                            className="h-6 px-2 text-xs"
                          >
                            <CheckSquare className="h-3 w-3 mr-1" />
                            全選択
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeselectAll('evening')}
                            className="h-6 px-2 text-xs"
                          >
                            <Square className="h-3 w-3 mr-1" />
                            全解除
                          </Button>
                        </div>
                      </div>
                    </TableHead>
                    <TableHead className="w-32 text-center">
                      <div className="flex flex-col items-center space-y-1">
                        <span>終日</span>
                        <span className="text-xs text-muted-foreground">(全日)</span>
                        <div className="flex space-x-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSelectAll('all_day')}
                            className="h-6 px-2 text-xs"
                          >
                            <CheckSquare className="h-3 w-3 mr-1" />
                            全選択
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeselectAll('all_day')}
                            className="h-6 px-2 text-xs"
                          >
                            <Square className="h-3 w-3 mr-1" />
                            全解除
                          </Button>
                        </div>
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthDays.map((day) => {
                    const dayShift = shiftData[day.date]
                    if (!dayShift) return null

                    return (
                      <TableRow key={day.date} className="hover:bg-muted/30">
                        <TableCell className="border-r font-medium">{day.displayDate}</TableCell>
                        <TableCell className={`border-r ${getDayOfWeekColor(day.dayOfWeek)}`}>
                          {day.dayOfWeek}
                        </TableCell>
                        <TableCell className="border-r text-center">
                          <Checkbox
                            checked={dayShift.morning}
                            onCheckedChange={(checked) =>
                              handleShiftChange(day.date, 'morning', checked as boolean)
                            }
                          />
                        </TableCell>
                        <TableCell className="border-r text-center">
                          <Checkbox
                            checked={dayShift.afternoon}
                            onCheckedChange={(checked) =>
                              handleShiftChange(day.date, 'afternoon', checked as boolean)
                            }
                          />
                        </TableCell>
                        <TableCell className="border-r text-center">
                          <Checkbox
                            checked={dayShift.evening}
                            onCheckedChange={(checked) =>
                              handleShiftChange(day.date, 'evening', checked as boolean)
                            }
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={dayShift.all_day}
                            onCheckedChange={(checked) =>
                              handleShiftChange(day.date, 'all_day', checked as boolean)
                            }
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

