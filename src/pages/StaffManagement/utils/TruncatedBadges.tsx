import { Badge } from '@/components/ui/badge'

interface TruncatedBadgesProps {
  items: string[]
  getDisplayName: (item: string) => string
}

/**
 * シンプルなバッジ表示コンポーネント
 * カラム幅に応じて自然に折り返し、全体を表示
 */
export function TruncatedBadges({ items, getDisplayName }: TruncatedBadgesProps) {
  if (items.length === 0) {
    return <span className="text-xs text-muted-foreground">-</span>
  }

  // 最初の3つを表示、残りは+Nで表示
  const displayCount = 3
  const visibleItems = items.slice(0, displayCount)
  const remainingCount = items.length - displayCount

  return (
    <div className="flex items-center gap-1 flex-wrap overflow-hidden w-full">
      {visibleItems.map((item, index) => (
        <Badge
          key={index}
          size="sm"
          variant="secondary"
          className="font-normal text-xs px-1 py-0.5 bg-gray-100 border-0 rounded-[2px] whitespace-nowrap flex-shrink-0"
        >
          {getDisplayName(item)}
        </Badge>
      ))}
      {remainingCount > 0 && (
        <Badge
          size="sm"
          variant="secondary"
          className="font-normal text-xs px-1 py-0.5 bg-gray-100 border-0 rounded-[2px] whitespace-nowrap flex-shrink-0"
        >
          +{remainingCount}
        </Badge>
      )}
    </div>
  )
}
