/**
 * ブログ記事の本文に「部品」を入れるダイアログ（作品カード・タグの作品一覧・キャラ紹介・画像）。
 * QW-20261116-001（見本: Figma「特集・キャンペーン」の 管理2 特集記事を書く）。
 * 決定（2026-11-15 社長）: 特集の作品は「タグで自動＋手で足し引き」。
 *   タグの作品一覧は、外したい作品のチェックを外して入れる。足したい作品は作品カードで入れる。
 */
import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { fetchFeatureScenarios } from '@/lib/blogPublicFetch'
import { characterMatches, characterShortcode, imageMarkdown, tagShortcode, workShortcode } from '@/lib/blogArticle'
import { uploadBlogCoverImage, validateImageFile } from '@/lib/uploadImage'
import { logger } from '@/utils/logger'
import { cn } from '@/lib/utils'

export type BlogPartKind = 'work' | 'tag' | 'character' | 'image'

const TITLES: Record<BlogPartKind, string> = {
  work: '作品カードを入れる',
  tag: 'タグの作品一覧を入れる',
  character: 'キャラ紹介を入れる',
  image: '画像を入れる',
}

interface Props {
  kind: BlogPartKind | null
  organizationId: string | null
  onClose: () => void
  onInsert: (line: string) => void
}

export function BlogPartPicker({ kind, organizationId, onClose, onInsert }: Props) {
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [caption, setCaption] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const needsScenarios = kind === 'work' || kind === 'tag' || kind === 'character'
  const { data: scenarios, isLoading, isError } = useQuery({
    queryKey: ['blog-part-picker-scenarios', organizationId],
    queryFn: () => fetchFeatureScenarios({ organizationId: organizationId! }),
    enabled: needsScenarios && !!organizationId,
    staleTime: 5 * 60_000,
  })

  const reset = () => {
    setQuery('')
    setTag(null)
    setExcluded(new Set())
    setCaption('')
    setImageUrl('')
  }
  const close = () => {
    reset()
    onClose()
  }
  const insert = (line: string) => {
    onInsert(line)
    close()
  }

  const works = useMemo(() => {
    const q = query.trim()
    return (scenarios ?? []).filter((s) => !q || s.title.includes(q)).slice(0, 60)
  }, [scenarios, query])

  const tagCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of scenarios ?? []) for (const g of s.genre ?? []) map.set(g, (map.get(g) ?? 0) + 1)
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [scenarios])
  const tagWorks = useMemo(() => (tag ? (scenarios ?? []).filter((s) => (s.genre ?? []).includes(tag)) : []), [scenarios, tag])

  const characters = useMemo(() => {
    const list = (scenarios ?? []).flatMap((s) => s.characters
      .filter((c) => c.id && c.name && !c.is_npc)
      .map((c) => ({ scenario: s, character: c })))
    return list.filter(({ character }) => characterMatches(character, query)).slice(0, 80)
  }, [scenarios, query])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !organizationId) return
    const check = validateImageFile(file, 5)
    if (!check.valid) {
      toast.error(check.error || '画像を選べませんでした')
      return
    }
    try {
      setUploading(true)
      const result = await uploadBlogCoverImage(file, organizationId)
      if (!result) {
        toast.error('画像のアップロードに失敗しました')
        return
      }
      setImageUrl(result.url)
    } catch (err) {
      logger.error('記事画像アップロード:', err)
      toast.error('画像のアップロードに失敗しました')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={kind !== null} onOpenChange={(open) => { if (!open) close() }}>
      <DialogContent fixedSize="form" className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{kind ? TITLES[kind] : ''}</DialogTitle>
        </DialogHeader>

        {needsScenarios && isLoading && (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        )}
        {needsScenarios && isError && <p className="py-6 text-sm text-muted-foreground">作品を読み込めませんでした。</p>}

        {kind === 'work' && scenarios && (
          <div className="space-y-3">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="作品名で探す" autoFocus />
            <p className="text-xs text-muted-foreground">公開中の作品だけが出ます。押すと本文に入ります。次の公演と空席は、記事を開くたびに最新になります。</p>
            <div className="divide-y border">
              {works.map((s) => (
                <button key={s.scenario_master_id} type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted" onClick={() => insert(workShortcode(s.scenario_master_id))}>
                  <span className="truncate">{s.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{(s.genre ?? []).slice(0, 2).join('・')}</span>
                </button>
              ))}
              {works.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">見つかりません</p>}
            </div>
          </div>
        )}

        {kind === 'tag' && scenarios && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">タグを選ぶと、そのタグの作品が記事に自動で並びます（あとでタグを付けた作品も自動で増えます）。出したくない作品はチェックを外してください。</p>
            <div className="flex flex-wrap gap-2">
              {tagCounts.map(([g, n]) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => { setTag(g); setExcluded(new Set()) }}
                  className={cn('rounded-full border px-3 py-1 text-xs font-bold', tag === g ? 'border-primary bg-primary text-white' : 'border-input bg-white')}
                >
                  {g}（{n}）
                </button>
              ))}
            </div>
            {tag && (
              <div className="divide-y border">
                {tagWorks.map((s) => {
                  const on = !excluded.has(s.scenario_master_id)
                  return (
                    <label key={s.scenario_master_id} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted">
                      <Checkbox
                        checked={on}
                        onCheckedChange={(v) => setExcluded((prev) => {
                          const next = new Set(prev)
                          if (v) next.delete(s.scenario_master_id)
                          else next.add(s.scenario_master_id)
                          return next
                        })}
                      />
                      <span className={cn('truncate', !on && 'text-muted-foreground line-through')}>{s.title}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {kind === 'character' && scenarios && (
          <div className="space-y-3">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="名前や紹介文の言葉で探す（例：メガネ、メイド）" autoFocus />
            <p className="text-xs text-muted-foreground">作品に登録されているキャラから探します。押すと本文に入ります。</p>
            <div className="divide-y border">
              {characters.map(({ scenario, character }) => (
                <button
                  key={`${scenario.scenario_master_id}:${character.id}`}
                  type="button"
                  className="flex w-full gap-3 px-3 py-2 text-left hover:bg-muted"
                  onClick={() => insert(characterShortcode(scenario.scenario_master_id, character.id!))}
                >
                  <span className="h-12 w-10 shrink-0 overflow-hidden bg-muted">
                    {character.image_url && <img src={character.image_url} alt="" className="h-full w-full object-cover" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-bold">{character.name}<span className="ml-2 text-xs text-muted-foreground">{scenario.title}</span></span>
                    {character.description && <span className="line-clamp-1 block text-xs text-muted-foreground">{character.description}</span>}
                    {!character.image_url && <span className="block text-xs text-muted-foreground">画像なし</span>}
                  </span>
                </button>
              ))}
              {characters.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">見つかりません</p>}
            </div>
          </div>
        )}

        {kind === 'image' && (
          <div className="space-y-3">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleFile} />
            <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              画像をアップロード
            </Button>
            {imageUrl && <img src={imageUrl} alt="" className="max-h-48 border" />}
            <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="写真の説明（例：馬場店での公演のようす）" />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close}>やめる</Button>
          {kind === 'tag' && (
            <Button disabled={!tag} onClick={() => tag && insert(tagShortcode(tag, [...excluded]))}>この一覧を入れる</Button>
          )}
          {kind === 'image' && (
            <Button disabled={!imageUrl} onClick={() => insert(imageMarkdown(imageUrl, caption))}>画像を入れる</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
