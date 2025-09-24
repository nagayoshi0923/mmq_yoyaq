import React from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Users, Ban, Plus, AlertTriangle } from 'lucide-react'

// スケジュールイベントの型定義
interface ScheduleEvent {
  id: string
  date: string // YYYY-MM-DD
  venue: string // 店舗ID
  scenario: string
  gms: string[] // GMの名前の配列
  start_time: string // HH:MM
  end_time: string // HH:MM
  category: 'open' | 'private' | 'gmtest' | 'testplay' | 'offsite' // 公演カテゴリ
  is_cancelled?: boolean
  participant_count?: number
  max_participants?: number
  notes?: string
}

interface PerformanceCardProps {
  event: ScheduleEvent
  storeColors: string
  categoryConfig: {
    [key: string]: {
      label: string
      badgeColor: string
      cardColor: string
    }
  }
  getReservationBadgeClass: (current: number, max: number) => string
  onCancel?: (event: ScheduleEvent) => void
  onUncancel?: (event: ScheduleEvent) => void
}

export function PerformanceCard({
  event,
  storeColors,
  categoryConfig,
  getReservationBadgeClass,
  onCancel,
  onUncancel
}: PerformanceCardProps) {
  const reservationCount = event.participant_count || 0
  const maxCapacity = event.max_participants || 8
  const isIncomplete = !event.scenario || event.gms.length === 0

  return (
    <div
      className={`p-2 border rounded-md hover:shadow-sm transition-shadow text-xs relative ${
        event.is_cancelled 
          ? 'bg-gray-100 border-gray-300 opacity-75' 
          : storeColors
      } ${
        isIncomplete ? 'border-yellow-400 border-2' : ''
      }`}
    >
      {/* ヘッダー行：時間 + バッジ群 */}
      <div className="flex items-center justify-between mb-1">
        <span className={`font-mono text-xs ${event.is_cancelled ? 'line-through text-gray-500' : ''}`}>
          {event.start_time}-{event.end_time}
        </span>
        <div className="flex items-center gap-1">
          {/* 中止バッジ */}
          {event.is_cancelled && (
            <Badge variant="destructive" className="text-xs px-1 py-0">
              中止
            </Badge>
          )}
          
          {/* 予約者数バッジ */}
          {reservationCount > 0 && !event.is_cancelled && (
            <Badge className={`text-xs px-1 py-0 ${getReservationBadgeClass(reservationCount, maxCapacity)}`}>
              <Users className="w-3 h-3 mr-1" />
              {reservationCount}
            </Badge>
          )}
          
          {/* カテゴリバッジ */}
          <Badge className={`text-xs px-1 py-0 ${categoryConfig[event.category as keyof typeof categoryConfig]?.badgeColor || 'bg-gray-100 text-gray-800'} ${event.is_cancelled ? 'opacity-60' : ''}`}>
            {categoryConfig[event.category as keyof typeof categoryConfig]?.label || event.category}
          </Badge>
        </div>
      </div>
      
      {/* シナリオタイトル */}
      <div className={`font-medium line-clamp-2 mb-1 ${event.is_cancelled ? 'line-through text-gray-500' : ''}`}>
        {event.scenario || '未定'}
      </div>
      
      {/* GM情報 */}
      <div className={`text-xs text-muted-foreground mb-1 ${event.is_cancelled ? 'line-through' : ''}`}>
        GM: {event.gms.length > 0 ? event.gms.join(', ') : '未定'}
      </div>
      
      {/* ノート情報 */}
      {event.notes && (
        <div className={`text-xs text-muted-foreground truncate ${event.is_cancelled ? 'line-through' : ''}`}>
          {event.notes}
        </div>
      )}

      {/* 警告アイコン（右上） */}
      {isIncomplete && (
        <div className="absolute top-1 right-1">
          <AlertTriangle className="w-3 h-3 text-yellow-500" />
        </div>
      )}

      {/* アクションボタン（右下） */}
      {!event.is_cancelled ? (
        <Button
          variant="ghost"
          size="sm"
          className="absolute bottom-1 right-1 h-6 w-6 p-0 hover:bg-red-100 hover:text-red-600"
          onClick={(e) => {
            e.stopPropagation();
            onCancel?.(event);
          }}
        >
          <Ban className="w-3 h-3" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="absolute bottom-1 right-1 h-6 w-6 p-0 hover:bg-green-100 hover:text-green-600"
          onClick={(e) => {
            e.stopPropagation();
            onUncancel?.(event);
          }}
        >
          <Plus className="w-3 h-3" />
        </Button>
      )}
    </div>
  )
}
