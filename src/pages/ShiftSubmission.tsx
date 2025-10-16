import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { shiftApi } from '@/lib/shiftApi'
import { supabase } from '@/lib/supabase'
import { 
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square
} from 'lucide-react'

// シフト提出の型定義
interface ShiftSubmission {
  id: string
  staff_id: string
  date: string
  morning: boolean
  afternoon: boolean
  evening: boolean
  all_day: boolean
  submitted_at: string
  status: 'draft' | 'submitted' | 'approved' | 'rejected'
}

// 日付情報の型定義
interface DayInfo {
  date: string
  dayOfWeek: string
  day: number
  displayDate: string
}

export function ShiftSubmission() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [shiftData, setShiftData] = useState<Record<string, ShiftSubmission>>({})
  const [loading, setLoading] = useState(false)
  const [currentStaffId, setCurrentStaffId] = useState<string>('')

  // 月の変更
  const changeMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev)
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1)
      } else {
        newDate.setMonth(prev.getMonth() + 1)
      }
      return newDate
    })
  }

  // 月間の日付リストを生成
  const generateMonthDays = (): DayInfo[] => {
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
  }

  const monthDays = generateMonthDays()

  // 現在のスタッフIDを取得
  useEffect(() => {
    const getCurrentStaff = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        // スタッフテーブルからユーザーに紐づくスタッフIDを取得
        const { data: staffData } = await supabase
          .from('staff')
          .select('id')
          .eq('email', user.email)
          .single()
        
        if (staffData) {
          setCurrentStaffId(staffData.id)
        }
      }
    }
    getCurrentStaff()
  }, [])

  // シフトデータの初期化・読み込み
  useEffect(() => {
    if (!currentStaffId) return
    
    const loadShiftData = async () => {
      setLoading(true)
      try {
        const year = currentDate.getFullYear()
        const month = currentDate.getMonth() + 1
        
        // データベースから既存のシフトを取得
        const existingShifts = await shiftApi.getStaffShifts(currentStaffId, year, month)
        
        // 月の日数を取得
        const daysInMonth = new Date(year, month, 0).getDate()
        const newShiftData: Record<string, ShiftSubmission> = {}
        
        for (let day = 1; day <= daysInMonth; day++) {
          const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          
          // 既存のシフトがあればそれを使用、なければデフォルト値
          const existingShift = existingShifts.find((s: any) => s.date === dateString)
          
          if (existingShift) {
            newShiftData[dateString] = {
              id: existingShift.id,
              staff_id: existingShift.staff_id,
              date: dateString,
              morning: existingShift.morning || false,
              afternoon: existingShift.afternoon || false,
              evening: existingShift.evening || false,
              all_day: existingShift.all_day || false,
              submitted_at: existingShift.submitted_at || '',
              status: existingShift.status || 'draft'
            }
          } else {
            newShiftData[dateString] = {
              id: `temp-${dateString}`,
              staff_id: currentStaffId,
              date: dateString,
              morning: false,
              afternoon: false,
              evening: false,
              all_day: false,
              submitted_at: '',
              status: 'draft'
            }
          }
        }
        
        setShiftData(newShiftData)
      } catch (error) {
        console.error('シフトデータ読み込みエラー:', error)
      } finally {
        setLoading(false)
      }
    }
    
    loadShiftData()
  }, [currentDate, currentStaffId])

  // チェックボックスの変更ハンドラー
  const handleShiftChange = (date: string, timeSlot: 'morning' | 'afternoon' | 'evening' | 'all_day', checked: boolean) => {
    setShiftData(prev => ({
      ...prev,
      [date]: {
        ...prev[date],
        [timeSlot]: checked,
        // 終日がチェックされた場合、他の時間帯もチェック
        ...(timeSlot === 'all_day' && checked ? {
          morning: true,
          afternoon: true,
          evening: true
        } : {}),
        // 他の時間帯がすべてチェックされた場合、終日もチェック
        ...(timeSlot !== 'all_day' ? {
          all_day: timeSlot === 'morning' ? 
            (checked && prev[date]?.afternoon && prev[date]?.evening) :
            timeSlot === 'afternoon' ?
            (checked && prev[date]?.morning && prev[date]?.evening) :
            (checked && prev[date]?.morning && prev[date]?.afternoon)
        } : {})
      }
    }))
  }

  // 全てチェックボタン
  const handleSelectAll = (timeSlot: 'morning' | 'afternoon' | 'evening' | 'all_day') => {
    const newShiftData = { ...shiftData }
    
    monthDays.forEach(day => {
      if (newShiftData[day.date]) {
        newShiftData[day.date] = {
          ...newShiftData[day.date],
          [timeSlot]: true,
          // 終日が選択された場合、他の時間帯もチェック
          ...(timeSlot === 'all_day' ? {
            morning: true,
            afternoon: true,
            evening: true
          } : {})
        }
      }
    })
    
    setShiftData(newShiftData)
  }

  // 全て解除ボタン
  const handleDeselectAll = (timeSlot: 'morning' | 'afternoon' | 'evening' | 'all_day') => {
    const newShiftData = { ...shiftData }
    
    monthDays.forEach(day => {
      if (newShiftData[day.date]) {
        newShiftData[day.date] = {
          ...newShiftData[day.date],
          [timeSlot]: false,
          // 終日が解除された場合、他の時間帯も解除
          ...(timeSlot === 'all_day' ? {
            morning: false,
            afternoon: false,
            evening: false
          } : {})
        }
      }
    })
    
    setShiftData(newShiftData)
  }

  // シフト提出
  const handleSubmitShift = async () => {
    if (!currentStaffId) {
      alert('スタッフ情報が取得できませんでした')
      return
    }
    
    setLoading(true)
    try {
      // シフトデータを配列に変換して保存
      const shiftsToSave = Object.values(shiftData).filter(shift => 
        shift.morning || shift.afternoon || shift.evening || shift.all_day
      )
      
      if (shiftsToSave.length === 0) {
        alert('シフトが選択されていません')
        setLoading(false)
        return
      }
      
      // シフトデータを準備（upsert用）
      const shiftsToUpsert = shiftsToSave.map(shift => ({
        staff_id: currentStaffId,
        date: shift.date,
        morning: shift.morning,
        afternoon: shift.afternoon,
        evening: shift.evening,
        all_day: shift.all_day,
        status: 'submitted' as const,
        submitted_at: new Date().toISOString()
      }))
      
      // 一括でupsert（staff_id, dateの組み合わせで重複チェック）
      await shiftApi.upsertMultiple(shiftsToUpsert)
      
      alert('シフトを提出しました')
      
      // データを再読み込み
      const year = currentDate.getFullYear()
      const month = currentDate.getMonth() + 1
      const existingShifts = await shiftApi.getStaffShifts(currentStaffId, year, month)
      
      // 状態を更新
      const updatedShiftData: Record<string, ShiftSubmission> = {}
      
      // 月の全日付を再度生成
      const daysInMonth = new Date(year, month, 0).getDate()
      for (let day = 1; day <= daysInMonth; day++) {
        const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const existingShift = existingShifts.find((s: any) => s.date === dateString)
        
        if (existingShift) {
          updatedShiftData[dateString] = {
            id: existingShift.id,
            staff_id: existingShift.staff_id,
            date: dateString,
            morning: existingShift.morning || false,
            afternoon: existingShift.afternoon || false,
            evening: existingShift.evening || false,
            all_day: existingShift.all_day || false,
            submitted_at: existingShift.submitted_at || '',
            status: existingShift.status || 'draft'
          }
        } else {
          updatedShiftData[dateString] = {
            id: `temp-${dateString}`,
            staff_id: currentStaffId,
            date: dateString,
            morning: false,
            afternoon: false,
            evening: false,
            all_day: false,
            submitted_at: '',
            status: 'draft'
          }
        }
      }
      
      setShiftData(updatedShiftData)
      
    } catch (error) {
      console.error('シフト提出エラー:', error)
      alert('シフトの提出に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  // 曜日の色設定
  const getDayOfWeekColor = (dayOfWeek: string) => {
    if (dayOfWeek === '日') return 'text-red-600'
    if (dayOfWeek === '土') return 'text-blue-600'
    return 'text-gray-800'
  }

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
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => changeMonth('prev')}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-lg font-semibold min-w-[120px] text-center">
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

            {/* メインカード・テーブル */}
            <Card>
              <CardHeader className="bg-muted/30 border-b border-border">
                <CardTitle>シフト提出 - {currentDate.getFullYear()}年{currentDate.getMonth() + 1}月</CardTitle>
                <CardDescription className="text-muted-foreground">
                  出勤可能な時間帯にチェックを入れてください
                </CardDescription>
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
                    {monthDays.map(day => {
                      const shift = shiftData[day.date]
                      return (
                        <TableRow key={day.date} className="h-12">
                          {/* 日付セル */}
                          <TableCell className="border-r text-sm font-medium">
                            {day.displayDate}
                          </TableCell>
                          
                          {/* 曜日セル */}
                          <TableCell className={`border-r text-sm ${getDayOfWeekColor(day.dayOfWeek)}`}>
                            {day.dayOfWeek}
                          </TableCell>
                          
                          {/* 午前セル */}
                          <TableCell className="border-r text-center">
                            <Checkbox
                              checked={shift?.morning || false}
                              onCheckedChange={(checked) => 
                                handleShiftChange(day.date, 'morning', !!checked)
                              }
                            />
                          </TableCell>
                          
                          {/* 午後セル */}
                          <TableCell className="border-r text-center">
                            <Checkbox
                              checked={shift?.afternoon || false}
                              onCheckedChange={(checked) => 
                                handleShiftChange(day.date, 'afternoon', !!checked)
                              }
                            />
                          </TableCell>
                          
                          {/* 夜間セル */}
                          <TableCell className="border-r text-center">
                            <Checkbox
                              checked={shift?.evening || false}
                              onCheckedChange={(checked) => 
                                handleShiftChange(day.date, 'evening', !!checked)
                              }
                            />
                          </TableCell>
                          
                          {/* 終日セル */}
                          <TableCell className="text-center">
                            <Checkbox
                              checked={shift?.all_day || false}
                              onCheckedChange={(checked) => 
                                handleShiftChange(day.date, 'all_day', !!checked)
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

            {/* 提出ボタン */}
            <div className="flex justify-end space-x-4">
              <Button variant="outline">
                下書き保存
              </Button>
              <Button 
                onClick={handleSubmitShift}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {loading ? '提出中...' : 'シフト提出'}
              </Button>
            </div>
        </div>
      </div>
    </div>
  )
}
