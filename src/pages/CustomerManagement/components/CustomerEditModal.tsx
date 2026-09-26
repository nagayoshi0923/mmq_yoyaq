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
import { customerApi } from '@/lib/api/customerApi'
import { ApiClientError } from '@/lib/apiClient'
import type { Customer } from '@/types'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

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
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (customer) {
      setFormData({
        name: customer.name || '',
        email: customer.email || '',
        phone: customer.phone || '',
        line_id: customer.line_id || '',
      })
    } else {
      setFormData({
        name: '',
        email: '',
        phone: '',
        line_id: '',
      })
    }
  }, [customer, isOpen])

  const handleSave = async () => {
    if (!formData.name.trim()) {
      showToast.warning('顧客名を入力してください')
      return
    }

    setSaving(true)
    try {
      const values = {
        name: formData.name.trim(),
        email: formData.email || null,
        phone: formData.phone || null,
        line_id: formData.line_id || null,
      }
      const saved = customer
        ? await customerApi.update(customer.id, values)
        : await customerApi.create(values)
      if (!saved?.id) throw new Error('保存結果を確認できませんでした')

      showToast.success(customer ? '顧客情報を更新しました' : '顧客を作成しました')
      onSave()
      onClose()
    } catch (error) {
      logger.error('顧客保存エラー:', error)
      showToast.error(error instanceof ApiClientError ? error.message : '保存に失敗しました')
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

