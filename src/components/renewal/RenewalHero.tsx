import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MMQ_RED, SERIF_HEADING } from './fonts'

export interface HeroOption {
  value: string
  label: string
}

interface RenewalHeroProps {
  /** 2 行の見出し */
  headline: [string, string]
  lead: string
  where: { value: string; options: HeroOption[]; onChange: (value: string) => void }
  when: { value: string; options: HeroOption[]; onChange: (value: string) => void }
  /** 「空いている公演を見る」 */
  onSearch: () => void
  links: Array<{ label: string; to?: string; onClick?: () => void }>
  /** ボタンの色（MMQ は赤、組織トップは組織の色） */
  accentColor?: string
  backgroundColor?: string
}

/**
 * トップの上の帯（刷新版）。黒地に明朝の見出し、一言、「どこで」「いつ」の 2 つの選択、赤い大きなボタン、小さな 3 つのリンク。
 * 選んだ条件は下の「空いている公演を探す」にそのまま入る。
 */
export function RenewalHero({ headline, lead, where, when, onSearch, links, accentColor = MMQ_RED, backgroundColor = '#0d0d0d' }: RenewalHeroProps) {
  return (
    <section className="text-white" style={{ backgroundColor }}>
      <div className="mx-auto max-w-4xl px-4 pb-6 pt-8">
        <h1 className={cn(SERIF_HEADING, 'text-[32px] font-bold leading-[1.35] tracking-wide')}>
          {headline[0]}<br />{headline[1]}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-white/75">{lead}</p>

        <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-[2px] bg-gray-300">
          <HeroSelect label="どこで" {...where} />
          <HeroSelect label="いつ" {...when} />
        </div>
        <button
          type="button"
          onClick={onSearch}
          className="mt-4 flex h-14 w-full items-center justify-center rounded-[2px] text-base font-bold text-white hover:opacity-90"
          style={{ backgroundColor: accentColor }}
        >
          空いている公演を見る
        </button>
        <nav className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/80" aria-label="案内">
          {links.map((l) => l.to
            ? <Link key={l.label} to={l.to} className="hover:text-white">{l.label}</Link>
            : <button key={l.label} type="button" onClick={l.onClick} className="hover:text-white">{l.label}</button>)}
        </nav>
      </div>
    </section>
  )
}

function HeroSelect({ label, value, options, onChange }: { label: string } & RenewalHeroProps['where']) {
  const current = options.find((o) => o.value === value) ?? options[0]
  return (
    <label className="relative block bg-white px-3.5 pb-2.5 pt-2 text-foreground">
      <span className="block text-[11px] text-muted-foreground">{label}</span>
      <span className="mt-0.5 flex items-center justify-between text-base font-bold">
        {current?.label}
        <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}
