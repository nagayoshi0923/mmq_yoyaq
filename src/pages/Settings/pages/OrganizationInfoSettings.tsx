/**
 * 組織情報設定
 */
import { logger } from '@/utils/logger'
import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Save, Loader2, Users, Building2, StickyNote, Users2, UserPlus, Mail, User,
} from 'lucide-react'
import { useOrganization } from '@/hooks/useOrganization'
import { updateOrganization } from '@/lib/organization'
import { supabase } from '@/lib/supabase'
import { updateUserRole } from '@/lib/userApi'
import { toast } from 'sonner'

function SectionTitle({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <h3 className="text-base font-semibold">{label}</h3>
    </div>
  )
}

interface AdminUser {
  id: string
  email: string
  display_name: string | null
  role: string
  created_at: string
}

export function OrganizationInfoSettings() {
  const { organization, isLoading: orgLoading, refetch } = useOrganization()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const emptyForm = { name: '', contact_name: '', contact_email: '', notes: '', public_booking_hero_description: '' }
  const [formData, setFormData] = useState(emptyForm)
  const [savedData, setSavedData] = useState(emptyForm)
  const isDirty = JSON.stringify(formData) !== JSON.stringify(savedData)

  // 管理者ユーザー
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([])
  const [isLoadingAdmins, setIsLoadingAdmins] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [removingUserId, setRemovingUserId] = useState<string | null>(null)

  // 招待ダイアログ
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteForm, setInviteForm] = useState({ name: '', email: '' })
  const [isInviting, setIsInviting] = useState(false)

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (isDirty) e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null)
    })
  }, [])

  useEffect(() => {
    if (organization) {
      const data = {
        name: organization.name || '',
        contact_name: organization.contact_name || '',
        contact_email: organization.contact_email || '',
        notes: organization.notes || '',
        public_booking_hero_description: organization.public_booking_hero_description || '',
      }
      setFormData(data)
      setSavedData(data)
      loadAdminUsers(organization.id)
    }
  }, [organization])

  const loadAdminUsers = async (orgId: string) => {
    setIsLoadingAdmins(true)
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, display_name, role, created_at')
        .eq('organization_id', orgId)
        .in('role', ['admin', 'license_admin'])
        .order('created_at')
      if (error) throw error
      setAdminUsers(data as AdminUser[])
    } catch (error) {
      logger.error('Failed to load admin users:', error)
    } finally {
      setIsLoadingAdmins(false)
    }
  }

  const handleSave = async () => {
    if (!organization) return
    setIsSubmitting(true)
    try {
      const result = await updateOrganization(organization.id, {
        name: formData.name.trim(),
        contact_name: formData.contact_name.trim() || null,
        contact_email: formData.contact_email.trim() || null,
        notes: formData.notes.trim() || null,
        public_booking_hero_description: formData.public_booking_hero_description.trim() || null,
      })
      if (result) {
        toast.success('組織情報を更新しました')
        setSavedData(formData)
        refetch()
      } else {
        toast.error('更新に失敗しました')
      }
    } catch (error) {
      logger.error('Failed to update organization:', error)
      toast.error('更新に失敗しました')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRemoveAdmin = async (user: AdminUser) => {
    if (!confirm(`${user.display_name || user.email} を管理者から外しますか？\n（一般ユーザーに変更されます）`)) return
    setRemovingUserId(user.id)
    try {
      await updateUserRole(user.id, 'customer')
      toast.success(`${user.display_name || user.email} を管理者から外しました`)
      setAdminUsers(prev => prev.filter(u => u.id !== user.id))
    } catch (error) {
      logger.error('Failed to remove admin:', error)
      toast.error('操作に失敗しました')
    } finally {
      setRemovingUserId(null)
    }
  }

  const handleInvite = async () => {
    if (!inviteForm.name.trim()) { toast.error('名前を入力してください'); return }
    if (!inviteForm.email.trim()) { toast.error('メールアドレスを入力してください'); return }
    if (!organization) return

    setIsInviting(true)
    try {
      const response = await supabase.functions.invoke('invite-staff', {
        body: {
          name: inviteForm.name.trim(),
          email: inviteForm.email.trim(),
          role: ['管理者'],
          organization_id: organization.id,
        },
      })

      if (response.error) throw response.error
      const result = response.data

      if (!result.success) {
        if (result.error?.includes('既に')) {
          toast.error('このメールアドレスは既に登録されています')
          return
        }
        throw new Error(result.error || '招待に失敗しました')
      }

      toast.success(`${inviteForm.name} さんに招待メールを送信しました`)
      setInviteOpen(false)
      setInviteForm({ name: '', email: '' })
      loadAdminUsers(organization.id)
    } catch (error) {
      logger.error('Failed to invite admin:', error)
      toast.error('招待に失敗しました')
    } finally {
      setIsInviting(false)
    }
  }

  if (orgLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!organization) {
    return <p className="text-sm text-amber-700 p-4 bg-amber-50 rounded-lg border border-amber-200">組織情報が取得できません</p>
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <PageHeader title="組織情報" description="組織の基本情報と予約ページの設定">
        <div className="flex items-center gap-2">
          {isDirty && <span className="text-xs text-amber-600 font-medium">未保存</span>}
          <Button size="sm" onClick={handleSave} disabled={isSubmitting || !isDirty}>
            {isSubmitting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
            保存
          </Button>
        </div>
      </PageHeader>

      {/* 基本情報 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle icon={Building2} label="基本情報" />
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-sm font-medium">
                組織名 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="例: 株式会社サンプル"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">識別子（URL）</Label>
              <div className="flex items-center gap-2">
                <Input value={organization.slug} disabled className="bg-muted flex-1" />
                <Badge variant="outline" className="whitespace-nowrap text-xs">変更不可</Badge>
              </div>
              <p className="text-xs text-muted-foreground">予約URL: /{organization.slug}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-sm font-medium">管理メモ</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="管理者向けのメモ（お客様には表示されません）"
              rows={2}
              className="resize-none"
            />
          </div>

          <div className="flex items-center gap-2 pt-2 border-t">
            <span className="text-sm text-muted-foreground">プラン</span>
            <Badge variant="secondary">{(organization.plan || 'free').toUpperCase()}</Badge>
            <span className="text-xs text-muted-foreground">変更は管理者にお問い合わせください</span>
          </div>
        </div>
      </section>

      {/* 連絡先 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle icon={Users2} label="連絡先情報" />
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            お客様向けの連絡先ページ（/{organization.slug}/contact）に表示されます
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="contact_name" className="text-sm font-medium">担当者名</Label>
              <Input
                id="contact_name"
                value={formData.contact_name}
                onChange={(e) => setFormData(prev => ({ ...prev, contact_name: e.target.value }))}
                placeholder="例: 山田太郎"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact_email" className="text-sm font-medium">連絡先メールアドレス</Label>
              <Input
                id="contact_email"
                type="email"
                value={formData.contact_email}
                onChange={(e) => setFormData(prev => ({ ...prev, contact_email: e.target.value }))}
                placeholder="例: contact@example.com"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 予約トップ紹介文 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle icon={StickyNote} label="予約トップの紹介文" />
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            予約サイト（/{organization.slug}）のトップページに表示する説明文です。空欄の場合はデフォルト文言が表示されます。
          </p>
          <Textarea
            value={formData.public_booking_hero_description}
            onChange={(e) => setFormData(prev => ({ ...prev, public_booking_hero_description: e.target.value }))}
            placeholder="店舗の特徴やシナリオ数など、お客様へ伝えたい内容を入力"
            rows={4}
            className="resize-none"
          />
        </div>
      </section>

      {/* 管理者アカウント */}
      <section className="bg-white rounded-xl border p-6">
        <div className="flex items-start justify-between mb-4">
          <SectionTitle icon={Users} label="管理者アカウント" />
          <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}>
            <UserPlus className="w-3.5 h-3.5 mr-1.5" />
            管理者を招待
          </Button>
        </div>

        {isLoadingAdmins ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : adminUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">管理者アカウントがありません</p>
        ) : (
          <div className="space-y-2">
            {adminUsers.map(user => {
              const isSelf = user.id === currentUserId
              const isLicAdmin = user.role === 'license_admin'
              return (
                <div key={user.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{user.display_name || user.email}</p>
                      {isSelf && <span className="text-xs text-muted-foreground">（自分）</span>}
                    </div>
                    {user.display_name && (
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    )}
                  </div>
                  <Badge variant={isLicAdmin ? 'default' : 'secondary'} className="text-xs shrink-0">
                    {isLicAdmin ? 'MMQ運営' : '管理者'}
                  </Badge>
                  {!isSelf && !isLicAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive shrink-0"
                      disabled={removingUserId === user.id}
                      onClick={() => handleRemoveAdmin(user)}
                    >
                      {removingUserId === user.id ? <Loader2 className="w-3 h-3 animate-spin" /> : '外す'}
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* 招待ダイアログ */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>管理者を招待</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              招待メールを送信します。受信者は記載されたリンクから管理者アカウントを作成できます。
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="invite-name" className="text-sm font-medium">名前 <span className="text-destructive">*</span></Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="invite-name"
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="例: 山田太郎"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-email" className="text-sm font-medium">メールアドレス <span className="text-destructive">*</span></Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="例: admin@example.com"
                  className="pl-9"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setInviteOpen(false); setInviteForm({ name: '', email: '' }) }}>
              キャンセル
            </Button>
            <Button onClick={handleInvite} disabled={isInviting}>
              {isInviting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Mail className="w-3.5 h-3.5 mr-1.5" />}
              招待メールを送信
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
