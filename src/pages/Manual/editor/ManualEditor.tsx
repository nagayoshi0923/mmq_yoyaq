/**
 * マニュアルページエディター
 *
 * 新規ページ作成 / 既存ページ編集の両方に対応。
 * ページ設定 + ブロックリストの編集 UI を提供する。
 */
import { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft, Save, Plus, Trash2, ChevronUp, ChevronDown,
  GripVertical, Pencil, X, Eye, FileText, Database,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { manualPageApi, manualBlockApi } from '@/lib/api/manualApi'
import { runSeedLegacyPages, type SeedResult } from './seedLegacyPages'
import { BlockForm } from './BlockForm'
import { BlockRenderer } from '../renderer/BlockRenderer'
import { BLOCK_TYPE_META } from '@/types/manual'
import type {
  ManualPage, ManualBlock, ManualPageWithBlocks,
  BlockType, BlockContentMap,
} from '@/types/manual'

// ---------------------------------------------------------------------------
// ブロック種別ピッカーダイアログ
// ---------------------------------------------------------------------------
function BlockTypePicker({
  open,
  onSelect,
  onClose,
}: {
  open: boolean
  onSelect: (type: BlockType) => void
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>ブロックの種類を選択</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 py-2">
          {BLOCK_TYPE_META.map(meta => (
            <button
              key={meta.type}
              onClick={() => { onSelect(meta.type); onClose() }}
              className="flex flex-col items-start gap-1 border rounded-lg p-3 text-left hover:border-primary hover:bg-primary/5 transition-colors"
            >
              <span className="font-medium text-sm">{meta.label}</span>
              <span className="text-xs text-muted-foreground leading-snug">{meta.description}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// ブロック編集ダイアログ
// ---------------------------------------------------------------------------
function BlockEditDialog({
  block,
  onSave,
  onClose,
}: {
  block: ManualBlock
  onSave: (content: BlockContentMap[BlockType]) => void
  onClose: () => void
}) {
  const [content, setContent] = useState<BlockContentMap[BlockType]>(
    JSON.parse(JSON.stringify(block.content))
  )
  const meta = BLOCK_TYPE_META.find(m => m.type === block.block_type)

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{meta?.label ?? block.block_type} を編集</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <BlockForm
            type={block.block_type as BlockType}
            content={content}
            onChange={c => setContent(c)}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>キャンセル</Button>
          <Button onClick={() => { onSave(content); onClose() }}>
            <Save className="h-4 w-4 mr-1.5" />
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// ブロック1件の行
// ---------------------------------------------------------------------------
function BlockRow({
  block,
  isFirst,
  isLast,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  block: ManualBlock
  isFirst: boolean
  isLast: boolean
  onEdit: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const meta = BLOCK_TYPE_META.find(m => m.type === block.block_type)

  // ブロック内容のプレビュー文字列
  const preview = (() => {
    const c = block.content as Record<string, unknown>
    if (typeof c.title === 'string' && c.title) return c.title
    if (typeof c.text === 'string' && c.text) return c.text.slice(0, 60)
    if (typeof c.body === 'string' && c.body) return c.body.slice(0, 60)
    if (Array.isArray(c.items) && c.items.length > 0) {
      const first = c.items[0]
      if (typeof first === 'string') return first.slice(0, 60)
      if (typeof first === 'object' && first !== null) {
        const f = first as Record<string, unknown>
        if (typeof f.title === 'string') return f.title.slice(0, 60)
        if (typeof f.question === 'string') return f.question.slice(0, 60)
      }
    }
    return ''
  })()

  return (
    <div className="flex items-start gap-2 border rounded-lg p-3 bg-background hover:border-primary/30 transition-colors group">
      <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0 cursor-grab" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0">
            {meta?.label ?? block.block_type}
          </Badge>
        </div>
        {preview && (
          <p className="text-xs text-muted-foreground truncate">{preview}</p>
        )}
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={isFirst} onClick={onMoveUp}>
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={isLast} onClick={onMoveDown}>
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ページ設定フォーム
// ---------------------------------------------------------------------------
function PageSettingsForm({
  title, setTitle,
  slug, setSlug,
  description, setDescription,
  category, setCategory,
  isNew,
}: {
  title: string; setTitle: (v: string) => void
  slug: string;  setSlug:  (v: string) => void
  description: string; setDescription: (v: string) => void
  category: 'staff' | 'admin'; setCategory: (v: 'staff' | 'admin') => void
  isNew: boolean
}) {
  // タイトルからスラッグを自動生成（新規作成時のみ）
  const handleTitleChange = (val: string) => {
    setTitle(val)
    if (isNew) {
      setSlug(
        val.toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .slice(0, 50)
      )
    }
  }

  return (
    <div className="space-y-4 border rounded-xl p-5 bg-muted/30">
      <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">ページ設定</p>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>タイトル <span className="text-destructive">*</span></Label>
          <Input value={title} onChange={e => handleTitleChange(e.target.value)} placeholder="ページタイトル" />
        </div>
        <div className="space-y-1.5">
          <Label>スラッグ（URL用ID）<span className="text-destructive">*</span></Label>
          <Input
            value={slug}
            onChange={e => setSlug(e.target.value)}
            placeholder="my-page"
            className="font-mono text-sm"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>説明（サイドバーの補足として使用）</Label>
        <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="ページの概要説明" />
      </div>
      <div className="space-y-1.5">
        <Label>カテゴリ</Label>
        <Select value={category} onValueChange={v => setCategory(v as 'staff' | 'admin')}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="staff">スタッフ向け</SelectItem>
            <SelectItem value="admin">運営向け</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// プレビューパネル
// ---------------------------------------------------------------------------
function PreviewPanel({ blocks }: { blocks: ManualBlock[] }) {
  if (blocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm border rounded-xl border-dashed">
        ブロックを追加するとプレビューが表示されます
      </div>
    )
  }
  return (
    <div className="border rounded-xl p-5 space-y-6 bg-white">
      {blocks.map(block => (
        <BlockRenderer key={block.id} block={block} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 既存ページ移行ダイアログ
// ---------------------------------------------------------------------------
function MigrateDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [result, setResult] = useState<SeedResult | null>(null)

  const handleRun = async () => {
    setRunning(true)
    setLog([])
    setResult(null)
    const res = await runSeedLegacyPages(msg => setLog(prev => [...prev, msg]))
    setResult(res)
    setRunning(false)
  }

  const handleClose = () => {
    if (result) onDone()
    onClose()
    setLog([])
    setResult(null)
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            既存ページを DB に移行
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          {!running && !result && (
            <>
              <p className="text-muted-foreground leading-relaxed">
                ハードコードで作られた既存の8ページをデータベースに移行します。<br />
                移行後はUIから編集できるようになります。
              </p>
              <ul className="space-y-1 text-muted-foreground">
                {['受付・チェックイン', '事前アンケート・配役', 'クーポン受付対応',
                  'クーポン・チケット種類', '予約管理', 'スタッフ管理',
                  'シフト・スケジュール', 'クーポン管理'].map(name => (
                  <li key={name} className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                    {name}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                ※ 既に同名ページが存在する場合はスキップされます。
              </p>
            </>
          )}

          {(running || log.length > 0) && (
            <div className="bg-muted/30 rounded-md p-3 font-mono text-xs space-y-1 max-h-48 overflow-y-auto">
              {log.map((line, i) => (
                <p key={i} className={
                  line.startsWith('✓') ? 'text-green-700' :
                  line.startsWith('✗') ? 'text-red-600' :
                  line.startsWith('スキップ') ? 'text-muted-foreground' : ''
                }>
                  {line}
                </p>
              ))}
              {running && <p className="animate-pulse">…</p>}
            </div>
          )}

          {result && (
            <div className="space-y-1 text-xs">
              <p className="text-green-700">✓ 成功: {result.success.length}件</p>
              {result.skipped.length > 0 && <p className="text-muted-foreground">スキップ: {result.skipped.length}件</p>}
              {result.errors.length > 0 && <p className="text-red-600">エラー: {result.errors.length}件</p>}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={running}>
            {result ? '閉じる' : 'キャンセル'}
          </Button>
          {!result && (
            <Button onClick={handleRun} disabled={running}>
              <Database className="h-4 w-4 mr-1.5" />
              {running ? '移行中…' : '移行を開始'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// メインエディター
// ---------------------------------------------------------------------------
interface ManualEditorProps {
  /** 既存ページIDを渡すと編集モード、undefined で新規作成 */
  pageId?: string
  onDone: (savedPage: ManualPage) => void
  onCancel: () => void
}

export function ManualEditor({ pageId, onDone, onCancel }: ManualEditorProps) {
  const isNew = !pageId

  // ページ設定
  const [title, setTitle]       = useState('')
  const [slug, setSlug]         = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<'staff' | 'admin'>('staff')

  // ブロック
  const [blocks, setBlocks] = useState<ManualBlock[]>([])

  // UI 状態
  const [loading, setLoading]       = useState(!isNew)
  const [saving, setSaving]         = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [editingBlock, setEditingBlock] = useState<ManualBlock | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [showMigrateDialog, setShowMigrateDialog] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  // 既存ページ読み込み
  useEffect(() => {
    if (!pageId) return
    manualPageApi.getWithBlocks(pageId)
      .then((data: ManualPageWithBlocks) => {
        setTitle(data.title)
        setSlug(data.slug)
        setDescription(data.description ?? '')
        setCategory(data.category)
        setBlocks(data.blocks)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [pageId])

  // ブロック追加
  const handleAddBlock = useCallback(async (type: BlockType) => {
    const meta = BLOCK_TYPE_META.find(m => m.type === type)!
    const newBlock: ManualBlock = {
      id: `temp-${Date.now()}`,
      page_id: pageId ?? '',
      block_type: type,
      content: JSON.parse(JSON.stringify(meta.defaultContent)),
      display_order: blocks.length,
      created_at: '',
      updated_at: '',
    }
    setBlocks(prev => [...prev, newBlock])
    setEditingBlock(newBlock)
  }, [blocks.length, pageId])

  // ブロックコンテンツ更新（ローカル）
  const handleBlockContentSave = useCallback((blockId: string, content: BlockContentMap[BlockType]) => {
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, content } : b))
  }, [])

  // ブロック並び替え
  const moveBlock = useCallback((index: number, direction: -1 | 1) => {
    setBlocks(prev => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }, [])

  // ブロック削除（ローカル）
  const deleteBlock = useCallback((blockId: string) => {
    setBlocks(prev => prev.filter(b => b.id !== blockId))
  }, [])

  // 保存
  const handleSave = async () => {
    if (!title.trim()) { setError('タイトルは必須です'); return }
    if (!slug.trim())  { setError('スラッグは必須です');   return }
    setSaving(true)
    setError(null)
    try {
      let page: ManualPage

      if (isNew) {
        // 1. ページ作成
        page = await manualPageApi.create({ title, slug, description: description || undefined, category })
      } else {
        // 1. ページ更新
        page = await manualPageApi.update(pageId!, { title, slug, description: description || null, category })
        // 2. 既存ブロックを全削除して再作成（シンプル実装）
        const existingBlocks = await manualPageApi.getWithBlocks(pageId!).then(d => d.blocks)
        await Promise.all(existingBlocks.map(b => manualBlockApi.delete(b.id)))
      }

      // 3. ブロックを順番通りに登録
      await Promise.all(
        blocks.map((b, i) =>
          manualBlockApi.create({
            page_id: page.id,
            block_type: b.block_type as BlockType,
            content: b.content as BlockContentMap[BlockType],
            display_order: i,
          })
        )
      )

      onDone(page)
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        読み込み中…
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-12">
      {/* ヘッダー */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-bold">
            {isNew ? '新規ページ作成' : 'ページを編集'}
          </h2>
        </div>
        <div className="flex gap-2">
          {isNew && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMigrateDialog(true)}
            >
              <Database className="h-4 w-4 mr-1.5" />
              既存ページを移行
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPreview(v => !v)}
          >
            <Eye className="h-4 w-4 mr-1.5" />
            {showPreview ? 'エディター' : 'プレビュー'}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1.5" />
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="border border-destructive/50 bg-destructive/10 text-destructive rounded-md px-4 py-3 text-sm flex gap-2">
          <X className="h-4 w-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {showPreview ? (
        <>
          <div className="space-y-1">
            <h2 className="text-2xl font-bold">{title || '（タイトル未設定）'}</h2>
            {description && <p className="text-muted-foreground text-sm">{description}</p>}
          </div>
          <PreviewPanel blocks={blocks} />
        </>
      ) : (
        <>
          {/* ページ設定 */}
          <PageSettingsForm
            title={title} setTitle={setTitle}
            slug={slug}   setSlug={setSlug}
            description={description} setDescription={setDescription}
            category={category} setCategory={setCategory}
            isNew={isNew}
          />

          {/* ブロックリスト */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                コンテンツブロック（{blocks.length}件）
              </p>
            </div>

            {blocks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-24 text-muted-foreground text-sm border rounded-xl border-dashed">
                まだブロックがありません。下のボタンから追加してください。
              </div>
            ) : (
              <div className="space-y-2">
                {blocks.map((block, i) => (
                  <BlockRow
                    key={block.id}
                    block={block}
                    isFirst={i === 0}
                    isLast={i === blocks.length - 1}
                    onEdit={() => setEditingBlock(block)}
                    onDelete={() => deleteBlock(block.id)}
                    onMoveUp={() => moveBlock(i, -1)}
                    onMoveDown={() => moveBlock(i, 1)}
                  />
                ))}
              </div>
            )}

            <Button
              variant="outline"
              className="w-full border-dashed"
              onClick={() => setShowPicker(true)}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              ブロックを追加
            </Button>
          </div>
        </>
      )}

      {/* ブロック種別ピッカー */}
      <BlockTypePicker
        open={showPicker}
        onSelect={handleAddBlock}
        onClose={() => setShowPicker(false)}
      />

      {/* ブロック編集ダイアログ */}
      {editingBlock && (
        <BlockEditDialog
          block={editingBlock}
          onSave={content => handleBlockContentSave(editingBlock.id, content)}
          onClose={() => setEditingBlock(null)}
        />
      )}

      {/* 既存ページ移行ダイアログ */}
      <MigrateDialog
        open={showMigrateDialog}
        onClose={() => setShowMigrateDialog(false)}
        onDone={() => {
          setShowMigrateDialog(false)
          onCancel() // 移行後はページ一覧に戻る
        }}
      />
    </div>
  )
}
