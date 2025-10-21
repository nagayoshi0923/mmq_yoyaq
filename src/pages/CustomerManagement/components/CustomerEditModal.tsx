import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import type { Customer } from '@/types'
import { logger } from '@/utils/logger'

interface CustomerEditModalProps {
  isOpen: boolean
  onClose: () => void
  customer: Customer | null
  onSave: () => void
}

export function CustomerEditModal({ isOpen, onClose, customer, onSave }: CustomerEditModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    line_id: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (customer) {
      setFormData({
        name: customer.name || '',
        email: customer.email || '',
        phone: customer.phone || '',
        line_id: customer.line_id || '',
        notes: customer.notes || '',
      })
    } else {
      setFormData({
        name: '',
        email: '',
        phone: '',
        line_id: '',
        notes: '',
      })
    }
  }, [customer, isOpen])

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert('顧客名を入力してください')
      return
    }

    setSaving(true)
    try {
      if (customer) {
        // 更新
        const { error } = await supabase
          .from('customers')
          .update({
            name: formData.name,
            email: formData.email || null,
            phone: formData.phone || null,
            line_id: formData.line_id || null,
            notes: formData.notes || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', customer.id)

        if (error) throw error
        logger.log('顧客情報更新成功:', customer.id)
      } else {
        // 新規作成
        const { error } = await supabase
          .from('customers')
          .insert({
            name: formData.name,
            email: formData.email || null,
            phone: formData.phone || null,
            line_id: formData.line_id || null,
            notes: formData.notes || null,
            visit_count: 0,
            total_spent: 0,
          })

        if (error) throw error
        logger.log('顧客作成成功')
      }

      alert(customer ? '顧客情報を更新しました' : '顧客を作成しました')
      onSave()
      onClose()
    } catch (error) {
      logger.error('顧客保存エラー:', error)
      alert('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{customer ? '顧客情報編集' : '新規顧客作成'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="name">顧客名 *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="山田 太郎"
            />
          </div>

          <div>
            <Label htmlFor="email">メールアドレス</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="example@example.com"
            />
          </div>

          <div>
            <Label htmlFor="phone">電話番号</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="090-1234-5678"
            />
          </div>

          <div>
            <Label htmlFor="line_id">LINE ID</Label>
            <Input
              id="line_id"
              value={formData.line_id}
              onChange={(e) => setFormData({ ...formData, line_id: e.target.value })}
              placeholder="@line_id"
            />
          </div>

          <div>
            <Label htmlFor="notes">メモ</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="顧客に関するメモを入力..."
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            キャンセル
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

