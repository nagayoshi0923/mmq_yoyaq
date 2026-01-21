import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Bell, Check, CheckCheck, Calendar, Clock, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useNotifications, Notification } from '@/hooks/useNotifications'
import { formatDistanceToNow } from 'date-fns'
import { ja } from 'date-fns/locale'

interface NotificationDropdownProps {
  className?: string
}

export function NotificationDropdown({ className }: NotificationDropdownProps) {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 0, right: 0 })
  const { notifications, loading, unreadCount, markAsRead, markAllAsRead } = useNotifications()

  // ドロップダウンの位置を計算
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      })
    }
  }, [isOpen])

  // 外クリックで閉じる
  const handleClickOutside = useCallback((event: MouseEvent) => {
    const target = event.target as Node
    if (
      dropdownRef.current && !dropdownRef.current.contains(target) &&
      buttonRef.current && !buttonRef.current.contains(target)
    ) {
      setIsOpen(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      // 次のティックでリスナーを追加（開くクリックと競合しないように）
      const timer = setTimeout(() => {
        document.addEventListener('click', handleClickOutside)
      }, 0)
      return () => {
        clearTimeout(timer)
        document.removeEventListener('click', handleClickOutside)
      }
    }
  }, [isOpen, handleClickOutside])

  // ESCキーで閉じる
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  // 通知アイコンの取得
  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'reservation_confirmed':
        return <Check className="h-4 w-4 text-green-500" />
      case 'reservation_reminder':
        return <Calendar className="h-4 w-4 text-blue-500" />
      case 'waitlist_available':
        return <AlertCircle className="h-4 w-4 text-amber-500" />
      case 'reservation_cancelled':
        return <Clock className="h-4 w-4 text-red-500" />
      default:
        return <Bell className="h-4 w-4 text-gray-500" />
    }
  }

  // 通知クリック時の処理
  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id)
    if (notification.link) {
      navigate(notification.link)
    }
    setIsOpen(false)
  }

  // ドロップダウンコンテンツ（Portal用）
  const dropdownContent = (
    <>
      {/* オーバーレイ（外クリック用） */}
      <div 
        className="fixed inset-0"
        style={{ zIndex: 9998 }}
        onClick={() => setIsOpen(false)}
      />
      {/* ドロップダウン本体 */}
      <div 
        ref={dropdownRef}
        className="w-80 bg-white shadow-xl border border-gray-200 overflow-hidden"
        style={{ 
          position: 'fixed',
          top: position.top,
          right: position.right,
          zIndex: 9999,
        }}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-white">
          <h3 className="font-medium text-sm text-gray-900">通知</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                markAllAsRead()
              }}
              className="h-7 text-xs text-[#E60012] hover:text-[#CC0010] hover:bg-red-50"
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              すべて既読
            </Button>
          )}
        </div>

        {/* 通知リスト */}
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-sm text-gray-500">
              読み込み中...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-6 text-center">
              <Bell className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500 mb-1">通知はありません</p>
              <p className="text-xs text-gray-400">
                予約確定やキャンセル待ちの<br />お知らせがここに届きます
              </p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={`px-4 py-3 border-b border-gray-100 last:border-b-0 cursor-pointer hover:bg-red-50/50 transition-colors ${
                  !notification.read ? 'bg-red-50/30' : ''
                }`}
              >
                <div className="flex gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-tight ${!notification.read ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
                      {notification.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                      {notification.message}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1.5">
                      {formatDistanceToNow(notification.timestamp, { addSuffix: true, locale: ja })}
                    </p>
                  </div>
                  {!notification.read && (
                    <div className="flex-shrink-0">
                      <div className="h-2 w-2 bg-[#E60012]" />
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* フッター */}
        {notifications.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigate('/mypage')
                setIsOpen(false)
              }}
              className="w-full h-8 text-xs text-[#E60012] hover:text-[#CC0010] hover:bg-red-50"
            >
              マイページで予約を確認
            </Button>
          </div>
        )}
      </div>
    </>
  )

  return (
    <div className={`relative ${className || ''}`}>
      {/* ベルアイコンボタン */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center justify-center h-8 w-8 hover:bg-white/10 transition-colors text-white relative"
        title="通知"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] bg-red-500 hover:bg-red-500 border-0">
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </button>

      {/* ドロップダウン - Portalでbody直下にレンダリング */}
      {isOpen && createPortal(dropdownContent, document.body)}
    </div>
  )
}
