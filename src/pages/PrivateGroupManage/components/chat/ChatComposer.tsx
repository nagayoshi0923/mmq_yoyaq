/**
 * チャットの入力欄（グループページ刷新 段階 2）。カメラ・写真（1 回 10 枚まで）・絵文字・送信。
 * 写真はグループ全体でも上限がある（既定 10 枚、2026-10-20）。写真を選ぶボタンの横に「あと N 枚」、上限に達したら選べなくして理由を出す。
 * 返信中は上に引用を出す。写真を選ぶと送る前に並べて見せ、外せる。
 * 初めての人には「長押しで返信・リアクション」の小さな案内を入力欄の上に出す（× で閉じたら出さない。点検 55）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Camera, ImagePlus, Loader2, Reply, Send, Smile, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { photoPickState } from './chatModel'
import { EmojiGrid } from './EmojiPicker'

const HINT_KEY = 'mmq_chat_longpress_hint_closed'
function readHintClosed(): boolean {
  try { return localStorage.getItem(HINT_KEY) === '1' } catch { return false }
}
function saveHintClosed() {
  try { localStorage.setItem(HINT_KEY, '1') } catch { /* 保存できない端末は毎回出す */ }
}

interface ChatComposerProps {
  disabled: boolean
  blockMessage: string | null
  replyQuote: string | null
  onCancelReply: () => void
  /** 送れたら true（入力欄を空にする） */
  onSend: (text: string, files: File[]) => Promise<boolean>
  onTyping: () => void
  /** グループ全体の写真の上限と残り。読めていなければ null（1 回 10 枚の制限だけで選ばせ、送るときに DB が確かめる） */
  photoQuota?: { limit: number; remaining: number } | null
}

export function ChatComposer({ disabled, blockMessage, replyQuote, onCancelReply, onSend, onTyping, photoQuota = null }: ChatComposerProps) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [hintClosed, setHintClosed] = useState(readHintClosed)
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const previews = useMemo(() => files.map(f => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach(u => URL.revokeObjectURL(u)), [previews])
  useEffect(() => { if (replyQuote) textRef.current?.focus() }, [replyQuote])

  // 入力に合わせて 4 行まで伸ばす。
  // スマホではチャット以外のタブを開いている間、入力欄が非表示（display:none）で高さが 0 と測れる。
  // そのまま 0px を入れると、チャットを開いた直後に入力欄が半分に潰れて見える（点検 45 番）ので、
  // 測れないときは高さを指定せず 1 行の自然な高さに任せ、表示されたときに測り直す。
  const fitHeight = useCallback(() => {
    const el = textRef.current
    if (!el) return
    el.style.height = 'auto'
    const measured = el.scrollHeight
    // scrollHeight は枠線を含まないので足す（box-sizing: border-box）
    const border = el.offsetHeight - el.clientHeight
    el.style.height = measured > 0 ? `${Math.min(measured + border, 112)}px` : ''
  }, [])
  useEffect(() => { fitHeight() }, [text, fitHeight])
  useEffect(() => {
    const el = textRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let lastWidth = -1
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? 0
      if (width === lastWidth) return
      lastWidth = width
      fitHeight()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [fitHeight])

  const pick = photoPickState(photoQuota, files.length)
  const addFiles = (list: FileList | null) => {
    const picked = Array.from(list ?? []).filter(f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name))
    if (picked.length === 0) return
    setFiles(prev => {
      const next = [...prev, ...picked]
      if (next.length > pick.perSend) toast.error(pick.overMessage)
      return next.slice(0, pick.perSend)
    })
  }
  const photoButtonDisabled = disabled || sending || !pick.canPickMore
  const photoButtonTitle = pick.blocked ? pick.blockedMessage : '写真を選ぶ（1回10枚まで）'

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
    <div className="shrink-0 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]" data-testid="chat-composer">
      {blockMessage && <p className="text-xs text-muted-foreground px-3 pt-2">{blockMessage}</p>}
      {!disabled && pick.blocked && <p className="text-xs text-muted-foreground px-3 pt-2" data-testid="chat-photo-limit">{pick.blockedMessage}</p>}
      {!hintClosed && !disabled && (
        <div className="flex items-center gap-2 px-3 pt-2 text-xs text-muted-foreground" data-testid="chat-longpress-hint">
          <span className="flex-1">メッセージを長押しすると、返信・リアクション・コピーができます（パソコンは右クリック）</span>
          <button type="button" onClick={() => { saveHintClosed(); setHintClosed(true) }} className="w-6 h-6 shrink-0 flex items-center justify-center rounded-full hover:bg-muted" aria-label="案内を閉じる">
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
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
          <span className="self-end text-xs text-muted-foreground whitespace-nowrap pb-1">{files.length}/{pick.perSend}</span>
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
        <button type="button" className={iconButton} onClick={() => cameraRef.current?.click()} disabled={photoButtonDisabled} aria-label="カメラで撮る" title={pick.blocked ? pick.blockedMessage : 'カメラで撮る'}>
          <Camera className="w-5 h-5" aria-hidden="true" />
        </button>
        <button type="button" className={iconButton} onClick={() => libraryRef.current?.click()} disabled={photoButtonDisabled} aria-label="写真を選ぶ" title={photoButtonTitle}>
          <ImagePlus className="w-5 h-5" aria-hidden="true" />
        </button>
        {!disabled && pick.left !== null && (
          <span className="self-center shrink-0 text-xs leading-none text-muted-foreground whitespace-nowrap pr-1" data-testid="chat-photo-remaining">あと {pick.left} 枚</span>
        )}
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
          className="flex-1 min-w-0 min-h-[38px] resize-none rounded-2xl border border-input bg-[#F6F9FB] px-3.5 py-2 text-sm leading-5 focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:opacity-60"
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
