import React from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Users, AlertTriangle } from 'lucide-react'
import { useLongPress } from '@/hooks/useLongPress'

// スケジュールイベントの型定義
interface ScheduleEvent {
  id: string
  date: string // YYYY-MM-DD
  venue: string // 店舗ID
  scenario: string
  gms: string[] // GMの名前の配列
  start_time: string // HH:MM
  end_time: string // HH:MM
  category: 'open' | 'private' | 'gmtest' | 'testplay' | 'offsite' | 'venue_rental' | 'venue_rental_free' | 'package' // 公演カテゴリ
  is_cancelled: boolean
  participant_count?: number
  max_participants?: number
  notes?: string
  is_reservation_enabled?: boolean
  is_private_request?: boolean // 貸切リクエストかどうか
  reservation_info?: string
  reservation_id?: string // 貸切リクエストの元のreservation ID
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
  onToggleReservation?: (event: ScheduleEvent) => void
  onContextMenu?: (event: ScheduleEvent, x: number, y: number) => void
}

function PerformanceCardBase({
  event,
  categoryConfig,
  getReservationBadgeClass,
  onCancelConfirm,
  onUncancel,
  onEdit,
  onDelete,
  onClick,
  onToggleReservation,
  onContextMenu
}: PerformanceCardProps) {
  const reservationCount = event.participant_count || 0
  const maxCapacity = event.max_participants || 8
  const isIncomplete = !event.scenario || event.gms.length === 0
  
  // 貸切リクエストの場合は紫色で表示
  const categoryColors = event.is_private_request 
    ? 'bg-purple-50'
    : (categoryConfig[event.category as keyof typeof categoryConfig]?.cardColor?.replace(/border-\S+/, '') ?? 'bg-gray-50')
  
  // バッジのテキストカラーを取得（例: 'bg-blue-100 text-blue-800' から 'text-blue-800' を抽出）
  const badgeTextColor = event.is_private_request
    ? 'text-purple-800'
    : (categoryConfig[event.category as keyof typeof categoryConfig]?.badgeColor?.split(' ').find(cls => cls.startsWith('text-')) ?? 'text-gray-800')
  
  // ボーダー色を取得（テキスト色から対応するボーダー色を生成）
  const borderColorClass = badgeTextColor.replace('text-', 'ring-')
  
  // 左ボーダーの色を決定（濃いめのカラー）
  const leftBorderColor = isIncomplete 
    ? 'border-l-red-600'  // アラート時は赤
    : event.is_cancelled
      ? 'border-l-gray-500'
      : event.is_private_request
        ? 'border-l-purple-600'
        : event.category === 'open'
          ? 'border-l-blue-600'
          : event.category === 'private'
            ? 'border-l-purple-600'
            : event.category === 'gmtest'
              ? 'border-l-orange-600'
              : event.category === 'testplay'
                ? 'border-l-yellow-600'
                : event.category === 'offsite'
                  ? 'border-l-green-600'
                  : 'border-l-gray-500'

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (onContextMenu) {
      onContextMenu(event, e.clientX, e.clientY)
    }
  }

  // 長押しでコンテキストメニューを表示（スマホ対応）
  // ドラッグ操作（onDragStart）と競合しないように、長押し判定は useLongPress で管理
  const longPressHandlers = useLongPress((x, y) => {
    if (onContextMenu) {
      onContextMenu(event, x, y)
    }
  })

  return (
    <div
      draggable={!event.is_cancelled}
      onDragStart={(e) => {
        if (event.is_cancelled) return
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('application/json', JSON.stringify(event))
      }}
      onContextMenu={handleContextMenu}
      {...longPressHandlers}
      className={`p-1 border-l-4 ${leftBorderColor} hover:shadow-sm transition-shadow relative ${
        event.is_cancelled 
          ? 'bg-gray-100 opacity-75 cursor-not-allowed' 
          : 'cursor-move'
      } ${categoryColors}`}
      style={{ margin: '0px' }}
      onClick={() => onClick?.(event)}
    >
      {/* ヘッダー行：時間 + バッジ群 */}
      <div className="flex items-center justify-between mb-0.5 gap-1">
        <span className={`font-mono text-xs lg:text-[10px] leading-none flex-shrink-0 ${event.is_cancelled ? 'line-through text-gray-500' : badgeTextColor}`}>
          {event.start_time.slice(0, 5)}-{event.end_time.slice(0, 5)}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0 min-w-0">
          {/* 中止バッジ */}
          {event.is_cancelled && (
            <Badge variant="cancelled" size="sm" className="font-normal text-xs px-1 py-0 h-4 whitespace-nowrap">
              中止
            </Badge>
          )}
          
          {/* 公開状況バッジ */}
          {!event.is_cancelled && (
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 transition-all cursor-pointer ${
                event.is_private_request 
                  ? 'bg-green-400' 
                  : event.is_reservation_enabled 
                    ? 'bg-green-400' 
                    : 'bg-gray-400'
              }`}
              title={
                event.is_private_request 
                  ? '貸切公演は常に公開中です' 
                  : event.is_reservation_enabled 
                    ? '予約サイトに公開中（クリックで非公開）' 
                    : '予約サイトに非公開（クリックで公開）'
              }
              onClick={(e) => {
                e.stopPropagation();
                if (!event.is_private_request) {
                  onToggleReservation?.(event);
                }
              }}
            />
          )}
        </div>
      </div>
      
      {/* シナリオタイトル */}
      <div className={`font-medium line-clamp-2 mb-0.5 text-xs lg:text-[10px] leading-tight text-left ${event.is_cancelled ? 'line-through text-gray-500' : badgeTextColor}`}>
        {event.scenario || '未定'}
      </div>
      
      {/* GM情報 */}
      <div className={`text-xs lg:text-[10px] mb-0 leading-tight text-left truncate ${event.is_cancelled ? 'line-through text-gray-500' : badgeTextColor}`}>
        {event.gms.length > 0 ? event.gms.join(', ') : '未定'}
      </div>
      
      {/* ノート情報 */}
      {event.notes && (
        <div className={`text-xs lg:text-[10px] truncate text-left leading-tight ${event.is_cancelled ? 'line-through text-gray-500' : badgeTextColor}`}>
          {event.notes}
        </div>
      )}

      {/* 右上ステータス群 */}
      <div className="absolute top-1 right-1 flex gap-1 items-center">
        {/* 警告アイコン */}
        {isIncomplete && (
          <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
        )}
      </div>

      {/* 右下：予約者数バッジ */}
      {!event.is_cancelled && !event.is_private_request && (
        <div className="absolute bottom-0.5 right-0.5">
          <Badge size="sm" className={`font-normal text-xs px-1 py-0 h-4 whitespace-nowrap ${
            reservationCount >= maxCapacity 
              ? 'bg-red-100 text-red-800' 
              : categoryConfig[event.category as keyof typeof categoryConfig]?.badgeColor || 'bg-gray-100 text-gray-800'
          }`}>
            {reservationCount < maxCapacity && (
              <Users className="w-3 h-3 mr-0.5 flex-shrink-0" />
            )}
            <span>{reservationCount >= maxCapacity ? '満席' : `${reservationCount}/${maxCapacity}`}</span>
          </Badge>
        </div>
      )}
    </div>
  )
}

export const PerformanceCard = React.memo(PerformanceCardBase)
