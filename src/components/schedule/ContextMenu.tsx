import React, { useEffect, useRef, useState, useLayoutEffect } from 'react'
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
  const [position, setPosition] = useState({ x, y, flipUp: false })

  // メニューの高さを測定して位置を調整
  useLayoutEffect(() => {
    if (menuRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect()
      const menuWidth = menuRect.width || 140
      const menuHeight = menuRect.height || 150
      const margin = 8

      // 横方向の調整
      let adjustedX = x
      if (x + menuWidth > window.innerWidth - margin) {
        adjustedX = window.innerWidth - menuWidth - margin
      }
      adjustedX = Math.max(margin, adjustedX)

      // 縦方向の調整（下にはみ出る場合は上に表示）
      let adjustedY = y
      let flipUp = false
      if (y + menuHeight > window.innerHeight - margin) {
        // 上に表示
        adjustedY = y - menuHeight
        flipUp = true
        // 上にもはみ出る場合は画面上端に
        if (adjustedY < margin) {
          adjustedY = margin
          flipUp = false
        }
      }

      setPosition({ x: adjustedX, y: adjustedY, flipUp })
    }
  }, [x, y, items.length])

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

  return (
    <div
      ref={menuRef}
      className="fixed bg-white shadow-lg rounded border border-gray-200 py-0.5 z-50 min-w-[120px] max-w-[180px]"
      style={{ left: position.x, top: position.y }}
    >
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {item.separator && <div className="h-px bg-gray-200 my-0.5" />}
          <button
            className={`w-full px-2.5 py-1 text-left text-xs flex items-center gap-1.5 ${
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
            {item.icon && <span className="w-3.5 h-3.5 flex-shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5">{item.icon}</span>}
            <span className="truncate">{item.label}</span>
          </button>
        </React.Fragment>
      ))}
    </div>
  )
}

export { Copy, Clipboard }

