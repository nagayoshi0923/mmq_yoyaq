import { useState, useEffect } from 'react'
import { logger } from '@/utils/logger'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import { showToast } from '@/utils/toast'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { authorApi } from '@/lib/api'

interface AuthorEmailDialogProps {
  isOpen: boolean
  onClose: () => void
  authorName: string
  onSave?: () => void
}

export function AuthorEmailDialog({ isOpen, onClose, authorName, onSave }: AuthorEmailDialogProps) {
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // 作者データを読み込み
  useEffect(() => {
    if (isOpen && authorName) {
      loadAuthorData()
    } else {
      // ダイアログが閉じた時は状態をリセット
      setEmail('')
      setNotes('')
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, authorName])

  const loadAuthorData = async () => {
    setLoading(true)
    try {
      const author = await authorApi.getByName(authorName)
      if (author) {
        setEmail(author.email || '')
        setNotes(author.notes || '')
      } else {
        setEmail('')
        setNotes('')
      }
    } catch (error: any) {
      // テーブルが存在しない場合、またはレコードが見つからない場合は無視（初期状態のまま）
      if (error?.code === 'PGRST116' || error?.code === 'PGRST205' || error?.status === 404) {
        setEmail('')
        setNotes('')
      } else {
        logger.error('作者データの読み込みに失敗:', error)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await authorApi.upsertByName(authorName, {
        email: email.trim() || null,
        notes: notes.trim() || null
      })
      onSave?.()
      onClose()
    } catch (error: any) {
      // テーブルが存在しない場合はエラーメッセージを表示
      if (error?.code === 'PGRST205') {
        showToast.error('authorsテーブルが存在しません', 'SupabaseのSQL Editorでテーブルを作成してください')
      } else if (error?.code === 'PGRST116' || error?.status === 404) {
        showToast.error('レコードが見つかりませんでした')
      } else {
        logger.error('保存に失敗:', error)
        showToast.error('保存に失敗しました', getSafeErrorMessage(error, '不明なエラー'))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>作者メール設定 - {authorName}</DialogTitle>
          <DialogDescription>
            作者のメールアドレスとメモを設定できます
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">読み込み中...</div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                placeholder="example@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">メモ</Label>
              <Textarea
                id="notes"
                placeholder="備考や連絡事項など"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            キャンセル
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

