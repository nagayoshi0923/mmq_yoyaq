/**
 * 組織設定ページ
 * @page OrganizationSettings
 * @path #organization-settings
 * @purpose 自組織の情報を編集する（名前、連絡先、設定など）
 * @access 管理者のみ
 * @organization 自組織のみ
 */
import { logger } from '@/utils/logger'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { 
  Building2, 
  Mail, 
  User, 
  Save, 
  Loader2, 
  Users,
  CheckCircle,
  Clock,
  RefreshCw,
  Timer
} from 'lucide-react'
import { useOrganization } from '@/hooks/useOrganization'
import { updateOrganization } from '@/lib/organization'
import { getInvitationsByOrganization, resendInvitation, deleteInvitation } from '@/lib/api/invitationsApi'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { toast } from 'sonner'
import type { OrganizationInvitation } from '@/types'

export default function OrganizationSettings() {
  const { organization, isLoading: orgLoading, refetch } = useOrganization()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([])
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(false)
  
  const [formData, setFormData] = useState({
    name: '',
    contact_name: '',
    contact_email: '',
    notes: '',
  })

  // 組織情報をフォームに反映
  useEffect(() => {
    if (organization) {
      setFormData({
        name: organization.name || '',
        contact_name: organization.contact_name || '',
        contact_email: organization.contact_email || '',
        notes: organization.notes || '',
      })
    }
  }, [organization])

  // 招待一覧を取得
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

  // 組織情報を保存
  const handleSave = async () => {
    if (!organization) return

    setIsSubmitting(true)
    try {
      const result = await updateOrganization(organization.id, {
        name: formData.name.trim(),
        contact_name: formData.contact_name.trim() || null,
        contact_email: formData.contact_email.trim() || null,
        notes: formData.notes.trim() || null,
      })

      if (result) {
        toast.success('組織情報を更新しました')
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

  // 招待を再送信
  const handleResendInvitation = async (invitation: OrganizationInvitation) => {
    const { data, error } = await resendInvitation(invitation.id)
    if (error) {
      toast.error('再送信に失敗しました')
    } else if (data) {
      toast.success(`${invitation.name} さんに招待を再送信しました`)
      // 招待一覧を更新
      setInvitations(prev => prev.map(inv => inv.id === data.id ? data : inv))
    }
  }

  // 招待を削除
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

  // ローディング中
  if (orgLoading) {
    return (
      <AppLayout currentPage="organization-settings" maxWidth="max-w-[1440px]" containerPadding="px-[10px] py-3 sm:py-4 md:py-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    )
  }

  // 組織情報がない場合
  if (!organization) {
    return (
      <AppLayout currentPage="organization-settings" maxWidth="max-w-[1440px]" containerPadding="px-[10px] py-3 sm:py-4 md:py-6">
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-6 flex items-center gap-3">
              <Building2 className="w-5 h-5 text-amber-600" />
              <p className="text-amber-800">組織情報が取得できません</p>
            </CardContent>
          </Card>
      </AppLayout>
    )
  }

  // 保留中の招待
  const pendingInvitations = invitations.filter(inv => !inv.accepted_at)
  const acceptedInvitations = invitations.filter(inv => inv.accepted_at)

  return (
    <AppLayout currentPage="organization-settings" maxWidth="max-w-[1440px]" containerPadding="px-[10px] py-3 sm:py-4 md:py-6">
      <div className="space-y-6">
        <PageHeader
          title={
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <span className="text-lg font-bold">会社情報</span>
            </div>
          }
          description={`${organization.name} の基本情報と管理者の招待`}
        />

        {/* このページの説明 */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <p className="text-sm text-blue-800">
              <strong>このページでできること：</strong>
              会社名・連絡先の編集、新しい管理者の招待。
              招待されたユーザーはこの組織の管理者として店舗・スタッフ・シナリオなどを管理できます。
          </p>
          </CardContent>
        </Card>

        {/* 基本情報 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">基本情報</CardTitle>
            <CardDescription>組織の基本的な情報を設定します</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">組織名 *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="例: 株式会社サンプル"
                />
              </div>
              <div className="space-y-2">
                <Label>識別子（URL用）</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={organization.slug}
                    disabled
                    className="bg-muted"
                  />
                  <Badge variant="outline">変更不可</Badge>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contact_name">
                  <User className="w-4 h-4 inline mr-1" />
                  担当者名
                </Label>
                <Input
                  id="contact_name"
                  value={formData.contact_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, contact_name: e.target.value }))}
                  placeholder="例: 山田太郎"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_email">
                  <Mail className="w-4 h-4 inline mr-1" />
                  連絡先メールアドレス
                </Label>
                <Input
                  id="contact_email"
                  type="email"
                  value={formData.contact_email}
                  onChange={(e) => setFormData(prev => ({ ...prev, contact_email: e.target.value }))}
                  placeholder="例: contact@example.com"
                />
              </div>
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

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Save className="w-4 h-4 mr-2" />
                保存
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* プラン情報 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">プラン情報</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div>
                <Badge className="text-lg px-4 py-1">
                  {organization.plan.toUpperCase()}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                プランの変更は管理者にお問い合わせください
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 招待管理 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5" />
              招待管理
            </CardTitle>
            <CardDescription>
              保留中の招待と招待履歴
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingInvitations ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : invitations.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                招待履歴がありません
              </p>
            ) : (
              <div className="space-y-4">
                {/* 保留中の招待 */}
                {pendingInvitations.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-500" />
                      保留中（{pendingInvitations.length}件）
                    </h4>
                    <div className="space-y-2">
                      {pendingInvitations.map(invitation => (
                        <div 
                          key={invitation.id} 
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div>
                            <div className="font-medium">{invitation.name}</div>
                            <div className="text-sm text-muted-foreground">{invitation.email}</div>
                            <div className="text-xs text-muted-foreground">
                              期限: {new Date(invitation.expires_at).toLocaleDateString('ja-JP')}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleResendInvitation(invitation)}
                            >
                              <RefreshCw className="w-4 h-4 mr-1" />
                              再送信
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="text-destructive"
                              onClick={() => handleDeleteInvitation(invitation)}
                            >
                              取消
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 受諾済みの招待 */}
                {acceptedInvitations.length > 0 && (
                  <>
                    {pendingInvitations.length > 0 && <div className="border-t my-4" />}
                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        受諾済み（{acceptedInvitations.length}件）
                      </h4>
                      <div className="space-y-2">
                        {acceptedInvitations.slice(0, 5).map(invitation => (
                          <div 
                            key={invitation.id} 
                            className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"
                          >
                            <div>
                              <div className="font-medium">{invitation.name}</div>
                              <div className="text-sm text-muted-foreground">{invitation.email}</div>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {new Date(invitation.accepted_at!).toLocaleDateString('ja-JP')}
                            </div>
                          </div>
                        ))}
                        {acceptedInvitations.length > 5 && (
                          <p className="text-sm text-muted-foreground text-center">
                            他 {acceptedInvitations.length - 5} 件
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  )
}

