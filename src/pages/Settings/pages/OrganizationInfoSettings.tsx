/**
 * 組織情報設定
 * 組織の基本情報・連絡先・予約ページの紹介文・招待管理
 */
import { logger } from '@/utils/logger'
import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Save,
  Loader2,
  Users,
  CheckCircle,
  Clock,
  RefreshCw,
} from 'lucide-react'
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

  const emptyForm = {
    name: '',
    contact_name: '',
    contact_email: '',
    notes: '',
    public_booking_hero_description: '',
  }
  const [formData, setFormData] = useState(emptyForm)
  const [savedData, setSavedData] = useState(emptyForm)

  const isDirty = JSON.stringify(formData) !== JSON.stringify(savedData)

  // ブラウザタブを閉じる・リロード時の警告
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) e.preventDefault()
    }
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
    if (error) {
      toast.error('再送信に失敗しました')
    } else if (data) {
      toast.success(`${invitation.name} さんに招待を再送信しました`)
      setInvitations(prev => prev.map(inv => inv.id === data.id ? data : inv))
    }
  }

  const handleDeleteInvitation = async (invitation: OrganizationInvitation) => {
    if (!confirm(`${invitation.name} さんの招待を取り消しますか？`)) return
    const { success, error } = await deleteInvitation(invitation.id)
    if (error) {
      toast.error('削除に失敗しました')
    } else if (success) {
      toast.success('招待を取り消しました')
      setInvitations(prev => prev.filter(inv => inv.id !== invitation.id))
    }
  }

  if (orgLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!organization) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-4 text-amber-800 text-sm">
          組織情報が取得できません
        </CardContent>
      </Card>
    )
  }

  const pendingInvitations = invitations.filter(inv => !inv.accepted_at)
  const acceptedInvitations = invitations.filter(inv => inv.accepted_at)

  return (
    <div className="space-y-4">
      <PageHeader title="組織情報" description="組織の基本情報と予約ページの設定">
        <div className="flex items-center gap-2">
          {isDirty && <span className="text-xs text-amber-600 font-medium">未保存の変更あり</span>}
          <Button onClick={handleSave} disabled={isSubmitting || !isDirty}>
            {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            保存
          </Button>
        </div>
      </PageHeader>

      {/* 基本情報 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">基本情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="name">組織名 <span className="text-destructive">*</span></Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="例: 株式会社サンプル"
              />
            </div>
            <div className="space-y-1">
              <Label>識別子（URL用）</Label>
              <div className="flex items-center gap-2">
                <Input value={organization.slug} disabled className="bg-muted" />
                <Badge variant="outline" className="whitespace-nowrap">変更不可</Badge>
              </div>
              <p className="text-xs text-muted-foreground">予約URL: /{organization.slug}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="contact_name">担当者名</Label>
              <Input
                id="contact_name"
                value={formData.contact_name}
                onChange={(e) => setFormData(prev => ({ ...prev, contact_name: e.target.value }))}
                placeholder="例: 山田太郎"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="contact_email">連絡先メールアドレス</Label>
              <Input
                id="contact_email"
                type="email"
                value={formData.contact_email}
                onChange={(e) => setFormData(prev => ({ ...prev, contact_email: e.target.value }))}
                placeholder="例: contact@example.com"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">担当者名・連絡先メールはお客様向けの連絡先ページ（/{organization.slug}/contact）に表示されます</p>

          <div className="space-y-1">
            <Label htmlFor="notes">管理メモ</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="管理者向けのメモ（お客様には表示されません）"
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* 予約トップの紹介文 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">予約トップの紹介文</CardTitle>
          <CardDescription className="text-xs">
            予約サイト（/{organization.slug}）のトップページに表示する説明文。空欄の場合はデフォルト文言が表示されます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            id="public_booking_hero_description"
            value={formData.public_booking_hero_description}
            onChange={(e) => setFormData(prev => ({ ...prev, public_booking_hero_description: e.target.value }))}
            placeholder="店舗の特徴やシナリオ数など、お客様へ伝えたい内容を入力"
            rows={4}
            className="resize-y"
          />
        </CardContent>
      </Card>

      {/* プラン情報 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">プラン情報</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Badge className="text-sm px-3 py-0.5">
            {(organization.plan || 'free').toUpperCase()}
          </Badge>
          <span className="text-xs text-muted-foreground">
            プランの変更は管理者にお問い合わせください
          </span>
        </CardContent>
      </Card>

      {/* 招待管理 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="w-4 h-4" />
            招待管理
          </CardTitle>
          <CardDescription className="text-xs">管理者アカウントの招待状況</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingInvitations ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">招待履歴がありません</p>
          ) : (
            <div className="space-y-4">
              {pendingInvitations.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    保留中（{pendingInvitations.length}件）
                  </p>
                  {pendingInvitations.map(invitation => (
                    <div key={invitation.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="text-sm font-medium">{invitation.name}</div>
                        <div className="text-xs text-muted-foreground">{invitation.email}</div>
                        <div className="text-xs text-muted-foreground">
                          期限: {new Date(invitation.expires_at).toLocaleDateString('ja-JP')}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleResendInvitation(invitation)}>
                          <RefreshCw className="w-3.5 h-3.5 mr-1" />
                          再送信
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteInvitation(invitation)}>
                          取消
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {acceptedInvitations.length > 0 && (
                <div className="space-y-2">
                  {pendingInvitations.length > 0 && <div className="border-t" />}
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                    受諾済み（{acceptedInvitations.length}件）
                  </p>
                  {acceptedInvitations.slice(0, 5).map(invitation => (
                    <div key={invitation.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                      <div>
                        <div className="text-sm font-medium">{invitation.name}</div>
                        <div className="text-xs text-muted-foreground">{invitation.email}</div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(invitation.accepted_at!).toLocaleDateString('ja-JP')}
                      </div>
                    </div>
                  ))}
                  {acceptedInvitations.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center">
                      他 {acceptedInvitations.length - 5} 件
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
