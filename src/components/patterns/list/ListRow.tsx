import { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ListRowProps {
  /** 左端のメディア（アバター/サムネイル等） */
  media?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  /** タイトル横のバッジ群 */
  badges?: ReactNode
  /** 右側のメタ情報（金額・日付等） */
  meta?: ReactNode
  /** 右端のアクション（クリックは行トグルへ伝播しない） */
  trailing?: ReactNode
  /** 展開コンテンツ（children）を持つ場合に onToggle とセットで指定 */
  expanded?: boolean
  onToggle?: () => void
  onClick?: () => void
  className?: string
  /** 展開部のコンテンツ */
  children?: ReactNode
}

/**
 * 一覧の1行（展開式対応）の定型
 *
 * 行=rounded-lg border p-3、展開部=bg-muted/20 p-4（デザイン規約 5.1）。
 * 顧客行・予約行・メールログ行など「左に主情報・右にメタ・クリックで展開」の共通化先。
 */
export function ListRow({
  media,
  title,
  subtitle,
  badges,
  meta,
  trailing,
  expanded,
  onToggle,
  onClick,
  className,
  children,
}: ListRowProps) {
  const handleActivate = onToggle ?? onClick
  return (
    <div className={cn('overflow-hidden rounded-lg border bg-card', className)}>
      <div
        className={cn(
          'flex items-center gap-3 p-3',
          handleActivate && 'cursor-pointer transition-colors hover:bg-muted/50'
        )}
        onClick={handleActivate}
      >
        {media && <div className="shrink-0">{media}</div>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{title}</span>
            {badges}
          </div>
          {subtitle && <div className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</div>}
        </div>
        {meta && <div className="shrink-0 text-right text-xs text-muted-foreground">{meta}</div>}
        {trailing && (
          <div className="shrink-0" onClick={e => e.stopPropagation()}>
            {trailing}
          </div>
        )}
        {onToggle && (
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              expanded && 'rotate-180'
            )}
            aria-hidden="true"
          />
        )}
      </div>
      {expanded && children && <div className="border-t bg-muted/20 p-4">{children}</div>}
    </div>
  )
}
