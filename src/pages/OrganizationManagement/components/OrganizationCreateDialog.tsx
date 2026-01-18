/**
 * 組織作成ダイアログ
 */
import { logger } from '@/utils/logger'
import { useState } from 'react'
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
import { createOrganization } from '@/lib/organization'
import { toast } from 'sonner'

interface OrganizationCreateDialogProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function OrganizationCreateDialog({
  isOpen,
  onClose,
  onSuccess,
}: OrganizationCreateDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    plan: 'free' as 'free' | 'basic' | 'pro',
    contact_email: '',
    contact_name: '',
    is_license_manager: false,
    notes: '',
  })

  // slug を name から自動生成
  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }

  const handleNameChange = (name: string) => {
    setFormData(prev => ({
      ...prev,
      name,
      slug: prev.slug || generateSlug(name),
    }))
  }

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('組織名を入力してください')
      return
    }
    if (!formData.slug.trim()) {
      toast.error('識別子を入力してください')
      return
    }

    setIsLoading(true)
    try {
      const result = await createOrganization({
        name: formData.name.trim(),
        slug: formData.slug.trim(),
        plan: formData.plan,
        contact_email: formData.contact_email.trim() || null,
        contact_name: formData.contact_name.trim() || null,
        is_license_manager: formData.is_license_manager,
        notes: formData.notes.trim() || null,
      })

      if (result) {
        toast.success('組織を作成しました')
        onSuccess()
        // フォームをリセット
        setFormData({
          name: '',
          slug: '',
          plan: 'free',
          contact_email: '',
          contact_name: '',
          is_license_manager: false,
          notes: '',
        })
      } else {
        toast.error('組織の作成に失敗しました')
      }
    } catch (error) {
      logger.error('Failed to create organization:', error)
      toast.error('組織の作成に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>新規組織を追加</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">組織名 *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="例: 株式会社サンプル"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">識別子 (URL用) *</Label>
            <Input
              id="slug"
              value={formData.slug}
              onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
              placeholder="例: sample-company"
            />
            <p className="text-xs text-muted-foreground">
              半角英数字とハイフンのみ使用可能
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan">プラン</Label>
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
            <Label htmlFor="contact_name">担当者名</Label>
            <Input
              id="contact_name"
              value={formData.contact_name}
              onChange={(e) => setFormData(prev => ({ ...prev, contact_name: e.target.value }))}
              placeholder="例: 山田太郎"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact_email">連絡先メールアドレス</Label>
            <Input
              id="contact_email"
              type="email"
              value={formData.contact_email}
              onChange={(e) => setFormData(prev => ({ ...prev, contact_email: e.target.value }))}
              placeholder="例: contact@example.com"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="is_license_manager">ライセンス管理組織</Label>
            <Switch
              id="is_license_manager"
              checked={formData.is_license_manager}
              onCheckedChange={(checked) => 
                setFormData(prev => ({ ...prev, is_license_manager: checked }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">メモ</Label>
            <Textarea
              id="notes"
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
            作成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

