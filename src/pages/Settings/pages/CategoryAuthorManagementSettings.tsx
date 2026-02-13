/**
 * カテゴリ・作者管理設定
 * organization_categories / organization_authors テーブルの CRUD 管理
 * 一覧・追加・編集・削除・並び替え・使用シナリオ数表示
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tags,
  UserCog,
  Plus,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  Loader2,
  Save,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { showToast } from '@/utils/toast'
import { logger } from '@/utils/logger'
import { useQueryClient } from '@tanstack/react-query'

// ---------- 型定義 ----------
interface MasterItem {
  id: string
  organization_id: string
  name: string
  sort_order: number
  created_at: string
  updated_at: string
}

interface ItemWithUsage extends MasterItem {
  usage_count: number
}

// ---------- 汎用マスタリスト管理コンポーネント ----------
interface MasterListManagerProps {
  title: string
  description: string
  icon: React.ReactNode
  tableName: 'organization_categories' | 'organization_authors'
  /** organization_scenarios_with_master の検索対象カラム */
  scenarioColumn: 'genre' | 'author'
  /** genre は TEXT[] 配列、author は TEXT スカラー */
  isArray: boolean
  /** org ID */
  organizationId: string | null
  /** 他のリストとの連携リフレッシュ用 */
  refreshKey: number
  onRefresh: () => void
}

function MasterListManager({
  title,
  description,
  icon,
  tableName,
  scenarioColumn,
  isArray,
  organizationId,
  refreshKey,
  onRefresh,
}: MasterListManagerProps) {
  const [items, setItems] = useState<ItemWithUsage[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // ダイアログ
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add')
  const [editingItem, setEditingItem] = useState<MasterItem | null>(null)
  const [inputName, setInputName] = useState('')

  // 並び替え変更追跡
  const [hasOrderChanges, setHasOrderChanges] = useState(false)

  const queryClient = useQueryClient()

  // ---------- データ取得 ----------
  const fetchItems = useCallback(async () => {
    if (!organizationId) return
    setLoading(true)
    try {
      // 1. マスタ一覧取得
      const { data: masterData, error: masterError } = await supabase
        .from(tableName)
        .select('*')
        .eq('organization_id', organizationId)
        .order('sort_order', { ascending: true })

      if (masterError) throw masterError

      // 2. 使用シナリオ数をカウント
      const { data: scenarioData, error: scenarioError } = await supabase
        .from('organization_scenarios_with_master')
        .select(scenarioColumn)
        .eq('organization_id', organizationId)

      if (scenarioError) throw scenarioError

      // 使用数マップ
      const usageMap = new Map<string, number>()
      if (isArray) {
        // genre は TEXT[] なので展開してカウント
        scenarioData?.forEach((s: any) => {
          const arr = s[scenarioColumn]
          if (Array.isArray(arr)) {
            arr.forEach((val: string) => {
              if (val) usageMap.set(val, (usageMap.get(val) || 0) + 1)
            })
          }
        })
      } else {
        // author はスカラーなのでそのままカウント
        scenarioData?.forEach((s: any) => {
          const val = s[scenarioColumn]
          if (val) usageMap.set(val, (usageMap.get(val) || 0) + 1)
        })
      }

      const itemsWithUsage: ItemWithUsage[] = (masterData || []).map((item: any) => ({
        ...item,
        usage_count: usageMap.get(item.name) || 0,
      }))

      setItems(itemsWithUsage)
      setHasOrderChanges(false)
    } catch (error) {
      logger.error(`${tableName} の取得エラー:`, error)
      showToast.error('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [organizationId, tableName, scenarioColumn, isArray])

  useEffect(() => {
    fetchItems()
  }, [fetchItems, refreshKey])

  // ---------- 追加 ----------
  const handleAdd = () => {
    setDialogMode('add')
    setEditingItem(null)
    setInputName('')
    setDialogOpen(true)
  }

  // ---------- 編集 ----------
  const handleEdit = (item: MasterItem) => {
    setDialogMode('edit')
    setEditingItem(item)
    setInputName(item.name)
    setDialogOpen(true)
  }

  // ---------- 保存（追加/編集） ----------
  const handleSaveDialog = async () => {
    if (!organizationId) return
    const trimmedName = inputName.trim()
    if (!trimmedName) {
      showToast.warning('名前を入力してください')
      return
    }

    // 重複チェック
    const duplicate = items.find(
      (i) => i.name === trimmedName && i.id !== editingItem?.id
    )
    if (duplicate) {
      showToast.warning(`「${trimmedName}」は既に存在します`)
      return
    }

    setSaving(true)
    try {
      if (dialogMode === 'add') {
        // 新規追加: sort_order は末尾
        const maxOrder = items.length > 0 ? Math.max(...items.map((i) => i.sort_order)) : 0
        const { error } = await supabase.from(tableName).insert({
          organization_id: organizationId,
          name: trimmedName,
          sort_order: maxOrder + 1,
        })
        if (error) throw error
        showToast.success(`「${trimmedName}」を追加しました`)
      } else if (editingItem) {
        // 編集: 名前変更
        const oldName = editingItem.name
        const { error } = await supabase
          .from(tableName)
          .update({ name: trimmedName, updated_at: new Date().toISOString() })
          .eq('id', editingItem.id)
        if (error) throw error

        // シナリオ側の参照も一括更新
        if (oldName !== trimmedName) {
          await updateScenarioReferences(organizationId, oldName, trimmedName)
        }
        showToast.success(`「${trimmedName}」に更新しました`)
      }

      setDialogOpen(false)
      // React Query キャッシュ無効化
      queryClient.invalidateQueries({ queryKey: ['org-scenarios-options'] })
      queryClient.invalidateQueries({ queryKey: ['org-categories'] })
      queryClient.invalidateQueries({ queryKey: ['org-authors'] })
      await fetchItems()
      onRefresh()
    } catch (error) {
      logger.error('保存エラー:', error)
      showToast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // ---------- シナリオ参照の一括更新 ----------
  const updateScenarioReferences = async (
    orgId: string,
    oldName: string,
    newName: string
  ) => {
    try {
      if (isArray) {
        // genre (TEXT[]): 配列内の要素を置換
        // organization_scenarios の override_genre を更新
        const { data: affected } = await supabase
          .from('organization_scenarios')
          .select('id, override_genre')
          .eq('organization_id', orgId)
          .contains('override_genre', [oldName])

        if (affected && affected.length > 0) {
          for (const row of affected) {
            const updated = (row.override_genre || []).map((g: string) =>
              g === oldName ? newName : g
            )
            await supabase
              .from('organization_scenarios')
              .update({ override_genre: updated })
              .eq('id', row.id)
          }
        }
      } else {
        // author (TEXT): スカラー値を直接更新
        await supabase
          .from('organization_scenarios')
          .update({ override_author: newName })
          .eq('organization_id', orgId)
          .eq('override_author', oldName)
      }
    } catch (error) {
      logger.error('シナリオ参照の更新エラー:', error)
      // 名前変更は成功しているので warning
      showToast.warning('一部のシナリオ参照の更新に失敗しました')
    }
  }

  // ---------- 削除 ----------
  const handleDelete = async (item: MasterItem) => {
    if (!organizationId) return

    const usageItem = items.find((i) => i.id === item.id)
    const usage = usageItem?.usage_count || 0

    const message =
      usage > 0
        ? `「${item.name}」は ${usage} 件のシナリオで使用中です。\n削除すると、該当シナリオからもこのカテゴリが削除されます。\n本当に削除しますか？`
        : `「${item.name}」を削除しますか？`

    if (!window.confirm(message)) return

    setSaving(true)
    try {
      // シナリオ側の参照を削除
      if (usage > 0) {
        await removeScenarioReferences(organizationId, item.name)
      }

      // マスタから削除
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', item.id)

      if (error) throw error

      showToast.success(`「${item.name}」を削除しました`)
      queryClient.invalidateQueries({ queryKey: ['org-scenarios-options'] })
      queryClient.invalidateQueries({ queryKey: ['org-categories'] })
      queryClient.invalidateQueries({ queryKey: ['org-authors'] })
      await fetchItems()
      onRefresh()
    } catch (error) {
      logger.error('削除エラー:', error)
      showToast.error('削除に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // ---------- シナリオ参照の削除 ----------
  const removeScenarioReferences = async (orgId: string, name: string) => {
    try {
      if (isArray) {
        // genre (TEXT[]): 配列から要素を除去
        const { data: affected } = await supabase
          .from('organization_scenarios')
          .select('id, override_genre')
          .eq('organization_id', orgId)
          .contains('override_genre', [name])

        if (affected && affected.length > 0) {
          for (const row of affected) {
            const updated = (row.override_genre || []).filter(
              (g: string) => g !== name
            )
            await supabase
              .from('organization_scenarios')
              .update({ override_genre: updated })
              .eq('id', row.id)
          }
        }
      } else {
        // author (TEXT): null にクリア
        await supabase
          .from('organization_scenarios')
          .update({ override_author: null })
          .eq('organization_id', orgId)
          .eq('override_author', name)
      }
    } catch (error) {
      logger.error('シナリオ参照の削除エラー:', error)
    }
  }

  // ---------- 並び替え ----------
  const handleMoveUp = (index: number) => {
    if (index <= 0) return
    const newItems = [...items]
    ;[newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]]
    // sort_order を振り直し
    newItems.forEach((item, i) => {
      item.sort_order = i + 1
    })
    setItems(newItems)
    setHasOrderChanges(true)
  }

  const handleMoveDown = (index: number) => {
    if (index >= items.length - 1) return
    const newItems = [...items]
    ;[newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]]
    newItems.forEach((item, i) => {
      item.sort_order = i + 1
    })
    setItems(newItems)
    setHasOrderChanges(true)
  }

  const handleSaveOrder = async () => {
    if (!organizationId) return
    setSaving(true)
    try {
      // バッチ更新
      for (const item of items) {
        await supabase
          .from(tableName)
          .update({ sort_order: item.sort_order, updated_at: new Date().toISOString() })
          .eq('id', item.id)
      }
      showToast.success('並び順を保存しました')
      setHasOrderChanges(false)
      queryClient.invalidateQueries({ queryKey: ['org-scenarios-options'] })
      queryClient.invalidateQueries({ queryKey: ['org-categories'] })
      queryClient.invalidateQueries({ queryKey: ['org-authors'] })
    } catch (error) {
      logger.error('並び順保存エラー:', error)
      showToast.error('並び順の保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // ---------- レンダリング ----------
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription className="text-xs">{description}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasOrderChanges && (
              <Button size="sm" onClick={handleSaveOrder} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                並び順を保存
              </Button>
            )}
            <Button size="sm" onClick={handleAdd} disabled={saving}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              追加
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">読み込み中...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            まだ{title === 'カテゴリ管理' ? 'カテゴリ' : '作者'}が登録されていません。
            <br />
            「追加」ボタンから新しく登録してください。
          </div>
        ) : (
          <div className="border rounded-md">
            {/* ヘッダー */}
            <div className="grid grid-cols-[32px_1fr_80px_80px] gap-2 px-3 py-2 bg-muted/50 border-b text-xs font-medium text-muted-foreground">
              <div></div>
              <div>名前</div>
              <div className="text-center">使用数</div>
              <div className="text-center">操作</div>
            </div>
            {/* リスト */}
            {items.map((item, index) => (
              <div
                key={item.id}
                className="grid grid-cols-[32px_1fr_80px_80px] gap-2 px-3 py-2 border-b last:border-b-0 items-center hover:bg-muted/30 transition-colors"
              >
                {/* 並び替えボタン */}
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0 || saving}
                    className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                    title="上に移動"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveDown(index)}
                    disabled={index === items.length - 1 || saving}
                    className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                    title="下に移動"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                </div>

                {/* 名前 */}
                <div className="flex items-center gap-2">
                  <span className="text-sm">{item.name}</span>
                </div>

                {/* 使用数 */}
                <div className="text-center">
                  {item.usage_count > 0 ? (
                    <Badge variant="secondary" className="text-xs">
                      {item.usage_count}件
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">未使用</span>
                  )}
                </div>

                {/* 操作 */}
                <div className="flex items-center justify-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleEdit(item)}
                    disabled={saving}
                    className="p-1.5 rounded hover:bg-muted transition-colors"
                    title="編集"
                  >
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    disabled={saving}
                    className="p-1.5 rounded hover:bg-destructive/10 transition-colors"
                    title="削除"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* 追加/編集ダイアログ */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setInputName(''); setEditingItem(null) }; setDialogOpen(open) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'edit' ? `${title === 'カテゴリ管理' ? 'カテゴリ' : '作者'}名を編集` : `新しい${title === 'カテゴリ管理' ? 'カテゴリ' : '作者'}を追加`}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === 'edit'
                ? '名前を変更すると、使用中の全シナリオにも反映されます'
                : `新しい${title === 'カテゴリ管理' ? 'カテゴリ' : '作者'}名を入力してください`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="masterItemName">名前</Label>
              <Input
                id="masterItemName"
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                placeholder={title === 'カテゴリ管理' ? '例: アドベンチャー' : '例: 山田太郎'}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveDialog() }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              キャンセル
            </Button>
            <Button onClick={handleSaveDialog} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
              {dialogMode === 'edit' ? '更新' : '追加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// ---------- メインコンポーネント ----------
export function CategoryAuthorManagementSettings() {
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const loadOrgId = async () => {
      const orgId = await getCurrentOrganizationId()
      setOrganizationId(orgId)
      setLoading(false)
    }
    loadOrgId()
  }, [])

  const handleRefresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">読み込み中...</span>
      </div>
    )
  }

  if (!organizationId) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        組織情報が取得できませんでした
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <MasterListManager
        title="カテゴリ管理"
        description="シナリオのカテゴリ（ジャンル）を管理します。並び順はプルダウンの表示順に反映されます。"
        icon={<Tags className="h-5 w-5 text-primary" />}
        tableName="organization_categories"
        scenarioColumn="genre"
        isArray={true}
        organizationId={organizationId}
        refreshKey={refreshKey}
        onRefresh={handleRefresh}
      />

      <MasterListManager
        title="作者管理"
        description="シナリオの作者を管理します。並び順はプルダウンの表示順に反映されます。"
        icon={<UserCog className="h-5 w-5 text-primary" />}
        tableName="organization_authors"
        scenarioColumn="author"
        isArray={false}
        organizationId={organizationId}
        refreshKey={refreshKey}
        onRefresh={handleRefresh}
      />
    </div>
  )
}
