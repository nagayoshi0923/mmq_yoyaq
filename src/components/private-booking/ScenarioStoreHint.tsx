/** 希望店舗と作品の上演可能店舗の食い違いの注意（文面は scenarioStoreHintText） */
export function ScenarioStoreHint({ hint, compact = false }: { hint: string | null; compact?: boolean }) {
  if (!hint) return null
  return (
    <p role="note" className={`rounded-md border border-amber-200 bg-amber-50 text-amber-800 ${compact ? 'px-1.5 py-1 text-xs leading-snug' : 'px-3 py-2 text-xs'}`}>
      {hint}
    </p>
  )
}
