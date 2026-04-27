/**
 * ブロック種別ごとの編集フォーム
 */
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  BlockType, BlockContentMap,
  SectionHeaderContent, ParagraphContent, AlertContent,
  StepsContent, CheckListContent, FaqContent, TableContent,
  KeyValueContent, TwoColumnContent, ScriptBoxContent,
} from '@/types/manual'

interface BlockFormProps<T extends BlockType> {
  type: T
  content: BlockContentMap[T]
  onChange: (content: BlockContentMap[T]) => void
}

// ---------------------------------------------------------------------------
// 各ブロック種別フォーム
// ---------------------------------------------------------------------------

function SectionHeaderForm({ content, onChange }: {
  content: SectionHeaderContent
  onChange: (c: SectionHeaderContent) => void
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>タイトル</Label>
        <Input
          value={content.title}
          onChange={e => onChange({ ...content, title: e.target.value })}
          placeholder="セクション見出しを入力"
        />
      </div>
    </div>
  )
}

function ParagraphForm({ content, onChange }: {
  content: ParagraphContent
  onChange: (c: ParagraphContent) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label>本文</Label>
      <Textarea
        value={content.text}
        onChange={e => onChange({ text: e.target.value })}
        placeholder="本文を入力（改行可）"
        rows={5}
      />
    </div>
  )
}

const ALERT_TYPE_LABELS = [
  { value: 'info',    label: 'ℹ️ 情報（青）' },
  { value: 'success', label: '✅ 成功（緑）' },
  { value: 'warning', label: '⚠️ 警告（黄）' },
  { value: 'caution', label: '🚨 注意（橙）' },
]

function AlertForm({ content, onChange }: {
  content: AlertContent
  onChange: (c: AlertContent) => void
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>種別</Label>
        <Select value={content.type} onValueChange={v => onChange({ ...content, type: v as AlertContent['type'] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ALERT_TYPE_LABELS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>タイトル（任意）</Label>
        <Input
          value={content.title ?? ''}
          onChange={e => onChange({ ...content, title: e.target.value || undefined })}
          placeholder="太字で表示されるタイトル"
        />
      </div>
      <div className="space-y-1.5">
        <Label>本文</Label>
        <Textarea
          value={content.body}
          onChange={e => onChange({ ...content, body: e.target.value })}
          rows={3}
          placeholder="アラートの内容を入力"
        />
      </div>
    </div>
  )
}

function StepsForm({ content, onChange }: {
  content: StepsContent
  onChange: (c: StepsContent) => void
}) {
  const updateItem = (i: number, patch: Partial<StepsContent['items'][number]>) => {
    const items = content.items.map((item, idx) => idx === i ? { ...item, ...patch } : item)
    onChange({ items })
  }
  const addItem = () => onChange({ items: [...content.items, { title: '', description: '' }] })
  const removeItem = (i: number) => onChange({ items: content.items.filter((_, idx) => idx !== i) })

  return (
    <div className="space-y-3">
      {content.items.map((item, i) => (
        <div key={i} className="border rounded-lg p-3 space-y-2 bg-muted/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">ステップ {i + 1}</span>
            {content.items.length > 1 && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeItem(i)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">タイトル</Label>
            <Input
              value={item.title}
              onChange={e => updateItem(i, { title: e.target.value })}
              placeholder="ステップのタイトル"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">説明（任意）</Label>
            <Textarea
              value={item.description ?? ''}
              onChange={e => updateItem(i, { description: e.target.value || undefined })}
              rows={2}
              placeholder="補足説明"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">補足メモ（任意）</Label>
            <Input
              value={item.sub_note ?? ''}
              onChange={e => updateItem(i, { sub_note: e.target.value || undefined })}
              placeholder="グレー背景で表示されるメモ"
            />
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full" onClick={addItem}>
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        ステップを追加
      </Button>
    </div>
  )
}

function CheckListForm({ content, onChange }: {
  content: CheckListContent
  onChange: (c: CheckListContent) => void
}) {
  const updateItem = (i: number, val: string) => {
    const items = content.items.map((item, idx) => idx === i ? val : item)
    onChange({ ...content, items })
  }
  const addItem = () => onChange({ ...content, items: [...content.items, ''] })
  const removeItem = (i: number) => onChange({ ...content, items: content.items.filter((_, idx) => idx !== i) })

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>タイトル（任意）</Label>
        <Input
          value={content.title ?? ''}
          onChange={e => onChange({ ...content, title: e.target.value || undefined })}
          placeholder="リストの見出し"
        />
      </div>
      <div className="space-y-2">
        {content.items.map((item, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={item}
              onChange={e => updateItem(i, e.target.value)}
              placeholder={`項目 ${i + 1}`}
              className="flex-1"
            />
            {content.items.length > 1 && (
              <Button variant="ghost" size="icon" className="flex-shrink-0" onClick={() => removeItem(i)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" className="w-full" onClick={addItem}>
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        項目を追加
      </Button>
    </div>
  )
}

function FaqForm({ content, onChange }: {
  content: FaqContent
  onChange: (c: FaqContent) => void
}) {
  const updateItem = (i: number, patch: Partial<FaqContent['items'][number]>) => {
    const items = content.items.map((item, idx) => idx === i ? { ...item, ...patch } : item)
    onChange({ items })
  }
  const addItem = () => onChange({ items: [...content.items, { question: '', answer: '' }] })
  const removeItem = (i: number) => onChange({ items: content.items.filter((_, idx) => idx !== i) })

  return (
    <div className="space-y-3">
      {content.items.map((item, i) => (
        <div key={i} className="border rounded-lg p-3 space-y-2 bg-muted/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Q{i + 1}</span>
            {content.items.length > 1 && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeItem(i)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">質問</Label>
            <Input value={item.question} onChange={e => updateItem(i, { question: e.target.value })} placeholder="質問文" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">回答</Label>
            <Textarea value={item.answer} onChange={e => updateItem(i, { answer: e.target.value })} rows={3} placeholder="回答文" />
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full" onClick={addItem}>
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Q&A を追加
      </Button>
    </div>
  )
}

function TableForm({ content, onChange }: {
  content: TableContent
  onChange: (c: TableContent) => void
}) {
  const cols = content.headers.length

  const updateHeader = (i: number, val: string) => {
    const headers = content.headers.map((h, idx) => idx === i ? val : h)
    onChange({ ...content, headers })
  }
  const updateCell = (ri: number, ci: number, val: string) => {
    const rows = content.rows.map((row, ridx) =>
      ridx === ri ? row.map((cell, cidx) => cidx === ci ? val : cell) : row
    )
    onChange({ ...content, rows })
  }
  const addRow = () => onChange({ ...content, rows: [...content.rows, Array(cols).fill('')] })
  const removeRow = (i: number) => onChange({ ...content, rows: content.rows.filter((_, idx) => idx !== i) })
  const addCol = () => onChange({
    ...content,
    headers: [...content.headers, ''],
    rows: content.rows.map(r => [...r, '']),
  })
  const removeCol = (ci: number) => onChange({
    ...content,
    headers: content.headers.filter((_, idx) => idx !== ci),
    rows: content.rows.map(r => r.filter((_, idx) => idx !== ci)),
  })

  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1.5">
        <Label>キャプション（任意）</Label>
        <Input
          value={content.caption ?? ''}
          onChange={e => onChange({ ...content, caption: e.target.value || undefined })}
          placeholder="表のキャプション"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>ヘッダー行</Label>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addCol}>列追加</Button>
            {cols > 1 && (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => removeCol(cols - 1)}>
                列削除
              </Button>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {content.headers.map((h, i) => (
            <Input key={i} value={h} onChange={e => updateHeader(i, e.target.value)} placeholder={`列${i + 1}`} className="flex-1" />
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <Label>データ行</Label>
        {content.rows.map((row, ri) => (
          <div key={ri} className="flex gap-2 items-center">
            {row.map((cell, ci) => (
              <Input key={ci} value={cell} onChange={e => updateCell(ri, ci, e.target.value)} placeholder={`R${ri + 1}C${ci + 1}`} className="flex-1" />
            ))}
            {content.rows.length > 1 && (
              <Button variant="ghost" size="icon" className="flex-shrink-0" onClick={() => removeRow(ri)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ))}
        <Button variant="outline" size="sm" className="w-full mt-1" onClick={addRow}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          行を追加
        </Button>
      </div>
    </div>
  )
}

function KeyValueForm({ content, onChange }: {
  content: KeyValueContent
  onChange: (c: KeyValueContent) => void
}) {
  const updateRow = (i: number, patch: Partial<KeyValueContent['rows'][number]>) => {
    const rows = content.rows.map((row, idx) => idx === i ? { ...row, ...patch } : row)
    onChange({ ...content, rows })
  }
  const addRow = () => onChange({ ...content, rows: [...content.rows, { label: '', value: '' }] })
  const removeRow = (i: number) => onChange({ ...content, rows: content.rows.filter((_, idx) => idx !== i) })

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>タイトル（任意）</Label>
        <Input value={content.title ?? ''} onChange={e => onChange({ ...content, title: e.target.value || undefined })} placeholder="一覧のタイトル" />
      </div>
      {content.rows.map((row, i) => (
        <div key={i} className="flex gap-2 items-start">
          <Input value={row.label} onChange={e => updateRow(i, { label: e.target.value })} placeholder="ラベル" className="w-32 flex-shrink-0" />
          <Textarea value={row.value} onChange={e => updateRow(i, { value: e.target.value })} placeholder="値" rows={2} className="flex-1" />
          {content.rows.length > 1 && (
            <Button variant="ghost" size="icon" className="flex-shrink-0 mt-1" onClick={() => removeRow(i)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full" onClick={addRow}>
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        行を追加
      </Button>
    </div>
  )
}

function TwoColumnForm({ content, onChange }: {
  content: TwoColumnContent
  onChange: (c: TwoColumnContent) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {(['left', 'right'] as const).map(side => (
        <div key={side} className="space-y-2 border rounded-lg p-3 bg-muted/20">
          <span className="text-xs font-semibold text-muted-foreground">{side === 'left' ? '左カード' : '右カード'}</span>
          <div className="space-y-1.5">
            <Label className="text-xs">タイトル</Label>
            <Input value={content[side].title} onChange={e => onChange({ ...content, [side]: { ...content[side], title: e.target.value } })} placeholder="カードタイトル" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">本文</Label>
            <Textarea value={content[side].body} onChange={e => onChange({ ...content, [side]: { ...content[side], body: e.target.value } })} rows={3} placeholder="カード本文" />
          </div>
        </div>
      ))}
    </div>
  )
}

function ScriptBoxForm({ content, onChange }: {
  content: ScriptBoxContent
  onChange: (c: ScriptBoxContent) => void
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>ラベル（任意）</Label>
        <Input value={content.label ?? ''} onChange={e => onChange({ ...content, label: e.target.value || undefined })} placeholder="声がけ例" />
      </div>
      <div className="space-y-1.5">
        <Label>テキスト</Label>
        <Textarea value={content.text} onChange={e => onChange({ ...content, text: e.target.value })} rows={3} placeholder="スクリプトテキスト" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ディスパッチャ
// ---------------------------------------------------------------------------
export function BlockForm<T extends BlockType>({ type, content, onChange }: BlockFormProps<T>) {
  switch (type) {
    case 'section_header':
      return <SectionHeaderForm content={content as SectionHeaderContent} onChange={c => onChange(c as BlockContentMap[T])} />
    case 'paragraph':
      return <ParagraphForm content={content as ParagraphContent} onChange={c => onChange(c as BlockContentMap[T])} />
    case 'alert':
      return <AlertForm content={content as AlertContent} onChange={c => onChange(c as BlockContentMap[T])} />
    case 'steps':
      return <StepsForm content={content as StepsContent} onChange={c => onChange(c as BlockContentMap[T])} />
    case 'check_list':
      return <CheckListForm content={content as CheckListContent} onChange={c => onChange(c as BlockContentMap[T])} />
    case 'faq':
      return <FaqForm content={content as FaqContent} onChange={c => onChange(c as BlockContentMap[T])} />
    case 'table':
      return <TableForm content={content as TableContent} onChange={c => onChange(c as BlockContentMap[T])} />
    case 'key_value':
      return <KeyValueForm content={content as KeyValueContent} onChange={c => onChange(c as BlockContentMap[T])} />
    case 'two_column':
      return <TwoColumnForm content={content as TwoColumnContent} onChange={c => onChange(c as BlockContentMap[T])} />
    case 'script_box':
      return <ScriptBoxForm content={content as ScriptBoxContent} onChange={c => onChange(c as BlockContentMap[T])} />
    case 'divider':
      return <p className="text-sm text-muted-foreground">区切り線には設定項目はありません。</p>
    default:
      return null
  }
}
