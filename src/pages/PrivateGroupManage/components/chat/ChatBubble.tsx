/**
 * 参加者の発言 1 件（グループページ刷新 段階 2）。
 * 返信の引用・写真・本文・時刻・既読の人数（自分の発言だけ、人数のみ）・リアクション。
 * 長押し（PC は右クリックかホバーの「…」）でメニューを開く。
 */
import { useRef } from 'react'
import { MoreHorizontal, Pin } from 'lucide-react'
import type { PrivateGroupMessage } from '@/types'
import type { ChatReactionRow } from '@/lib/privateGroupChat'
import { renderMessageWithLinks } from '../renderMessageWithLinks'
import { PhotoGrid } from './PhotoGrid'

const LONG_PRESS_MS = 450

interface ChatBubbleProps {
  msg: PrivateGroupMessage
  isOwn: boolean
  name: string
  isGuest: boolean
  time: string
  quote: string | null
  onQuoteClick?: () => void
  reactions: ChatReactionRow[]
  readCount: number | null
  urlOf: (messageId: string, position: number) => string | null
  onOpenPhoto: (position: number) => void
  onOpenMenu: () => void
  onToggleReaction: (emoji: string) => void
}

export function ChatBubble(props: ChatBubbleProps) {
  const { msg, isOwn, name, isGuest, time, quote, onQuoteClick, reactions, readCount, urlOf, onOpenPhoto, onOpenMenu, onToggleReaction } = props
  const timer = useRef<number | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const longPressed = useRef(false)
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    start.current = null
  }
  const pressHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      longPressed.current = false
      start.current = { x: e.clientX, y: e.clientY }
      timer.current = window.setTimeout(() => {
        longPressed.current = true
        timer.current = null
        navigator.vibrate?.(10)
        onOpenMenu()
      }, LONG_PRESS_MS)
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) clear()
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault()
      clear()
      onOpenMenu()
    },
    // 長押しで開いたあとのクリック（写真の拡大など）は無視する
    onClickCapture: (e: React.MouseEvent) => {
      if (longPressed.current) {
        e.stopPropagation()
        e.preventDefault()
        longPressed.current = false
      }
    },
  }
  const photos = msg.photos ?? []
  const text = msg.message
  const meta = (
    <span className={`text-xs leading-tight text-muted-foreground shrink-0 pb-0.5 ${isOwn ? 'text-right' : ''}`}>
      {time}
      {readCount !== null && readCount > 0 && <><br /><span data-testid="chat-read-count">既読 {readCount}</span></>}
    </span>
  )
  return (
    <div className={`group flex gap-2 items-end mt-2 ${isOwn ? 'flex-row-reverse' : ''}`} id={`chat-msg-${msg.id}`} data-testid="chat-message" data-own={isOwn ? 'true' : 'false'}>
      {!isOwn && (
        <span className="w-8 h-8 rounded-full bg-purple-100 text-purple-800 text-xs font-bold flex items-center justify-center shrink-0 mb-5" aria-hidden="true">
          {[...name][0] ?? '?'}
        </span>
      )}
      <div className={`flex flex-col gap-1 max-w-[78%] min-w-0 ${isOwn ? 'items-end' : 'items-start'}`}>
        {!isOwn && (
          <span className="text-xs text-muted-foreground pl-1 flex items-center gap-1">
            {name}
            {isGuest && <span className="px-1.5 rounded-full bg-muted text-xs">ゲスト</span>}
          </span>
        )}
        <div className={`flex items-end gap-1.5 max-w-full min-w-0 ${isOwn ? 'flex-row-reverse' : ''}`}>
          <div className="flex flex-col gap-1 min-w-0 max-w-full select-none [-webkit-touch-callout:none]" {...pressHandlers} data-testid="chat-bubble">
            {photos.length > 0 && <PhotoGrid messageId={msg.id} photos={photos} urlOf={urlOf} onOpen={onOpenPhoto} />}
            {(text || quote) && (
              <div className={`max-w-full min-w-0 overflow-hidden px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${isOwn ? 'bg-purple-600 text-white rounded-br-md' : 'bg-card border border-border text-foreground rounded-bl-md'}`}>
                {quote && (
                  <button
                    type="button"
                    onClick={onQuoteClick}
                    className={`block max-w-[60vw] lg:max-w-xs text-left text-xs rounded-md px-2 py-1 mb-1 truncate ${isOwn ? 'bg-purple-500 text-white' : 'bg-purple-50 text-purple-800'}`}
                    data-testid="chat-quote"
                  >
                    {quote}
                  </button>
                )}
                {text && renderMessageWithLinks(text)}
              </div>
            )}
          </div>
          {meta}
          <button
            type="button"
            onClick={onOpenMenu}
            className="hidden lg:group-hover:flex w-7 h-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted shrink-0 self-center"
            aria-label="メッセージの操作"
            data-testid="chat-message-menu"
          >
            <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        {(reactions.length > 0 || msg.pinned_at) && (
          <div className={`flex flex-wrap gap-1 -mt-1.5 ${isOwn ? 'pr-1.5 justify-end' : 'pl-1.5'}`}>
            {msg.pinned_at && (
              <span className="inline-flex items-center gap-0.5 rounded-full border border-purple-200 bg-purple-50 text-purple-800 px-1.5 text-xs">
                <Pin className="w-3 h-3" aria-hidden="true" />ピン留め
              </span>
            )}
            {reactions.map(r => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => onToggleReaction(r.emoji)}
                className={`inline-flex items-center gap-1 rounded-full border px-1.5 text-xs leading-5 ${r.mine ? 'border-purple-300 bg-purple-50' : 'border-border bg-card'}`}
                aria-label={`${r.emoji} ${r.count}${r.mine ? '（自分も付けています）' : ''}`}
                data-testid="chat-reaction"
              >
                <span>{r.emoji}</span>
                <span className="text-muted-foreground">{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
