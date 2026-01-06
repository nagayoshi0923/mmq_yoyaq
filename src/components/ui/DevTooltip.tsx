/**
 * 開発者モード用ツールチップ
 * data-db属性を持つ要素にホバーで要素の右横にDB情報を表示
 */
import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

interface TooltipState {
  text: string
  x: number
  y: number
}

export function DevTooltip() {
  const { user } = useAuth()
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const isDevMode = user?.role === 'license_admin'

  useEffect(() => {
    if (!isDevMode) return

    const handleMouseEnter = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const dbElement = target.closest('[data-db]') as HTMLElement | null
      
      if (dbElement) {
        const rect = dbElement.getBoundingClientRect()
        const dbAttr = dbElement.getAttribute('data-db')
        
        if (dbAttr) {
          // 要素の右横に表示（画面右端を超える場合は左に表示）
          let x = rect.right + 8
          if (x + 200 > window.innerWidth) {
            x = rect.left - 200 - 8
          }
          
          setTooltip({
            text: dbAttr,
            x: Math.max(8, x),
            y: rect.top + rect.height / 2,
          })
        }
      }
    }

    const handleMouseLeave = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-db]')) {
        setTooltip(null)
      }
    }

    document.addEventListener('mouseenter', handleMouseEnter, true)
    document.addEventListener('mouseleave', handleMouseLeave, true)
    
    return () => {
      document.removeEventListener('mouseenter', handleMouseEnter, true)
      document.removeEventListener('mouseleave', handleMouseLeave, true)
    }
  }, [isDevMode])

  if (!isDevMode || !tooltip) return null

  return (
    <div
      style={{
        position: 'fixed',
        left: tooltip.x,
        top: tooltip.y,
        transform: 'translateY(-50%)',
        zIndex: 99999,
        pointerEvents: 'none',
      }}
      className="px-2 py-1 bg-slate-800 text-white text-xs font-mono rounded shadow-lg whitespace-nowrap"
    >
      📊 {tooltip.text}
    </div>
  )
}

