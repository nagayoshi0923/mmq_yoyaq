/**
 * 組織情報設定
 * 組織の基本情報・連絡先・予約ページの紹介文・招待管理
 */
import { logger } from '@/utils/logger'
import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Save, Loader2, Users, CheckCircle, Clock, RefreshCw } from 'lucide-react'
import { useOrganization } from '@/hooks/useOrganization'
import { updateOrganization } from '@/lib/organization'
import { getInvitationsByOrganization, resendInvitation, deleteInvitation } from '@/lib/api/invitationsApi'
import { toast } from 'sonner'
import type { OrganizationInvitation } from '@/types'

export function OrganizationInfoSettings() {
  const { organization, isLoading: orgLoading, refetch } = useOrganization()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([])
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(false)

  const emptyForm = { name: '', contact_name: '', contact_email: '', notes: '', public_booking_hero_description: '' }
  const [formData, setFormData] = useState(emptyForm)
  const [savedData, setSavedData] = useState(emptyForm)
  const isDirty = JSON.stringify(formData) !== JSON.stringify(savedData)

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (isDirty) e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

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
    }
  }, [organization])

  useEffect(() => {
    async function loadInvitations() {
      if (!organization?.id) return
      setIsLoadingInvitations(true)
      const { data } = await getInvitationsByOrganization(organization.id)
      setInvitations(data)
      setIsLoadingInvitations(false)
    }
    loadInvitations()
  }, [organization?.id])

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

  const handleResendInvitation = async (invitation: OrganizationInvitation) => {
    const { data, error } = await resendInvitation(invitation.id)
    if (error) toast.error('再送信に失敗しました')
    else if (data) {
      toast.success(`${invitation.name} さんに招待を再送信しました`)
      setInvitations(prev => prev.map(inv => inv.id === data.id ? data : inv))
    }
  }

  const handleDeleteInvitation = async (invitation: OrganizationInvitation) => {
    if (!confirm(`${invitation.name} さんの招待を取り消しますか？`)) return
    const { success, error } = await deleteInvitation(invitation.id)
    if (error) toast.error('削除に失敗しました')
    else if (success) {
      toast.success('招待を取り消しました')
      setInvitations(prev => prev.filter(inv => inv.id !== invitation.id))
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

  const pendingInvitations = invitations.filter(inv => !inv.accepted_at)
  const acceptedInvitations = invitations.filter(inv => inv.accepted_at)

  return (
    <div className="space-y-4 max-w-2xl">
      <PageHeader title="組織情報" description="組織の基本情報と予約ページの設定">
        <div className="flex items-center gap-2">
          {isDirty && <span className="text-xs text-amber-600 font-medium">未保存</span>}
          <Button size="sm" onClick={handleSave} disabled={isSubmitting || !isDirty}>
            {isSubmitting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
            保存
          </Button>
        </div>
      </PageHeader>

      {/* フォームパネル：セクションを divide-y で区切る */}
      <div className="rounded-lg border bg-white divide-y">

        {/* 組織名・識別子 */}
        <div className="px-4 py-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="name" className="text-xs">組織名 <span className="text-destructive">*</span></Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="例: 株式会社サンプル"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">識別子（URL）</Label>
            <div className="flex items-center gap-1.5">
              <Input value={organization.slug} disabled className="h-8 text-sm bg-muted flex-1" />
              <Badge variant="outline" className="text-xs whitespace-nowrap">変更不可</Badge>
            </div>
          </div>
        </div>

        {/* 担当者・連絡先 */}
        <div className="px-4 py-3 space-y-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="contact_name" className="text-xs">担当者名</Label>
              <Input
                id="contact_name"
                value={formData.contact_name}
                onChange={(e) => setFormData(prev => ({ ...prev, contact_name: e.target.value }))}
                placeholder="例: 山田太郎"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="contact_email" className="text-xs">連絡先メールアドレス</Label>
              <Input
                id="contact_email"
                type="email"
                value={formData.contact_email}
                onChange={(e) => setFormData(prev => ({ ...prev, contact_email: e.target.value }))}
                placeholder="例: contact@example.com"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">/{organization.slug}/contact の連絡先ページに表示されます</p>
        </div>

        {/* 管理メモ */}
        <div className="px-4 py-3 space-y-1">
          <Label htmlFor="notes" className="text-xs">管理メモ</Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            placeholder="管理者向けのメモ（お客様には表示されません）"
            rows={2}
            className="text-sm resize-none"
          />
        </div>

        {/* 予約トップ紹介文 */}
        <div className="px-4 py-3 space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="hero_desc" className="text-xs">予約トップの紹介文</Label>
            <span className="text-xs text-muted-foreground">/{organization.slug} のトップに表示</span>
          </div>
          <Textarea
            id="hero_desc"
            value={formData.public_booking_hero_description}
            onChange={(e) => setFormData(prev => ({ ...prev, public_booking_hero_description: e.target.value }))}
            placeholder="店舗の特徴やシナリオ数など、お客様へ伝えたい内容を入力。空欄の場合はデフォルト文言が表示されます。"
            rows={3}
            className="text-sm resize-none"
          />
        </div>

        {/* プラン */}
        <div className="px-4 py-3 flex items-center gap-3">
          <span className="text-xs text-muted-foreground shrink-0">プラン</span>
          <Badge variant="secondary" className="text-xs">
            {(organization.plan || 'free').toUpperCase()}
          </Badge>
          <span className="text-xs text-muted-foreground">変更は管理者にお問い合わせください</span>
        </div>
      </div>

      {/* 招待管理 */}
      <div className="rounded-lg border bg-white">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">招待管理</span>
          <span className="text-xs text-muted-foreground ml-auto">管理者アカウントの招待状況</span>
        </div>
        <div className="px-4 py-3">
          {isLoadingInvitations ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">招待履歴がありません</p>
          ) : (
            <div className="space-y-3">
              {pendingInvitations.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-amber-500" />
                    保留中（{pendingInvitations.length}件）
                  </p>
                  {pendingInvitations.map(inv => (
                    <div key={inv.id} className="flex items-center justify-between py-2 px-3 rounded-md border bg-amber-50/40">
                      <div>
                        <p className="text-sm font-medium leading-none">{inv.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{inv.email} · 期限: {new Date(inv.expires_at).toLocaleDateString('ja-JP')}</p>
                      </div>
                      <div className="flex gap-1.5">
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleResendInvitation(inv)}>
                          <RefreshCw className="w-3 h-3 mr-1" />再送信
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => handleDeleteInvitation(inv)}>
                          取消
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {acceptedInvitations.length > 0 && (
                <div className="space-y-1.5">
                  {pendingInvitations.length > 0 && <div className="border-t my-1" />}
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <CheckCircle className="w-3 h-3 text-green-500" />
                    受諾済み（{acceptedInvitations.length}件）
                  </p>
                  {acceptedInvitations.slice(0, 5).map(inv => (
                    <div key={inv.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/40">
                      <div>
                        <p className="text-sm font-medium leading-none">{inv.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{inv.email}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">{new Date(inv.accepted_at!).toLocaleDateString('ja-JP')}</p>
                    </div>
                  ))}
                  {acceptedInvitations.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center pt-1">他 {acceptedInvitations.length - 5} 件</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
