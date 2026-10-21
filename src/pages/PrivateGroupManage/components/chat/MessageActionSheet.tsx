/**
 * 発言の長押しメニュー（PC は右クリックかホバーの「…」）。
 * 上段にリアクション 5 種と「＋」、下に 返信／コピー／ピン留め（主催者）／写真を保存（写真のとき）／削除（自分の発言だけ）。
 */
import { useState } from 'react'
import { Copy, Download, Pin, PinOff, Plus, Reply, Trash2 } from 'lucide-react'
import { QUICK_REACTIONS } from './chatModel'
import { EmojiGrid } from './EmojiPicker'

interface MessageActionSheetProps {
  myReaction: string | null
  canPin: boolean
  pinned: boolean
  hasText: boolean
  hasPhotos: boolean
  canDelete: boolean
  onReact: (emoji: string) => void
  onReply: () => void
  onCopy: () => void
  onTogglePin: () => void
  onSavePhotos: () => void
  onDelete: () => void
  onClose: () => void
}

export function MessageActionSheet(props: MessageActionSheetProps) {
  const { myReaction, canPin, pinned, hasText, hasPhotos, canDelete, onReact, onReply, onCopy, onTogglePin, onSavePhotos, onDelete, onClose } = props
  const [picking, setPicking] = useState(false)
  const act = (fn: () => void) => () => { onClose(); fn() }
  const row = 'w-full flex items-center gap-3 px-4 py-3 text-sm text-left hover:bg-muted border-b border-border last:border-b-0'
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end lg:items-center justify-center" onClick={onClose} data-testid="message-action-sheet">
      <div
        className="w-full max-w-md bg-background rounded-t-2xl lg:rounded-2xl overflow-hidden pb-[env(safe-area-inset-bottom)]"
        onClick={e => e.stopPropagation()}
        role="menu"
        aria-label="メッセージの操作"
      >
        <div className="flex justify-around items-center px-2 py-2.5 border-b border-border">
          {QUICK_REACTIONS.map(emoji => (
            <button
              key={emoji}
              type="button"
              onClick={act(() => onReact(emoji))}
              className={`w-11 h-11 rounded-full text-2xl leading-none flex items-center justify-center hover:bg-muted ${myReaction === emoji ? 'bg-purple-100 ring-2 ring-purple-300' : ''}`}
              aria-label={`${emoji} を付ける`}
              data-reaction={emoji}
            >
              {emoji}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPicking(p => !p)}
            className="w-11 h-11 rounded-full flex items-center justify-center bg-muted text-muted-foreground"
            aria-label="ほかの絵文字"
            aria-expanded={picking}
          >
            <Plus className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        {picking && (
          <div className="border-b border-border max-h-56 overflow-y-auto">
            <EmojiGrid selected={myReaction} onPick={emoji => { onClose(); onReact(emoji) }} />
          </div>
        )}
        <button type="button" role="menuitem" className={row} onClick={act(onReply)} data-action="reply">
          <Reply className="w-4 h-4 text-muted-foreground" aria-hidden="true" />返信
        </button>
        {hasText && (
          <button type="button" role="menuitem" className={row} onClick={act(onCopy)} data-action="copy">
            <Copy className="w-4 h-4 text-muted-foreground" aria-hidden="true" />コピー
          </button>
        )}
        {canPin && (
          <button type="button" role="menuitem" className={row} onClick={act(onTogglePin)} data-action="pin">
            {pinned ? <PinOff className="w-4 h-4 text-muted-foreground" aria-hidden="true" /> : <Pin className="w-4 h-4 text-muted-foreground" aria-hidden="true" />}
            {pinned ? 'ピン留めを外す' : 'ピン留め（上に固定）'}
          </button>
        )}
        {hasPhotos && (
          <button type="button" role="menuitem" className={row} onClick={act(onSavePhotos)} data-action="save-photos">
            <Download className="w-4 h-4 text-muted-foreground" aria-hidden="true" />写真を保存
          </button>
        )}
        {canDelete && (
          <button type="button" role="menuitem" className={`${row} text-red-700`} onClick={act(onDelete)} data-action="delete">
            <Trash2 className="w-4 h-4" aria-hidden="true" />削除
          </button>
        )}
        <button type="button" className="w-full px-4 py-3 text-sm text-center text-muted-foreground bg-muted/50" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  )
}
