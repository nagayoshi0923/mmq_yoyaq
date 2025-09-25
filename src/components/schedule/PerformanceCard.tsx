import React from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Users, Ban, Plus, AlertTriangle, Trash2 } from 'lucide-react'

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
  is_cancelled: boolean
  participant_count?: number
  max_participants?: number
  notes?: string
}

interface PerformanceCardProps {
  event: ScheduleEvent
  categoryConfig: {
    [key: string]: {
      label: string
      badgeColor: string
      cardColor: string
    }
  }
  getReservationBadgeClass: (current: number, max: number) => string
  onCancelConfirm?: (event: ScheduleEvent) => void
  onUncancel?: (event: ScheduleEvent) => void
  onEdit?: (event: ScheduleEvent) => void
  onDelete?: (event: ScheduleEvent) => void
  onClick?: (event: ScheduleEvent) => void
}

export function PerformanceCard({
  event,
  categoryConfig,
  getReservationBadgeClass,
  onCancelConfirm,
  onUncancel,
  onEdit,
  onDelete,
  onClick
}: PerformanceCardProps) {
  const reservationCount = event.participant_count || 0
  const maxCapacity = event.max_participants || 8
  const isIncomplete = !event.scenario || event.gms.length === 0
  
  // デバッグ用ログ
  console.log('PerformanceCard Debug:', {
    eventId: event.id,
    participant_count: event.participant_count,
    reservationCount,
    is_cancelled: event.is_cancelled
  })
  
  // 公演カテゴリ色を取得
  const categoryColors = categoryConfig[event.category as keyof typeof categoryConfig]?.cardColor || 'bg-gray-50 border-gray-200'
  
  // バッジのテキストカラーを取得（例: 'bg-blue-100 text-blue-800' から 'text-blue-800' を抽出）
  const badgeTextColor = categoryConfig[event.category as keyof typeof categoryConfig]?.badgeColor.split(' ').find(cls => cls.startsWith('text-')) || 'text-gray-800'

  return (
    <div
      className={`p-2 border rounded-md hover:shadow-sm transition-shadow text-xs relative cursor-pointer ${
        event.is_cancelled 
          ? 'bg-gray-100 border-gray-300 opacity-75' 
          : categoryColors
      } ${
        isIncomplete ? 'border-yellow-400 border-2' : ''
      }`}
      onClick={() => onClick?.(event)}
    >
      {/* ヘッダー行：時間 + バッジ群 */}
      <div className="flex items-center justify-between mb-1">
        <span className={`font-mono text-xs ${event.is_cancelled ? 'line-through text-gray-500' : badgeTextColor}`}>
          {event.start_time.slice(0, 5)}-{event.end_time.slice(0, 5)}
        </span>
        <div className="flex items-center gap-1">
          {/* 中止バッジ */}
          {event.is_cancelled && (
            <Badge variant="cancelled" size="sm" className="font-normal">
              中止
              <Ban className="w-3 h-3 ml-1" />
            </Badge>
          )}
          
          {/* 予約者数バッジ */}
          {(reservationCount > 0 || true) && !event.is_cancelled && (
            <Badge variant="static" size="sm" className={`font-normal ${categoryConfig[event.category as keyof typeof categoryConfig]?.badgeColor || 'bg-gray-100 text-gray-800'}`}>
              <Users className="w-3 h-3 mr-1" />
              {reservationCount}
            </Badge>
          )}
          
          {/* カテゴリバッジ */}
          <Badge variant="static" size="sm" className={`font-normal ${categoryConfig[event.category as keyof typeof categoryConfig]?.badgeColor || 'bg-gray-100 text-gray-800'} ${event.is_cancelled ? 'opacity-60' : ''}`}>
            {categoryConfig[event.category as keyof typeof categoryConfig]?.label || event.category}
          </Badge>
        </div>
      </div>
      
      {/* シナリオタイトル */}
      <div className={`font-medium line-clamp-2 mb-1 text-left ${event.is_cancelled ? 'line-through text-gray-500' : badgeTextColor}`}>
        {event.scenario || '未定'}
      </div>
      
      {/* GM情報 */}
      <div className={`text-xs mb-1 text-left ${event.is_cancelled ? 'line-through text-gray-500' : badgeTextColor}`}>
        GM: {event.gms.length > 0 ? event.gms.join(', ') : '未定'}
      </div>
      
      {/* ノート情報 */}
      {event.notes && (
        <div className={`text-xs truncate text-left ${event.is_cancelled ? 'line-through text-gray-500' : badgeTextColor}`}>
          {event.notes}
        </div>
      )}

      {/* 警告アイコン（右上） */}
      {isIncomplete && (
        <div className="absolute top-1 right-1">
          <AlertTriangle className="w-3 h-3 text-yellow-500" />
        </div>
      )}

      {/* アクションボタン群（右下） */}
      <div className="absolute bottom-1 right-1 flex gap-1">
        {/* 削除ボタン */}
        <Button
          variant="ghost"
          size="sm"
          className={`h-6 w-6 p-0 hover:bg-red-100 hover:text-red-600 ${badgeTextColor}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.(event);
          }}
        >
          <Trash2 className={`w-3 h-3 ${badgeTextColor}`} />
        </Button>
        
        {/* キャンセル/復活ボタン */}
        {!event.is_cancelled ? (
          <Button
            variant="ghost"
            size="sm"
            className={`h-6 w-6 p-0 hover:bg-orange-100 hover:text-orange-600 ${badgeTextColor}`}
            onClick={(e) => {
              e.stopPropagation();
              onCancelConfirm?.(event);
            }}
          >
            <Ban className={`w-3 h-3 ${badgeTextColor}`} />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className={`h-6 w-6 p-0 hover:bg-green-100 hover:text-green-600 ${badgeTextColor}`}
            onClick={(e) => {
              e.stopPropagation();
              onUncancel?.(event);
            }}
          >
            <Plus className={`w-3 h-3 ${badgeTextColor}`} />
          </Button>
        )}
      </div>
    </div>
  )
}
