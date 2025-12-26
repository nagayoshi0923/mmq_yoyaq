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
import { supabase } from '@/lib/supabase'
import { showToast } from '@/utils/toast'
import { logger } from '@/utils/logger'
import { useOrganization } from '@/hooks/useOrganization'

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

interface ProductionCostDialogProps {
  isOpen: boolean
  onClose: () => void
  onSave: () => void
  stores: Store[]
  defaultStoreId?: string
}

/**
 * 制作費追加ダイアログ
 * フランチャイズ売り上げダッシュボードから制作費を追加するためのダイアログ
 */
export const ProductionCostDialog: React.FC<ProductionCostDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  stores,
  defaultStoreId
}) => {
  const { organizationId } = useOrganization()
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    category: '制作費',
    amount: 0,
    description: '',
    store_id: defaultStoreId || '',
    scenario_id: ''
  })

  // シナリオを読み込み
  useEffect(() => {
    const loadScenarios = async () => {
      try {
        const { data, error } = await supabase
          .from('scenarios')
          .select('id, title, author')
          .order('title', { ascending: true })
        
        if (error) throw error
        setScenarios(data || [])
      } catch (error) {
        logger.error('シナリオ読み込みエラー:', error)
      }
    }
    
    if (isOpen) {
      loadScenarios()
    }
  }, [isOpen])

  // ダイアログが開かれた時にフォームをリセット
  useEffect(() => {
    if (isOpen) {
      setFormData({
        date: new Date().toISOString().split('T')[0],
        category: '制作費',
        amount: 0,
        description: '',
        store_id: defaultStoreId || '',
        scenario_id: ''
      })
    }
  }, [isOpen, defaultStoreId])

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
      const { error } = await supabase
        .from('miscellaneous_transactions')
        .insert([{
          date: formData.date,
          type: 'expense',
          category: formData.category || '制作費',
          amount: formData.amount,
          description: formData.description,
          store_id: formData.store_id || null,
          scenario_id: formData.scenario_id || null,
          organization_id: organizationId
        }])
      
      if (error) throw error
      
      showToast.success('制作費を追加しました')
      onSave()
      onClose()
    } catch (error) {
      logger.error('制作費追加エラー:', error)
      showToast.error('追加に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>制作費を追加</DialogTitle>
          <DialogDescription>
            フランチャイズ店舗の制作費を登録します
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>日付</Label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
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

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            キャンセル
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? '保存中...' : '追加'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

