import React from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Users, AlertTriangle } from 'lucide-react'

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

// カテゴリラベルの短縮表示（モバイル用）
function getCategoryShortLabel(
  category: string,
  categoryConfig: PerformanceCardProps['categoryConfig']
): string {
  const label = categoryConfig[category as keyof typeof categoryConfig]?.label || category
  const shortLabels: Record<string, string> = {
    'オープン公演': 'オ',
    '貸切公演': '貸',
    'GMテスト': 'G',
    'テストプレイ': 'テ',
    '出張公演': '出',
    '場所貸し': '場',
    '場所貸無料': '無',
    'パッケージ会': 'パ'
  }
  return shortLabels[label] || label.slice(0, 1)
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

  return (
    <div
      draggable={!event.is_cancelled}
      onDragStart={(e) => {
        if (event.is_cancelled) return
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('application/json', JSON.stringify(event))
      }}
      onContextMenu={handleContextMenu}
      className={`p-0.5 sm:p-1 border-l-2 sm:border-l-4 ${leftBorderColor} hover:shadow-sm transition-shadow text-[9px] sm:text-[10px] md:text-xs relative ${
        event.is_cancelled 
          ? 'bg-gray-100 opacity-75 cursor-not-allowed' 
          : 'cursor-move'
      } ${categoryColors}`}
      style={{ margin: '0px' }}
      onClick={() => onClick?.(event)}
    >
      {/* ヘッダー行：時間 + バッジ群 */}
      <div className="flex items-center justify-between mb-0 gap-0.5">
        <span className={`font-mono text-[9px] sm:text-[10px] md:text-xs leading-none flex-shrink-0 ${event.is_cancelled ? 'line-through text-gray-500' : badgeTextColor}`}>
          {event.start_time.slice(0, 5)}-{event.end_time.slice(0, 5)}
        </span>
        <div className="flex items-center gap-0.5 flex-shrink-0 min-w-0">
          {/* 中止バッジ */}
          {event.is_cancelled && (
            <Badge variant="cancelled" size="sm" className="font-normal text-[7px] sm:text-[8px] md:text-[9px] px-0 py-0 h-3 sm:h-4 whitespace-nowrap">
              中止
            </Badge>
          )}
          
          {/* 貸切リクエストの場合は何も表示しない（【貸切確定】は別の場所で表示される） */}
          {event.is_private_request ? null : (
            <>
              {/* 予約者数バッジ */}
              {!event.is_cancelled && (
                <Badge size="sm" className={`font-normal text-[7px] sm:text-[8px] md:text-[9px] px-0 py-0 h-3 sm:h-4 whitespace-nowrap ${
                  reservationCount >= maxCapacity 
                    ? 'bg-red-100 text-red-800' 
                    : categoryConfig[event.category as keyof typeof categoryConfig]?.badgeColor || 'bg-gray-100 text-gray-800'
                }`}>
                  <Users className="w-2 h-2 sm:w-2.5 sm:h-2.5 mr-0.5 flex-shrink-0" />
                  <span className="hidden sm:inline">{reservationCount >= maxCapacity ? '満席' : `${reservationCount}/${maxCapacity}`}</span>
                  <span className="sm:hidden">{reservationCount >= maxCapacity ? '満' : `${reservationCount}/${maxCapacity}`}</span>
                </Badge>
              )}
              
              {/* カテゴリバッジ */}
              <Badge variant="static" size="sm" className={`font-normal text-[7px] sm:text-[8px] md:text-[9px] px-0 py-0 h-3 sm:h-4 whitespace-nowrap overflow-hidden ${categoryConfig[event.category as keyof typeof categoryConfig]?.badgeColor || 'bg-gray-100 text-gray-800'} ${event.is_cancelled ? 'opacity-60' : ''}`}>
                <span className="hidden sm:inline truncate">{categoryConfig[event.category as keyof typeof categoryConfig]?.label || event.category}</span>
                <span className="sm:hidden">{getCategoryShortLabel(event.category, categoryConfig)}</span>
              </Badge>
            </>
          )}
        </div>
      </div>
      
      {/* シナリオタイトル */}
      <div className={`font-medium line-clamp-2 mb-0 text-[9px] sm:text-[10px] md:text-xs leading-tight text-left ${event.is_cancelled ? 'line-through text-gray-500' : badgeTextColor}`}>
        {event.scenario || '未定'}
      </div>
      
      {/* GM情報 */}
      <div className={`text-[9px] sm:text-[10px] md:text-xs mb-0 leading-tight text-left truncate ${event.is_cancelled ? 'line-through text-gray-500' : badgeTextColor}`}>
        GM: {event.gms.length > 0 ? event.gms.join(', ') : '未定'}
      </div>
      
      {/* ノート情報 */}
      {event.notes && (
        <div className={`text-[8px] sm:text-[9px] truncate text-left leading-tight ${event.is_cancelled ? 'line-through text-gray-500' : badgeTextColor}`}>
          {event.notes}
        </div>
      )}

      {/* 警告アイコン（右上） */}
      {isIncomplete && (
        <div className="absolute top-0.5 right-0.5">
          <AlertTriangle className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-red-600" />
        </div>
      )}

      {/* アクションボタン群（右下） */}
      <div className="absolute bottom-0 right-0 flex gap-0.5">
        {/* 予約サイト公開バッジ */}
        <Badge
          variant="outline"
          size="sm"
          className={`h-3 sm:h-4 px-0.5 sm:px-1 py-0 font-normal text-[8px] sm:text-[9px] transition-all ${
            event.is_private_request 
              ? 'bg-green-100 text-green-800 border-green-500 cursor-default' 
              : event.is_reservation_enabled 
                ? 'bg-green-100 text-green-800 border-green-500 cursor-pointer' 
                : 'bg-gray-100 text-gray-600 border-gray-400 cursor-pointer'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            // 貸切公演の場合はクリック不可
            if (!event.is_private_request) {
              onToggleReservation?.(event);
            }
          }}
          title={
            event.is_private_request 
              ? '貸切公演は常に公開中です' 
              : event.is_reservation_enabled 
                ? '予約サイトに公開中（クリックで非公開）' 
                : '予約サイトに非公開（クリックで公開）'
          }
        >
          <span className="hidden sm:inline">{event.is_reservation_enabled || event.is_private_request ? '公開中' : '公開前'}</span>
          <span className="sm:hidden">{event.is_reservation_enabled || event.is_private_request ? '公開' : '前'}</span>
        </Badge>
      </div>
    </div>
  )
}

export const PerformanceCard = React.memo(PerformanceCardBase)
