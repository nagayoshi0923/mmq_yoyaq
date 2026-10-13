/**
 * チャットの上に固定するピン留め（最新の 1 件）。押すとその発言へ、主催者は外せる。2 件以上あれば一覧へ。
 */
import { Pin, X } from 'lucide-react'
import type { PrivateGroupMessage } from '@/types'
import { quoteText } from './chatModel'

interface PinnedBarProps {
  pinned: PrivateGroupMessage[]
  nameOf: (memberId: string | null) => string
  canUnpin: boolean
  onJump: (messageId: string) => void
  onUnpin: (messageId: string) => void
  onOpenList?: () => void
}

export function PinnedBar({ pinned, nameOf, canUnpin, onJump, onUnpin, onOpenList }: PinnedBarProps) {
  const top = pinned[0]
  if (!top) return null
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-purple-100 bg-purple-50 text-xs text-purple-900" data-testid="chat-pinned-bar">
      <Pin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <button type="button" className="flex-1 min-w-0 text-left truncate" onClick={() => onJump(top.id)}>
        {quoteText(nameOf(top.member_id), top)}
      </button>
      {pinned.length > 1 && onOpenList && (
        <button type="button" className="shrink-0 underline" onClick={onOpenList}>ほか {pinned.length - 1} 件</button>
      )}
      {canUnpin && (
        <button type="button" className="w-6 h-6 shrink-0 flex items-center justify-center rounded-full hover:bg-purple-100" onClick={() => onUnpin(top.id)} aria-label="ピン留めを外す">
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
