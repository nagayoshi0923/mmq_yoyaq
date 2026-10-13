/**
 * 「登場人物」: 横に並ぶカード（画像・名前・一言）。作品ページと同じ公開情報だけ（NPC は出さない）。0 人なら欄ごと出さない。
 */
import { User } from 'lucide-react'
import { characterImageStyle } from '@/components/scenario/scenarioFacts'
import type { PublicCharacter } from '../overviewModel'
import { OverviewSection } from './OverviewSection'

export function CharactersSection({ characters }: { characters: PublicCharacter[] }) {
  if (characters.length === 0) return null
  return (
    <OverviewSection label="登場人物" testId="overview-characters" title="登場人物" aside={<span className="text-muted-foreground">{characters.length}人</span>}>
      <ul className="-mx-3 px-3 flex gap-2 overflow-x-auto pb-1 snap-x">
        {characters.map(c => (
          <li key={c.id} className="w-24 shrink-0 snap-start" data-testid="overview-character">
            <div className="w-24 h-24 overflow-hidden rounded-lg bg-muted flex items-center justify-center" style={c.backgroundColor ? { backgroundColor: c.backgroundColor } : undefined}>
              {c.imageUrl
                ? <img src={c.imageUrl} alt="" loading="lazy" className="w-full h-full object-cover" style={characterImageStyle(c.imagePosition, c.imageScale)} />
                : <User className="w-8 h-8 text-muted-foreground" aria-hidden="true" />}
            </div>
            <p className="mt-1 text-xs font-bold leading-tight break-words">{c.name}</p>
            {c.description && <p className="mt-0.5 text-xs leading-snug text-muted-foreground line-clamp-3 break-words">{c.description}</p>}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs text-muted-foreground">配役は当日またはアンケートで決まります。ネタバレになる情報は出していません。</p>
    </OverviewSection>
  )
}
