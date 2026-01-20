import { useState, useRef, useEffect } from 'react'
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
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { notifications, loading, unreadCount, markAsRead, markAllAsRead } = useNotifications()

  // クリック外で閉じる
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* ベルアイコンボタン */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center justify-center h-8 w-8 hover:bg-white/10 transition-colors text-white relative"
        title="通知"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <Badge 
            className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] bg-red-500 hover:bg-red-500 border-0"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </button>

      {/* ドロップダウン */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-lg shadow-lg border z-50 overflow-hidden">
          {/* ヘッダー */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
            <h3 className="font-medium text-sm text-gray-900">通知</h3>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                className="h-7 text-xs text-blue-600 hover:text-blue-700"
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
              <div className="p-8 text-center">
                <Bell className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">通知はありません</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`px-4 py-3 border-b last:border-b-0 cursor-pointer hover:bg-gray-50 transition-colors ${
                    !notification.read ? 'bg-blue-50/50' : ''
                  }`}
                >
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!notification.read ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
                        {notification.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {notification.message}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDistanceToNow(notification.timestamp, { addSuffix: true, locale: ja })}
                      </p>
                    </div>
                    {!notification.read && (
                      <div className="flex-shrink-0">
                        <div className="h-2 w-2 rounded-full bg-blue-500" />
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* フッター */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t bg-gray-50">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  navigate('/mypage')
                  setIsOpen(false)
                }}
                className="w-full h-8 text-xs text-gray-600"
              >
                マイページで予約を確認
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

