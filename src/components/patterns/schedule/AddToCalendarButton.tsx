/**
 * 「カレンダーに登録」。押すと Google カレンダー／Apple・Outlook 用のファイル（.ics）を選ぶ。
 * 確定した貸切（グループページ・マイページ）と一般公演（予約詳細・予約完了）の両方で使う。
 * iPhone の Safari では保存した .ics を開くと「カレンダーに追加」の案内が出る。
 */
import { Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { buildIcs, googleCalendarUrl, icsFileName, type CalendarEventInput } from '@/lib/calendarEvent'
import { cn } from '@/lib/utils'
import { SCHEDULE_ACTION_BUTTON } from './scheduleActionStyle'

interface AddToCalendarButtonProps {
  event: CalendarEventInput | null
  className?: string
  testId?: string
}

function saveIcs(event: CalendarEventInput) {
  const ics = buildIcs(event)
  if (!ics) {
    toast.error('日時が分からないため、カレンダーに登録できませんでした')
    return
  }
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = icsFileName(event.reservationNumber)
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60 * 1000)
}

export function AddToCalendarButton({ event, className, testId = 'add-to-calendar' }: AddToCalendarButtonProps) {
  if (!event) return null
  const google = googleCalendarUrl(event)
  if (!google) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className={cn(SCHEDULE_ACTION_BUTTON, className)} data-testid={testId}>
          <Calendar className="w-4 h-4" aria-hidden="true" />
          カレンダーに登録
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[14rem]">
        <DropdownMenuItem onSelect={() => window.open(google, '_blank', 'noopener,noreferrer')} data-testid={`${testId}-google`}>
          Google カレンダーに追加
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => saveIcs(event)} data-testid={`${testId}-ics`}>
          Apple・Outlook のカレンダー（ファイルを保存）
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
