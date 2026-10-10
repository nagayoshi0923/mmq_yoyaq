/**
 * チャットの入力欄（グループページ刷新 段階 2）。カメラ・写真（1 回 10 枚まで）・絵文字・送信。
 * 返信中は上に引用を出す。写真を選ぶと送る前に並べて見せ、外せる。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, ImagePlus, Loader2, Reply, Send, Smile, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { MAX_PHOTOS_PER_MESSAGE } from './chatModel'
import { EmojiGrid } from './EmojiPicker'

interface ChatComposerProps {
  disabled: boolean
  blockMessage: string | null
  replyQuote: string | null
  onCancelReply: () => void
  /** 送れたら true（入力欄を空にする） */
  onSend: (text: string, files: File[]) => Promise<boolean>
  onTyping: () => void
}

export function ChatComposer({ disabled, blockMessage, replyQuote, onCancelReply, onSend, onTyping }: ChatComposerProps) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const previews = useMemo(() => files.map(f => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach(u => URL.revokeObjectURL(u)), [previews])
  useEffect(() => { if (replyQuote) textRef.current?.focus() }, [replyQuote])

  // 入力に合わせて 4 行まで伸ばす
  useEffect(() => {
    const el = textRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`
  }, [text])

  const addFiles = (list: FileList | null) => {
    const picked = Array.from(list ?? []).filter(f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name))
    if (picked.length === 0) return
    setFiles(prev => {
      const next = [...prev, ...picked]
      if (next.length > MAX_PHOTOS_PER_MESSAGE) toast.error(`写真は1回${MAX_PHOTOS_PER_MESSAGE}枚までです`)
      return next.slice(0, MAX_PHOTOS_PER_MESSAGE)
    })
  }

  const canSend = !disabled && !sending && (text.trim().length > 0 || files.length > 0)
  const send = async () => {
    if (!canSend) return
    if (text.trim().length > 5000) { toast.error('メッセージは5000文字以内で入力してください'); return }
    setSending(true)
    try {
      if (await onSend(text.trim(), files)) {
        setText('')
        setFiles([])
        setEmojiOpen(false)
      }
    } finally {
      setSending(false)
    }
  }

  const iconButton = 'w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-purple-700 hover:bg-purple-50 disabled:opacity-40'
  return (
    <div className="border-t border-border bg-background" data-testid="chat-composer">
      {blockMessage && <p className="text-xs text-muted-foreground px-3 pt-2">{blockMessage}</p>}
      {replyQuote && (
        <div className="flex items-center gap-2 px-3 pt-2 text-xs text-purple-800" data-testid="chat-reply-preview">
          <Reply className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate flex-1">返信: {replyQuote}</span>
          <button type="button" onClick={onCancelReply} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-muted" aria-label="返信をやめる">
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
      {files.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-3 pt-2" data-testid="chat-photo-previews">
          {previews.map((url, i) => (
            <div key={url} className="relative w-16 h-16 shrink-0 rounded-md overflow-hidden bg-muted">
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center"
                aria-label={`${i + 1} 枚目を外す`}
              >
                <X className="w-3 h-3" aria-hidden="true" />
              </button>
            </div>
          ))}
          <span className="self-end text-xs text-muted-foreground whitespace-nowrap pb-1">{files.length}/{MAX_PHOTOS_PER_MESSAGE}</span>
        </div>
      )}
      {emojiOpen && (
        <div className="border-b border-border max-h-48 overflow-y-auto">
          <EmojiGrid onPick={emoji => setText(t => t + emoji)} />
        </div>
      )}
      <div className="flex items-end gap-1 px-2 py-2">
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = '' }} data-testid="chat-camera-input" />
        <input ref={libraryRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = '' }} data-testid="chat-photo-input" />
        <button type="button" className={iconButton} onClick={() => cameraRef.current?.click()} disabled={disabled || sending} aria-label="カメラで撮る" title="カメラで撮る">
          <Camera className="w-5 h-5" aria-hidden="true" />
        </button>
        <button type="button" className={iconButton} onClick={() => libraryRef.current?.click()} disabled={disabled || sending} aria-label="写真を選ぶ" title="写真を選ぶ（1回10枚まで）">
          <ImagePlus className="w-5 h-5" aria-hidden="true" />
        </button>
        <textarea
          ref={textRef}
          rows={1}
          value={text}
          onChange={e => { setText(e.target.value); if (e.target.value) onTyping() }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia?.('(pointer: fine)').matches) {
              e.preventDefault()
              void send()
            }
          }}
          placeholder={disabled ? '送信できません' : 'メッセージ'}
          disabled={disabled || sending}
          className="flex-1 min-w-0 resize-none rounded-2xl border border-input bg-[#F6F9FB] px-3.5 py-2 text-sm leading-5 focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:opacity-60"
          aria-label="メッセージ"
          data-testid="chat-input"
        />
        <button type="button" className={iconButton} onClick={() => setEmojiOpen(o => !o)} disabled={disabled || sending} aria-label="絵文字" aria-expanded={emojiOpen}>
          <Smile className="w-5 h-5" aria-hidden="true" />
        </button>
        <Button
          type="button"
          onClick={() => void send()}
          disabled={!canSend}
          size="icon"
          className="w-9 h-9 shrink-0 rounded-full bg-purple-600 hover:bg-purple-700"
          aria-label="送信"
          title="送信"
          data-testid="chat-send"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  )
}
