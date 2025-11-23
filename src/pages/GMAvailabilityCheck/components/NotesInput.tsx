import { Textarea } from '@/components/ui/textarea'

interface NotesInputProps {
  value: string
  onChange: (value: string) => void
  isResponded: boolean
  placeholder?: string
}

/**
 * メモ入力コンポーネント
 */
export function NotesInput({
  value,
  onChange,
  isResponded,
  placeholder = '特記事項があれば入力してください'
}: NotesInputProps) {
  if (isResponded && value) {
    return (
      <div className="bg-muted/50 rounded p-3">
        <div className="text-sm mb-1">メモ</div>
        <div className="text-sm text-muted-foreground whitespace-pre-wrap">
          {value}
        </div>
      </div>
    )
  }

  if (isResponded) {
    return null
  }

  return (
    <div>
      <label className="text-sm mb-1.5 block">
        メモ（任意）
      </label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
      />
    </div>
  )
}

