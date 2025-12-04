import { useState, useEffect, useCallback } from 'react'
import { logger } from '@/utils/logger'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Pencil, Trash2, Save, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { CATEGORY_CONFIG } from '@/utils/scheduleUtils'

// シンプルな通知ヘルパー
const notify = {
  success: (message: string) => logger.log('✅', message),
  error: (message: string) => { logger.error('❌', message); alert(message) }
}

// 公演カテゴリの定義
const EVENT_CATEGORIES = [
  { id: 'open', label: 'オープン公演' },
  { id: 'private', label: '貸切公演' },
  { id: 'gmtest', label: 'GMテスト' },
  { id: 'testplay', label: 'テストプレイ' },
  { id: 'trip', label: '出張公演' },
  { id: 'venue_rental', label: '場所貸し' },
  { id: 'venue_rental_free', label: '場所貸無料' },
  { id: 'package', label: 'パッケージ会' },
] as const

interface BookingNotice {
  id: string
  content: string
  applicable_types: string[]
  sort_order: number
  is_active: boolean
  store_id: string | null
  created_at: string
  updated_at: string
}

interface Store {
  id: string
  name: string
  short_name: string
}

export function BookingNoticeSettings() {
  const [notices, setNotices] = useState<BookingNotice[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  
  // 編集ダイアログ
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingNotice, setEditingNotice] = useState<BookingNotice | null>(null)
  const [editForm, setEditForm] = useState({
    content: '',
    applicable_types: [] as string[],
    store_id: '' as string | null,
    is_active: true
  })

  // データ取得
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [noticesRes, storesRes] = await Promise.all([
        supabase
          .from('booking_notices')
          .select('*')
          .order('sort_order', { ascending: true }),
        supabase
          .from('stores')
          .select('id, name, short_name')
          .order('name')
      ])

      if (noticesRes.error) throw noticesRes.error
      if (storesRes.error) throw storesRes.error

      setNotices(noticesRes.data || [])
      setStores(storesRes.data || [])
    } catch (error) {
      logger.error('データ取得エラー:', error)
      notify.error('データの取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // 新規追加
  const handleAdd = () => {
    setEditingNotice(null)
    setEditForm({
      content: '',
      applicable_types: ['open', 'private'], // デフォルトでオープンと貸切を選択
      store_id: null,
      is_active: true
    })
    setEditDialogOpen(true)
  }

  // 編集
  const handleEdit = (notice: BookingNotice) => {
    setEditingNotice(notice)
    setEditForm({
      content: notice.content,
      applicable_types: notice.applicable_types || [],
      store_id: notice.store_id,
      is_active: notice.is_active
    })
    setEditDialogOpen(true)
  }

  // 保存
  const handleSave = async () => {
    if (!editForm.content.trim()) {
      notify.error('注意事項の内容を入力してください')
      return
    }
    if (editForm.applicable_types.length === 0) {
      notify.error('適用カテゴリを1つ以上選択してください')
      return
    }

    setIsSaving(true)
    try {
      if (editingNotice) {
        // 更新
        const { error } = await supabase
          .from('booking_notices')
          .update({
            content: editForm.content.trim(),
            applicable_types: editForm.applicable_types,
            store_id: editForm.store_id || null,
            is_active: editForm.is_active,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingNotice.id)

        if (error) throw error
        notify.success('注意事項を更新しました')
      } else {
        // 新規作成
        const maxSortOrder = notices.length > 0 
          ? Math.max(...notices.map(n => n.sort_order)) 
          : 0

        const { error } = await supabase
          .from('booking_notices')
          .insert({
            content: editForm.content.trim(),
            applicable_types: editForm.applicable_types,
            store_id: editForm.store_id || null,
            is_active: editForm.is_active,
            sort_order: maxSortOrder + 1
          })

        if (error) throw error
        notify.success('注意事項を追加しました')
      }

      setEditDialogOpen(false)
      fetchData()
    } catch (error) {
      logger.error('保存エラー:', error)
      notify.error('保存に失敗しました')
    } finally {
      setIsSaving(false)
    }
  }

  // 削除
  const handleDelete = async (notice: BookingNotice) => {
    if (!confirm('この注意事項を削除しますか？')) return

    try {
      const { error } = await supabase
        .from('booking_notices')
        .delete()
        .eq('id', notice.id)

      if (error) throw error
      notify.success('注意事項を削除しました')
      fetchData()
    } catch (error) {
      logger.error('削除エラー:', error)
      notify.error('削除に失敗しました')
    }
  }

  // 有効/無効の切り替え
  const handleToggleActive = async (notice: BookingNotice) => {
    try {
      const { error } = await supabase
        .from('booking_notices')
        .update({ 
          is_active: !notice.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', notice.id)

      if (error) throw error
      
      setNotices(prev => prev.map(n => 
        n.id === notice.id ? { ...n, is_active: !n.is_active } : n
      ))
    } catch (error) {
      logger.error('更新エラー:', error)
      notify.error('更新に失敗しました')
    }
  }

  // カテゴリチェックボックスの変更
  const handleCategoryToggle = (categoryId: string) => {
    setEditForm(prev => ({
      ...prev,
      applicable_types: prev.applicable_types.includes(categoryId)
        ? prev.applicable_types.filter(c => c !== categoryId)
        : [...prev.applicable_types, categoryId]
    }))
  }

  // 並び替え（上へ）
  const handleMoveUp = async (index: number) => {
    if (index === 0) return
    
    const newNotices = [...notices]
    const temp = newNotices[index]
    newNotices[index] = newNotices[index - 1]
    newNotices[index - 1] = temp

    // sort_orderを更新
    try {
      await Promise.all([
        supabase
          .from('booking_notices')
          .update({ sort_order: index })
          .eq('id', newNotices[index].id),
        supabase
          .from('booking_notices')
          .update({ sort_order: index - 1 })
          .eq('id', newNotices[index - 1].id)
      ])
      
      setNotices(newNotices.map((n, i) => ({ ...n, sort_order: i })))
    } catch (error) {
      logger.error('並び替えエラー:', error)
      notify.error('並び替えに失敗しました')
    }
  }

  // 並び替え（下へ）
  const handleMoveDown = async (index: number) => {
    if (index === notices.length - 1) return
    
    const newNotices = [...notices]
    const temp = newNotices[index]
    newNotices[index] = newNotices[index + 1]
    newNotices[index + 1] = temp

    // sort_orderを更新
    try {
      await Promise.all([
        supabase
          .from('booking_notices')
          .update({ sort_order: index })
          .eq('id', newNotices[index].id),
        supabase
          .from('booking_notices')
          .update({ sort_order: index + 1 })
          .eq('id', newNotices[index + 1].id)
      ])
      
      setNotices(newNotices.map((n, i) => ({ ...n, sort_order: i })))
    } catch (error) {
      logger.error('並び替えエラー:', error)
      notify.error('並び替えに失敗しました')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>注意事項設定</CardTitle>
              <CardDescription>
                予約時に表示する注意事項を管理します。公演カテゴリごとに表示/非表示を設定できます。
              </CardDescription>
            </div>
            <Button onClick={handleAdd}>
              <Plus className="w-4 h-4 mr-2" />
              追加
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {notices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              注意事項がまだ登録されていません
            </div>
          ) : (
            <div className="space-y-2">
              {notices.map((notice, index) => (
                <div
                  key={notice.id}
                  className={`flex items-start gap-3 p-3 border rounded-lg ${
                    notice.is_active ? 'bg-white' : 'bg-gray-50 opacity-60'
                  }`}
                >
                  {/* 並び替えボタン */}
                  <div className="flex flex-col gap-0.5 pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                    >
                      ▲
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={() => handleMoveDown(index)}
                      disabled={index === notices.length - 1}
                    >
                      ▼
                    </Button>
                  </div>

                  {/* 内容 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm mb-2">{notice.content}</p>
                    <div className="flex flex-wrap gap-1">
                      {notice.applicable_types?.map(type => {
                        const config = CATEGORY_CONFIG[type as keyof typeof CATEGORY_CONFIG]
                        return (
                          <Badge
                            key={type}
                            variant="secondary"
                            className={`text-xs ${config?.badgeColor || 'bg-gray-100'}`}
                          >
                            {config?.label || type}
                          </Badge>
                        )
                      })}
                      {notice.store_id && (
                        <Badge variant="outline" className="text-xs">
                          {stores.find(s => s.id === notice.store_id)?.short_name || '特定店舗'}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* 有効/無効スイッチ */}
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={notice.is_active}
                      onCheckedChange={() => handleToggleActive(notice)}
                    />
                    <span className="text-xs text-muted-foreground w-8">
                      {notice.is_active ? '有効' : '無効'}
                    </span>
                  </div>

                  {/* アクションボタン */}
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => handleEdit(notice)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => handleDelete(notice)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 編集ダイアログ */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingNotice ? '注意事項を編集' : '注意事項を追加'}
            </DialogTitle>
            <DialogDescription>
              予約画面に表示する注意事項を設定します
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* 内容 */}
            <div className="space-y-2">
              <Label>内容 <span className="text-red-500">*</span></Label>
              <Textarea
                value={editForm.content}
                onChange={(e) => setEditForm(prev => ({ ...prev, content: e.target.value }))}
                placeholder="注意事項の内容を入力"
                rows={3}
              />
            </div>

            {/* 適用カテゴリ */}
            <div className="space-y-2">
              <Label>適用カテゴリ <span className="text-red-500">*</span></Label>
              <div className="grid grid-cols-2 gap-2">
                {EVENT_CATEGORIES.map(category => (
                  <div key={category.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`category-${category.id}`}
                      checked={editForm.applicable_types.includes(category.id)}
                      onCheckedChange={() => handleCategoryToggle(category.id)}
                    />
                    <label
                      htmlFor={`category-${category.id}`}
                      className="text-sm cursor-pointer"
                    >
                      {category.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* 店舗指定 */}
            <div className="space-y-2">
              <Label>店舗指定（任意）</Label>
              <Select
                value={editForm.store_id || 'all'}
                onValueChange={(value) => setEditForm(prev => ({ 
                  ...prev, 
                  store_id: value === 'all' ? null : value 
                }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="全店舗共通" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全店舗共通</SelectItem>
                  {stores.map(store => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                特定の店舗のみに表示する場合は選択してください
              </p>
            </div>

            {/* 有効/無効 */}
            <div className="flex items-center space-x-2">
              <Switch
                id="is-active"
                checked={editForm.is_active}
                onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, is_active: checked }))}
              />
              <Label htmlFor="is-active">有効にする</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  保存
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

