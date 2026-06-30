import type { Dispatch, SetStateAction } from 'react'
import { Calendar } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SingleDatePopover } from '@/components/ui/single-date-popover'
import type { EventFormData, ScheduleEvent } from '@/types/schedule'
import type { Store } from '@/types'

interface DateLocationSectionProps {
  formData: EventFormData
  setFormData: Dispatch<SetStateAction<EventFormData>>
  CATEGORY_TONE: Record<string, { bg: string; section: string; border: string }>
  getStoreName: (storeId: string) => string
  stores: Store[]
  timeSlot: 'morning' | 'afternoon' | 'evening'
  handleTimeSlotChange: (slot: 'morning' | 'afternoon' | 'evening') => void
  timeSlotDefaults: {
    morning: { start_time: string; end_time: string; label: string }
    afternoon: { start_time: string; end_time: string; label: string }
    evening: { start_time: string; end_time: string; label: string }
  }
  handleStartTimeChange: (startTime: string) => void
  timeConflictTriggerClass: string
  timeOptions: string[]
  timeConflict: { kind: 'overlap' | 'interval'; reason: string; event: ScheduleEvent } | null
}

/** セクション1: 日時・場所。PerformanceModal から逐語抽出（presentational・挙動不変） */
export function DateLocationSection({
  formData,
  setFormData,
  CATEGORY_TONE,
  getStoreName,
  stores,
  timeSlot,
  handleTimeSlotChange,
  timeSlotDefaults,
  handleStartTimeChange,
  timeConflictTriggerClass,
  timeOptions,
  timeConflict,
}: DateLocationSectionProps) {
  return (
          <div className="rounded-lg border p-3 space-y-2" style={CATEGORY_TONE[formData.category] ? { backgroundColor: CATEGORY_TONE[formData.category].section, borderColor: CATEGORY_TONE[formData.category].border } : { backgroundColor: "rgb(248 250 252 / 0.7)" }}>
            <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 mb-1">
              <Calendar className="h-3.5 w-3.5" />日時・場所
            </p>

            {/* 日付 */}
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground w-[72px] shrink-0 text-right">日付</Label>
              <div className="flex-1">
                <SingleDatePopover
                  date={formData.date}
                  onDateChange={(date) => setFormData((prev: any) => ({ ...prev, date: date || '' }))}
                  placeholder="日付を選択"
                  buttonClassName="h-7 text-xs w-full"
                />
              </div>
            </div>

            {/* 店舗 */}
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground w-[72px] shrink-0 text-right">店舗</Label>
              <div className="flex-1">
                <Select value={formData.venue} onValueChange={(value) => setFormData((prev: any) => ({ ...prev, venue: value }))}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="店舗を選択">
                      <Badge className="bg-gray-100 border-0 rounded-[2px] font-normal text-[11px] px-1 py-0" variant="secondary">
                        {getStoreName(formData.venue)}
                      </Badge>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map(store => (
                      <SelectItem key={store.id} value={store.id} className="text-xs py-1">
                        <Badge className="bg-gray-100 border-0 rounded-[2px] font-normal text-[11px] px-1 py-0" variant="secondary">{store.name}</Badge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 時間帯 */}
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground w-[72px] shrink-0 text-right">時間帯</Label>
              <div className="flex-1">
                <Select value={timeSlot} onValueChange={(value: 'morning' | 'afternoon' | 'evening') => handleTimeSlotChange(value)}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="morning" className="text-xs py-1">{timeSlotDefaults.morning.label}</SelectItem>
                    <SelectItem value="afternoon" className="text-xs py-1">{timeSlotDefaults.afternoon.label}</SelectItem>
                    <SelectItem value="evening" className="text-xs py-1">{timeSlotDefaults.evening.label}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 開始〜終了 */}
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground w-[72px] shrink-0 text-right">開始〜終了</Label>
              <div className="flex items-center gap-2 flex-1">
                <Select value={formData.start_time?.slice(0, 5)} onValueChange={handleStartTimeChange} disabled={formData.is_private_request}>
                  <SelectTrigger className={`h-7 text-xs flex-1 ${timeConflictTriggerClass}`}>
                    <SelectValue placeholder="開始" />
                  </SelectTrigger>
                  <SelectContent>
                    {timeOptions.map(time => <SelectItem key={time} value={time} className="text-xs py-1">{time}</SelectItem>)}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground shrink-0">〜</span>
                <Select value={formData.end_time?.slice(0, 5)} onValueChange={(value) => setFormData((prev: any) => ({ ...prev, end_time: value }))} disabled={formData.is_private_request}>
                  <SelectTrigger className={`h-7 text-xs flex-1 ${timeConflictTriggerClass}`}>
                    <SelectValue placeholder="終了" />
                  </SelectTrigger>
                  <SelectContent>
                    {timeOptions.map(time => <SelectItem key={time} value={time} className="text-xs py-1">{time}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* 時間プルダウン直下に重複/間隔不足を即時表示（保存はブロックしない・既存公演は削除しない） */}
            {timeConflict && (
              <p className={`text-[11px] pl-[84px] ${timeConflict.kind === 'overlap' ? 'text-red-600' : 'text-amber-700'}`}>
                ⚠️ {timeConflict.event.start_time.slice(0, 5)}〜{timeConflict.event.end_time.slice(0, 5)}
                {timeConflict.event.scenario ? `（${timeConflict.event.scenario}）` : ''}と
                {timeConflict.kind === 'overlap' ? '時間が重複しています。' : '間隔が短いです（推奨60分）。'}
                このまま保存もできます（既存公演は削除されません）。
              </p>
            )}
            {formData.is_private_request && (
              <p className="text-[11px] text-purple-600 pl-[84px]">※ 貸切の日時変更不可</p>
            )}
          </div>
  )
}
