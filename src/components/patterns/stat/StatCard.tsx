import { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: ReactNode
  icon?: LucideIcon
  /** 数値の色調（未対応件数の警告など） */
  tone?: 'default' | 'success' | 'warning' | 'destructive'
  className?: string
}

const TONE_CLASS = {
  default: '',
  success: 'text-green-600',
  warning: 'text-amber-600',
  destructive: 'text-destructive',
} as const

/**
 * 統計サマリーカードの定型
 *
 * ラベル text-xs muted / 数値 text-2xl font-bold 左寄せ / CardContent p-4（デザイン規約 5.1）。
 * StatGrid と組み合わせて使う。
 */
export function StatCard({ label, value, icon: Icon, tone = 'default', className }: StatCardProps) {
  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{label}</p>
          {Icon && <Icon className="h-4 w-4 text-muted-foreground/50" aria-hidden="true" />}
        </div>
        <p className={cn('mt-1 text-2xl font-bold leading-none', TONE_CLASS[tone])}>{value}</p>
      </CardContent>
    </Card>
  )
}

/**
 * StatCard を並べるグリッド（grid gap-4 / 2列 → md 4列）
 */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 gap-4 md:grid-cols-4', className)}>{children}</div>
}
