import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SingleDatePopover } from '@/components/ui/single-date-popover'
import { supabase } from '@/lib/supabase'
import { showToast } from '@/utils/toast'
import { logger } from '@/utils/logger'
import { useOrganization } from '@/hooks/useOrganization'
import { Trash2 } from 'lucide-react'

interface Store {
  id: string
  name: string
  short_name: string
  ownership_type?: 'corporate' | 'franchise' | 'office'
}

interface Scenario {
  id: string
  title: string
  author: string
}

export interface ProductionCostItem {
  id: string
  date: string
  category: string
  amount: number
  description?: string
  store_id?: string | null
  scenario_id?: string | null
}

interface ProductionCostDialogProps {
  isOpen: boolean
  onClose: () => void
  onSave: () => void
  stores: Store[]
  defaultStoreId?: string
  editingItem?: ProductionCostItem | null  // 編集モード用
}

/**
 * 制作費追加・編集ダイアログ
 * フランチャイズ売り上げダッシュボードから制作費を追加・編集するためのダイアログ
 */
export const ProductionCostDialog: React.FC<ProductionCostDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  stores,
  defaultStoreId,
  editingItem
}) => {
  const { organizationId } = useOrganization()
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    category: '制作費',
    amount: 0,
    description: '',
    store_id: defaultStoreId || '',
    scenario_id: ''
  })

  const isEditMode = !!editingItem

  // シナリオを読み込み
  useEffect(() => {
    const loadScenarios = async () => {
      if (!organizationId) return
      
      try {
        let query = supabase
          .from('scenarios')
          .select('id, title, author')
        
        // organization_id でフィルタ（マルチテナント対応）
        query = query.eq('organization_id', organizationId)
        
        query = query.order('title', { ascending: true })
        
        const { data, error } = await query
        
        if (error) throw error
        setScenarios(data || [])
      } catch (error) {
        logger.error('シナリオ読み込みエラー:', error)
      }
    }
    
    if (isOpen && organizationId) {
      loadScenarios()
    }
  }, [isOpen, organizationId])

  // ダイアログが開かれた時にフォームをリセット/設定
  useEffect(() => {
    if (isOpen) {
      if (editingItem) {
        // 編集モード：既存データを設定
        setFormData({
          date: editingItem.date,
          category: editingItem.category,
          amount: editingItem.amount,
          description: editingItem.description || '',
          store_id: editingItem.store_id || '',
          scenario_id: editingItem.scenario_id || ''
        })
      } else {
        // 追加モード：デフォルト値
        setFormData({
          date: new Date().toISOString().split('T')[0],
          category: '制作費',
          amount: 0,
          description: '',
          store_id: defaultStoreId || '',
          scenario_id: ''
        })
      }
    }
  }, [isOpen, defaultStoreId, editingItem])

  const handleSave = async () => {
    if (!formData.amount || formData.amount <= 0) {
      showToast.warning('金額を入力してください')
      return
    }

    if (!organizationId) {
      showToast.error('組織情報が取得できません。再ログインしてください。')
      return
    }

    setLoading(true)
    try {
      const saveData = {
        date: formData.date,
        type: 'expense' as const,
        category: formData.category || '制作費',
        amount: formData.amount,
        description: formData.description,
        store_id: formData.store_id || null,
        scenario_id: formData.scenario_id || null,
        organization_id: organizationId
      }
      
      if (isEditMode && editingItem) {
        // 更新
        const { error } = await supabase
          .from('miscellaneous_transactions')
          .update(saveData)
          .eq('id', editingItem.id)
        
        if (error) throw error
        showToast.success('制作費を更新しました')
      } else {
        // 新規作成
        const { error } = await supabase
          .from('miscellaneous_transactions')
          .insert([saveData])
        
        if (error) throw error
        showToast.success('制作費を追加しました')
      }
      
      onSave()
      onClose()
    } catch (error) {
      logger.error('制作費保存エラー:', error)
      showToast.error('保存に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!editingItem) return
    
    if (!confirm('この制作費を削除しますか？')) return
    
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('miscellaneous_transactions')
        .delete()
        .eq('id', editingItem.id)
      
      if (error) throw error
      
      showToast.success('制作費を削除しました')
      onSave()
      onClose()
    } catch (error) {
      logger.error('制作費削除エラー:', error)
      showToast.error('削除に失敗しました')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditMode ? '制作費を編集' : '制作費を追加'}</DialogTitle>
          <DialogDescription>
            {isEditMode ? '制作費の内容を編集します' : 'フランチャイズ店舗の制作費を登録します'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>日付</Label>
              <SingleDatePopover
                date={formData.date}
                onDateChange={(date) => setFormData({ ...formData, date: date || '' })}
                placeholder="日付を選択"
              />
            </div>
            
            <div>
              <Label>金額</Label>
              <Input
                type="number"
                placeholder="0"
                value={formData.amount || ''}
                onChange={(e) => setFormData({ ...formData, amount: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div>
            <Label>店舗</Label>
            <Select 
              value={formData.store_id || 'none'} 
              onValueChange={(value) => setFormData({ ...formData, store_id: value === 'none' ? '' : value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="店舗を選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">全社</SelectItem>
                {stores.map(store => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>シナリオ（任意）</Label>
            <Select 
              value={formData.scenario_id || 'none'} 
              onValueChange={(value) => setFormData({ ...formData, scenario_id: value === 'none' ? '' : value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="シナリオなし" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">シナリオなし</SelectItem>
                {scenarios.map(scenario => (
                  <SelectItem key={scenario.id} value={scenario.id}>
                    {scenario.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>カテゴリ</Label>
            <Input
              placeholder="制作費"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            />
          </div>

          <div>
            <Label>説明（任意）</Label>
            <Input
              placeholder="例: 小道具購入"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>
        </div>

        <div className="flex justify-between gap-2">
          <div>
            {isEditMode && (
              <Button 
                variant="destructive" 
                onClick={handleDelete} 
                disabled={loading || deleting}
                size="sm"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {deleting ? '削除中...' : '削除'}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={loading || deleting}>
              キャンセル
            </Button>
            <Button onClick={handleSave} disabled={loading || deleting}>
              {loading ? '保存中...' : (isEditMode ? '更新' : '追加')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
