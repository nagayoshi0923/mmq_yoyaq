import { Users } from 'lucide-react'
import type { CastingCharacter } from './castingModel'

/** キャラクターの画像（配役のシート・事前配役アンケートで共用）。画像が無ければ人のアイコン */
export function CharacterImage({ c, className }: { c: Pick<CastingCharacter, 'image_url' | 'image_position' | 'image_scale'>; className: string }) {
  if (!c.image_url) {
    return (
      <div className={`${className} flex items-center justify-center bg-muted`} aria-hidden="true">
        <Users className="h-5 w-5 text-muted-foreground" />
      </div>
    )
  }
  const [x, y] = (c.image_position ?? '').split(' ')
  return (
    <div className={`${className} overflow-hidden bg-muted`}>
      <img
        src={c.image_url}
        alt=""
        className="h-full w-full object-cover"
        style={{ objectPosition: x && y ? `${x}% ${y}%` : '50% 30%', transform: c.image_scale ? `scale(${c.image_scale / 100})` : undefined }}
      />
    </div>
  )
}
