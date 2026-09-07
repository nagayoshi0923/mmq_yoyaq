import { Input } from '@/components/ui/input'

interface DeadlineRowProps {
  id: string
  scope: string
  value: number
  onChange: (value: number) => void
}

export function DeadlineRow({ id, scope, value, onChange }: DeadlineRowProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="ts-muted w-20 shrink-0">{scope}</span>
      <Input
        id={id}
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        min={0}
        max={720}
        className="w-32"
      />
      <span className="ts-muted">時間前まで</span>
    </div>
  )
}
