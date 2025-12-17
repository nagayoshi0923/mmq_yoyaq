/**
 * 組織編集ダイアログ
 */
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Loader2 } from 'lucide-react'
import { updateOrganization } from '@/lib/organization'
import { toast } from 'sonner'
import type { Organization } from '@/types'

interface OrganizationEditDialogProps {
  organization: Organization | null
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function OrganizationEditDialog({
  organization,
  isOpen,
  onClose,
  onSuccess,
}: OrganizationEditDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    plan: 'free' as 'free' | 'basic' | 'pro',
    contact_email: '',
    contact_name: '',
    is_license_manager: false,
    is_active: true,
    notes: '',
  })

  // 組織情報をフォームに反映
  useEffect(() => {
    if (organization) {
      setFormData({
        name: organization.name || '',
        plan: organization.plan || 'free',
        contact_email: organization.contact_email || '',
        contact_name: organization.contact_name || '',
        is_license_manager: organization.is_license_manager || false,
        is_active: organization.is_active ?? true,
        notes: organization.notes || '',
      })
    }
  }, [organization])

  const handleSubmit = async () => {
    if (!organization) return
    
    if (!formData.name.trim()) {
      toast.error('組織名を入力してください')
      return
    }

    setIsLoading(true)
    try {
      const result = await updateOrganization(organization.id, {
        name: formData.name.trim(),
        plan: formData.plan,
        contact_email: formData.contact_email.trim() || null,
        contact_name: formData.contact_name.trim() || null,
        is_license_manager: formData.is_license_manager,
        is_active: formData.is_active,
        notes: formData.notes.trim() || null,
      })

      if (result) {
        toast.success('組織情報を更新しました')
        onSuccess()
      } else {
        toast.error('更新に失敗しました')
      }
    } catch (error) {
      console.error('Failed to update organization:', error)
      toast.error('更新に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  if (!organization) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>組織を編集</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">組織名 *</Label>
            <Input
              id="edit-name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="例: 株式会社サンプル"
            />
          </div>

          <div className="space-y-2">
            <Label>識別子 (URL用)</Label>
            <Input
              value={organization.slug}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              識別子は変更できません
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-plan">プラン</Label>
            <Select
              value={formData.plan}
              onValueChange={(value: 'free' | 'basic' | 'pro') => 
                setFormData(prev => ({ ...prev, plan: value }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="basic">Basic</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-contact_name">担当者名</Label>
            <Input
              id="edit-contact_name"
              value={formData.contact_name}
              onChange={(e) => setFormData(prev => ({ ...prev, contact_name: e.target.value }))}
              placeholder="例: 山田太郎"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-contact_email">連絡先メールアドレス</Label>
            <Input
              id="edit-contact_email"
              type="email"
              value={formData.contact_email}
              onChange={(e) => setFormData(prev => ({ ...prev, contact_email: e.target.value }))}
              placeholder="例: contact@example.com"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="edit-is_license_manager">ライセンス管理組織</Label>
            <Switch
              id="edit-is_license_manager"
              checked={formData.is_license_manager}
              onCheckedChange={(checked) => 
                setFormData(prev => ({ ...prev, is_license_manager: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="edit-is_active">アクティブ</Label>
              <p className="text-xs text-muted-foreground">
                無効にすると組織メンバーはログインできなくなります
              </p>
            </div>
            <Switch
              id="edit-is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => 
                setFormData(prev => ({ ...prev, is_active: checked }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-notes">メモ</Label>
            <Textarea
              id="edit-notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="組織に関するメモ..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            キャンセル
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

