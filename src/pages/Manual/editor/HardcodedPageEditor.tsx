/**
 * ハードコードページのコンテンツ編集ダイアログ
 */
import { useState } from 'react'
import { Plus, Trash2, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  HardcodedPageContent,
  CouponTypePageContent,
  PageSection,
  PageItem,
  CouponTypeItem,
  CouponScopeItem,
  CouponTypeNote,
} from '@/types/hardcodedContent'

// ---------------------------------------------------------------------------
// Generic page content editor
// ---------------------------------------------------------------------------

function ArrayEditor({
  label,
  items,
  onChange,
}: {
  label: string
  items: string[]
  onChange: (items: string[]) => void
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {items.map((item, i) => (
        <div key={i} className="flex gap-2">
          <Textarea
            value={item}
            onChange={e => {
              const next = [...items]
              next[i] = e.target.value
              onChange(next)
            }}
            rows={2}
            className="text-sm"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full border-dashed text-xs"
        onClick={() => onChange([...items, ''])}
      >
        <Plus className="h-3.5 w-3.5 mr-1" />
        追加
      </Button>
    </div>
  )
}

function PageItemEditor({
  item,
  onChange,
}: {
  item: PageItem
  onChange: (item: PageItem) => void
}) {
  return (
    <div className="space-y-3 border rounded-lg p-4 bg-muted/10">
      <div className="space-y-1.5">
        <Label className="text-xs">タイトル</Label>
        <Input
          value={item.title}
          onChange={e => onChange({ ...item, title: e.target.value })}
          placeholder="タイトル"
          className="text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">サブタイトル（任意）</Label>
        <Input
          value={item.subtitle ?? ''}
          onChange={e => onChange({ ...item, subtitle: e.target.value || undefined })}
          placeholder="サブタイトル"
          className="text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">本文（任意）</Label>
        <Textarea
          value={item.body ?? ''}
          onChange={e => onChange({ ...item, body: e.target.value || undefined })}
          placeholder="本文"
          rows={3}
          className="text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">シーン説明（任意）</Label>
        <Input
          value={item.scene ?? ''}
          onChange={e => onChange({ ...item, scene: e.target.value || undefined })}
          placeholder="シーン: ..."
          className="text-sm"
        />
      </div>
      <ArrayEditor
        label="箇条書き（任意）"
        items={item.bullets ?? []}
        onChange={bullets => onChange({ ...item, bullets: bullets.length ? bullets : undefined })}
      />
      <ArrayEditor
        label="番号付きリスト（任意）"
        items={item.orderedBullets ?? []}
        onChange={orderedBullets => onChange({ ...item, orderedBullets: orderedBullets.length ? orderedBullets : undefined })}
      />
      <div className="space-y-1.5">
        <Label className="text-xs">ノート（任意）</Label>
        <Textarea
          value={item.note ?? ''}
          onChange={e => onChange({ ...item, note: e.target.value || undefined })}
          placeholder="補足ノート"
          rows={2}
          className="text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">ノートの種類</Label>
        <Select
          value={item.noteType ?? 'none'}
          onValueChange={v => onChange({ ...item, noteType: v === 'none' ? undefined : v as PageItem['noteType'] })}
        >
          <SelectTrigger className="w-40 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">なし</SelectItem>
            <SelectItem value="info">info</SelectItem>
            <SelectItem value="warning">warning</SelectItem>
            <SelectItem value="caution">caution</SelectItem>
            <SelectItem value="success">success</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function PageSectionEditor({
  section,
  onChange,
}: {
  section: PageSection
  onChange: (section: PageSection) => void
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">セクション見出し</Label>
        <Input
          value={section.heading}
          onChange={e => onChange({ ...section, heading: e.target.value })}
          placeholder="セクション見出し"
          className="text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">イントロ文（任意）</Label>
        <Textarea
          value={section.intro ?? ''}
          onChange={e => onChange({ ...section, intro: e.target.value || undefined })}
          placeholder="セクションの説明文"
          rows={2}
          className="text-sm"
        />
      </div>
      <div className="space-y-3">
        <Label className="text-xs font-medium">アイテム（{section.items.length}件）</Label>
        {section.items.map((item, i) => (
          <div key={i} className="relative">
            <div className="absolute -top-2 -left-2 z-10 flex items-center gap-1">
              <span className="text-[10px] bg-primary text-white rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {i + 1}
              </span>
            </div>
            <div className="relative">
              <PageItemEditor
                item={item}
                onChange={updated => {
                  const next = [...section.items]
                  next[i] = updated
                  onChange({ ...section, items: next })
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 h-7 w-7"
                onClick={() => onChange({ ...section, items: section.items.filter((_, j) => j !== i) })}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full border-dashed text-xs"
          onClick={() => onChange({
            ...section,
            items: [...section.items, { title: '' }]
          })}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          アイテムを追加
        </Button>
      </div>
    </div>
  )
}

function GenericContentEditor({
  content,
  onChange,
}: {
  content: HardcodedPageContent
  onChange: (content: HardcodedPageContent) => void
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label>説明文</Label>
        <Textarea
          value={content.description}
          onChange={e => onChange({ ...content, description: e.target.value })}
          rows={3}
          placeholder="ページの説明文"
        />
      </div>

      <div className="space-y-4">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          セクション（{content.sections.length}件）
        </p>
        {content.sections.map((section, i) => (
          <div key={i} className="border rounded-xl p-5 space-y-4 relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-muted-foreground">セクション {i + 1}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onChange({
                  ...content,
                  sections: content.sections.filter((_, j) => j !== i)
                })}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
            <PageSectionEditor
              section={section}
              onChange={updated => {
                const next = [...content.sections]
                next[i] = updated
                onChange({ ...content, sections: next })
              }}
            />
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          className="w-full border-dashed"
          onClick={() => onChange({
            ...content,
            sections: [...content.sections, { heading: '', items: [] }]
          })}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          セクションを追加
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CouponType page content editor
// ---------------------------------------------------------------------------

function CouponNoteEditor({
  note,
  onChange,
  onDelete,
}: {
  note: CouponTypeNote
  onChange: (note: CouponTypeNote) => void
  onDelete: () => void
}) {
  return (
    <div className="flex gap-2 items-start border rounded p-3">
      <div className="flex-1 space-y-2">
        <Select
          value={note.type}
          onValueChange={v => onChange({ ...note, type: v as CouponTypeNote['type'] })}
        >
          <SelectTrigger className="w-32 text-xs h-7">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="info">info</SelectItem>
            <SelectItem value="warning">warning</SelectItem>
            <SelectItem value="caution">caution</SelectItem>
          </SelectContent>
        </Select>
        <Textarea
          value={note.text}
          onChange={e => onChange({ ...note, text: e.target.value })}
          rows={2}
          className="text-sm"
          placeholder="ノートのテキスト"
        />
      </div>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      </Button>
    </div>
  )
}

function CouponItemEditor({
  coupon,
  index,
  onChange,
  onDelete,
}: {
  coupon: CouponTypeItem
  index: number
  onChange: (coupon: CouponTypeItem) => void
  onDelete: () => void
}) {
  return (
    <div className="border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-muted-foreground">クーポン {index + 1}</span>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">タイトル</Label>
        <Input
          value={coupon.title}
          onChange={e => onChange({ ...coupon, title: e.target.value })}
          placeholder="クーポン名"
          className="text-sm"
        />
      </div>

      {/* Scopes */}
      <div className="space-y-2">
        <Label className="text-xs">使用可能範囲</Label>
        {coupon.scopes.map((scope, i) => (
          <div key={i} className="flex gap-2 items-center">
            <Input
              value={scope.label}
              onChange={e => {
                const next = [...coupon.scopes]
                next[i] = { ...next[i], label: e.target.value }
                onChange({ ...coupon, scopes: next })
              }}
              placeholder="ラベル"
              className="text-sm flex-1"
            />
            <label className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
              <input
                type="checkbox"
                checked={scope.disabled ?? false}
                onChange={e => {
                  const next = [...coupon.scopes]
                  next[i] = { ...next[i], disabled: e.target.checked || undefined }
                  onChange({ ...coupon, scopes: next })
                }}
              />
              無効
            </label>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 flex-shrink-0"
              onClick={() => onChange({ ...coupon, scopes: coupon.scopes.filter((_, j) => j !== i) })}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full border-dashed text-xs"
          onClick={() => onChange({ ...coupon, scopes: [...coupon.scopes, { label: '' }] })}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          範囲を追加
        </Button>
      </div>

      {/* Steps */}
      <div className="space-y-2">
        <Label className="text-xs">使用方法（手順）</Label>
        {coupon.steps.map((step, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={step}
              onChange={e => {
                const next = [...coupon.steps]
                next[i] = e.target.value
                onChange({ ...coupon, steps: next })
              }}
              placeholder={`手順 ${i + 1}`}
              className="text-sm"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 flex-shrink-0"
              onClick={() => onChange({ ...coupon, steps: coupon.steps.filter((_, j) => j !== i) })}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full border-dashed text-xs"
          onClick={() => onChange({ ...coupon, steps: [...coupon.steps, ''] })}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          手順を追加
        </Button>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label className="text-xs">備考・注意事項</Label>
        {coupon.notes.map((note, i) => (
          <CouponNoteEditor
            key={i}
            note={note}
            onChange={updated => {
              const next = [...coupon.notes]
              next[i] = updated
              onChange({ ...coupon, notes: next })
            }}
            onDelete={() => onChange({ ...coupon, notes: coupon.notes.filter((_, j) => j !== i) })}
          />
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full border-dashed text-xs"
          onClick={() => onChange({ ...coupon, notes: [...coupon.notes, { type: 'info', text: '' }] })}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          備考を追加
        </Button>
      </div>
    </div>
  )
}

function CouponTypeEditor({
  content,
  onChange,
}: {
  content: CouponTypePageContent
  onChange: (content: CouponTypePageContent) => void
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label>説明文</Label>
        <Textarea
          value={content.description}
          onChange={e => onChange({ ...content, description: e.target.value })}
          rows={3}
          placeholder="ページの説明文"
        />
      </div>

      <div className="space-y-4">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          クーポン（{content.coupons.length}件）
        </p>
        {content.coupons.map((coupon, i) => (
          <CouponItemEditor
            key={i}
            coupon={coupon}
            index={i}
            onChange={updated => {
              const next = [...content.coupons]
              next[i] = updated
              onChange({ ...content, coupons: next })
            }}
            onDelete={() => onChange({
              ...content,
              coupons: content.coupons.filter((_, j) => j !== i)
            })}
          />
        ))}
        <Button
          type="button"
          variant="outline"
          className="w-full border-dashed"
          onClick={() => onChange({
            ...content,
            coupons: [...content.coupons, {
              title: '',
              scopes: [],
              steps: [],
              notes: [],
            }]
          })}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          クーポンを追加
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function isCouponTypeContent(content: unknown): content is CouponTypePageContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'coupons' in content &&
    Array.isArray((content as CouponTypePageContent).coupons)
  )
}

function isHardcodedPageContent(content: unknown): content is HardcodedPageContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'sections' in content &&
    Array.isArray((content as HardcodedPageContent).sections)
  )
}

export function HardcodedPageEditor({
  slug,
  initialContent,
  onSave,
  onCancel,
}: {
  slug: string
  initialContent: HardcodedPageContent | CouponTypePageContent | null
  onSave: (content: unknown) => Promise<void>
  onCancel: () => void
}) {
  const isCouponType = slug === 'coupon-types'

  const [content, setContent] = useState<HardcodedPageContent | CouponTypePageContent>(() => {
    if (initialContent) return initialContent
    if (isCouponType) {
      return { description: '', coupons: [] } as CouponTypePageContent
    }
    return { description: '', sections: [] } as HardcodedPageContent
  })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(content)
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={o => !o && onCancel()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            コンテンツを編集
            <span className="text-xs text-muted-foreground font-normal">({slug})</span>
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="border border-destructive/50 bg-destructive/10 text-destructive rounded-md px-4 py-3 text-sm flex gap-2">
            <X className="h-4 w-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <div className="py-2">
          {isCouponType && isCouponTypeContent(content) ? (
            <CouponTypeEditor
              content={content}
              onChange={setContent}
            />
          ) : isHardcodedPageContent(content) ? (
            <GenericContentEditor
              content={content}
              onChange={setContent}
            />
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            キャンセル
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1.5" />
            {saving ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
