/**
 * 絵文字の一覧（リアクションの「＋」と入力欄の絵文字ボタン）。
 */
import { PICKER_EMOJIS } from './chatModel'

export function EmojiGrid({ onPick, selected }: { onPick: (emoji: string) => void; selected?: string | null }) {
  return (
    <div className="grid grid-cols-8 gap-1 p-2" data-testid="emoji-picker">
      {PICKER_EMOJIS.map(emoji => (
        <button
          key={emoji}
          type="button"
          onClick={() => onPick(emoji)}
          className={`h-9 rounded-md text-xl leading-none hover:bg-muted ${selected === emoji ? 'bg-purple-100' : ''}`}
          aria-label={emoji}
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}
