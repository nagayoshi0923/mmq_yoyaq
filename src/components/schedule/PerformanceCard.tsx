import React from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Users, Ban, Plus, AlertTriangle, Trash2, Globe, Check } from 'lucide-react'

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
}

export function PerformanceCard({
  event,
  categoryConfig,
  getReservationBadgeClass,
  onCancelConfirm,
  onUncancel,
  onEdit,
  onDelete,
  onClick,
  onToggleReservation
}: PerformanceCardProps) {
  const reservationCount = event.participant_count || 0
  const maxCapacity = event.max_participants || 8
  const isIncomplete = !event.scenario || event.gms.length === 0
  
  // 貸切リクエストの場合は紫色で表示
  const categoryColors = event.is_private_request 
    ? 'bg-purple-50'
    : categoryConfig[event.category as keyof typeof categoryConfig]?.cardColor.replace(/border-\S+/, '') || 'bg-gray-50'
  
  // バッジのテキストカラーを取得（例: 'bg-blue-100 text-blue-800' から 'text-blue-800' を抽出）
  const badgeTextColor = event.is_private_request
    ? 'text-purple-800'
    : categoryConfig[event.category as keyof typeof categoryConfig]?.badgeColor.split(' ').find(cls => cls.startsWith('text-')) || 'text-gray-800'
  
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

  return (
    <div
      className={`p-1 h-full w-full border-l-4 ${leftBorderColor} hover:shadow-sm transition-shadow text-xs relative cursor-pointer mb-1 ${
        event.is_cancelled 
          ? 'bg-gray-100 opacity-75' 
          : categoryColors
      }`}
      onClick={() => onClick?.(event)}
    >
      {/* ヘッダー行：時間 + バッジ群 */}
      <div className="flex items-center justify-between mb-0.5">
        <span className={`font-mono text-xs ${event.is_cancelled ? 'line-through text-gray-500' : badgeTextColor}`}>
          {event.start_time.slice(0, 5)}-{event.end_time.slice(0, 5)}
        </span>
        <div className="flex items-center gap-0.5">
          {/* 中止バッジ */}
          {event.is_cancelled && (
            <Badge variant="cancelled" size="sm" className="font-normal">
              中止
              <Ban className="w-3 h-3 ml-1" />
            </Badge>
          )}
          
          {/* 貸切リクエストの場合は何も表示しない（【貸切確定】は別の場所で表示される） */}
          {event.is_private_request ? null : (
            <>
              {/* 予約者数バッジ */}
              {!event.is_cancelled && (
                <Badge size="sm" className={`font-normal ${
                  reservationCount >= maxCapacity 
                    ? 'bg-red-100 text-red-800' 
                    : categoryConfig[event.category as keyof typeof categoryConfig]?.badgeColor || 'bg-gray-100 text-gray-800'
                }`}>
                  <Users className="w-3 h-3 mr-1" />
                  {reservationCount >= maxCapacity ? '満席' : `${reservationCount}/${maxCapacity}`}
                </Badge>
              )}
              
              {/* カテゴリバッジ */}
              <Badge variant="static" size="sm" className={`font-normal ${categoryConfig[event.category as keyof typeof categoryConfig]?.badgeColor || 'bg-gray-100 text-gray-800'} ${event.is_cancelled ? 'opacity-60' : ''}`}>
                {categoryConfig[event.category as keyof typeof categoryConfig]?.label || event.category}
              </Badge>
            </>
          )}
        </div>
      </div>
      
      {/* シナリオタイトル */}
      <div className={`font-medium line-clamp-2 mb-0.5 text-left ${event.is_cancelled ? 'line-through text-gray-500' : badgeTextColor}`}>
        {event.scenario || '未定'}
      </div>
      
      {/* GM情報 */}
      <div className={`text-xs mb-0.5 text-left ${event.is_cancelled ? 'line-through text-gray-500' : badgeTextColor}`}>
        GM: {event.gms.length > 0 ? event.gms.join(', ') : '未定'}
      </div>
      
      {/* ノート情報 */}
      {event.notes && (
        <div className={`text-[10px] truncate text-left ${event.is_cancelled ? 'line-through text-gray-500' : badgeTextColor}`}>
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
      <div className="absolute bottom-0.5 right-0.5 flex gap-0.5">
        {/* 予約サイト公開バッジ */}
        <Badge
          variant="outline"
          size="sm"
          className={`h-5 px-1.5 py-0 font-normal transition-all ${
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
          {event.is_reservation_enabled || event.is_private_request ? '公開中' : '公開前'}
        </Badge>
        
        {/* 削除ボタン */}
        <button
          className={`h-5 w-5 rounded flex items-center justify-center ring-1 ring-inset ${borderColorClass} transition-all`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.(event);
          }}
          title="公演を削除"
        >
          <Trash2 className={`w-3 h-3 ${badgeTextColor}`} />
        </button>
        
        {/* キャンセル/復活ボタン */}
        {!event.is_cancelled ? (
          <button
            className={`h-5 w-5 rounded flex items-center justify-center ring-1 ring-inset ${borderColorClass} transition-all`}
            onClick={(e) => {
              e.stopPropagation();
              onCancelConfirm?.(event);
            }}
            title="公演を中止"
          >
            <Ban className={`w-3 h-3 ${badgeTextColor}`} />
          </button>
        ) : (
          <button
            className={`h-5 w-5 rounded flex items-center justify-center ring-1 ring-inset ${borderColorClass} transition-all`}
            onClick={(e) => {
              e.stopPropagation();
              onUncancel?.(event);
            }}
            title="公演を復活"
          >
            <Plus className={`w-3 h-3 ${badgeTextColor}`} />
          </button>
        )}
      </div>
    </div>
  )
}
