/** 段階のある申込の進み具合（1. 日程を選ぶ → 2. 内容の確認 → 3. 完了）。今の段は太字、済んだ段まで色の線 */
export function StepBar({ steps, current, color = '#111' }: { steps: string[]; current: number; color?: string }) {
  return (
    <ol className="mx-auto flex max-w-4xl gap-1.5 px-4 pt-3 pb-2" aria-label="申込の進み具合">
      {steps.map((label, i) => (
        <li key={label} className="min-w-0 flex-1" aria-current={i === current ? 'step' : undefined}>
          <div className="h-1" style={{ backgroundColor: i <= current ? color : '#e5e7eb' }} />
          <p className={`mt-1.5 truncate text-2xs ${i === current ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>{i + 1}. {label}</p>
        </li>
      ))}
    </ol>
  )
}
