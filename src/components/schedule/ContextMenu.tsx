import React, { useEffect, useRef } from 'react'
import { Copy, Clipboard } from 'lucide-react'

interface ContextMenuProps {
  x: number
  y: number
  onClose: () => void
  items: Array<{
    label: string
    icon?: React.ReactNode
    onClick: () => void
    disabled?: boolean
    separator?: boolean
  }>
}

export function ContextMenu({ x, y, onClose, items = [] }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // マウスとタッチの両方に対応
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    // マウスとタッチの両方のイベントを監視
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  // メニューの位置を画面内に収める
  const adjustedX = Math.min(x, window.innerWidth - 180) // メニュー幅 + マージン
  const adjustedY = Math.min(y, window.innerHeight - 200) // メニュー高さの概算 + マージン

  return (
    <div
      ref={menuRef}
      className="fixed bg-white shadow-lg rounded-md border border-gray-200 py-1 z-50 min-w-[160px]"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {item.separator && <div className="h-px bg-gray-200 my-1" />}
          <button
            className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${
              item.disabled
                ? 'text-gray-400 cursor-not-allowed'
                : 'hover:bg-gray-100 text-gray-700'
            }`}
            onClick={() => {
              if (!item.disabled) {
                item.onClick()
                onClose()
              }
            }}
            disabled={item.disabled}
          >
            {item.icon}
            {item.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  )
}

export { Copy, Clipboard }

