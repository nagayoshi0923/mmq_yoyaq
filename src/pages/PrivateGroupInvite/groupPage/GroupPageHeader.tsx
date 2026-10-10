/**
 * グループページの見出し（刷新 段階 1）: ‹ 戻る／作品名／「貸切・参加 4/6名・あなたが主催」／右に ⋮。
 */
import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'

interface GroupPageHeaderProps {
  title: string
  /** 「貸切・参加 4/6名・あなたが主催」 */
  subtitle: string
  /** 戻る先が無い（ゲスト）ときは null */
  onBack: (() => void) | null
  backLabel: string
  onOpenScenario?: () => void
  /** 右の ⋮（主催者は「操作」メニュー、メンバーは設定シート） */
  menu: ReactNode
}

export function GroupPageHeader({ title, subtitle, onBack, backLabel, onOpenScenario, menu }: GroupPageHeaderProps) {
  return (
    <div className="shrink-0 bg-card border-b border-border px-3 lg:px-6 py-2 flex items-center gap-2.5" data-testid="group-page-header">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="-ml-1 flex items-center gap-0.5 rounded-md p-1 text-foreground/80 hover:bg-muted"
          aria-label={backLabel}
          title={backLabel}
        >
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          <span className="hidden lg:inline text-sm">{backLabel}</span>
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1
          className={`text-base font-bold leading-tight truncate ${onOpenScenario ? 'cursor-pointer hover:text-primary' : ''}`}
          onClick={onOpenScenario}
        >
          {title}
        </h1>
        <p className="text-xs text-muted-foreground truncate" data-testid="group-page-subtitle">{subtitle}</p>
      </div>
      {menu}
    </div>
  )
}
