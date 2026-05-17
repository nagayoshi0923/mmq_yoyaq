/**
 * テナント管理ページ
 * @page OrganizationManagement
 * @path #organizations
 * @purpose 全組織の一覧表示・新規作成・招待（ライセンス管理者専用）
 * @access ライセンス管理者のみ
 * @organization ライセンス管理組織のみ
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Building2,
  Plus,
  Search,
  Users,
  Mail,
  CheckCircle,
  XCircle,
  Loader2,
  Pencil,
  Clock,
  Globe
} from 'lucide-react'
import { useOrganization, useOrganizations } from '@/hooks/useOrganization'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import { OrganizationCreateDialog } from './components/OrganizationCreateDialog'
import { OrganizationInviteDialog } from './components/OrganizationInviteDialog'
import { OrganizationEditDialog } from './components/OrganizationEditDialog'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { Organization } from '@/types'

type PendingApplication = {
  id: string
  name: string
  slug: string
  contact_email: string | null
  created_at: string
  updated_at: string
}

export default function OrganizationManagement() {
  const { isLicenseManager, isLoading: orgLoading } = useOrganization()
  const { organizations, isLoading, error, refetch } = useOrganizations()
  const [searchTerm, setSearchTerm] = useState('')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [inviteTargetOrg, setInviteTargetOrg] = useState<Organization | null>(null)
  const [editTargetOrg, setEditTargetOrg] = useState<Organization | null>(null)
  const [pendingApps, setPendingApps] = useState<PendingApplication[]>([])
  const [isLoadingPending, setIsLoadingPending] = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)

  const fetchPendingApplications = useCallback(async () => {
    setIsLoadingPending(true)
    const { data } = await supabase.rpc('get_pending_booking_site_applications')
    setPendingApps((data as PendingApplication[]) ?? [])
    setIsLoadingPending(false)
  }, [])

  useEffect(() => {
    if (isLicenseManager) fetchPendingApplications()
  }, [isLicenseManager, fetchPendingApplications])

  const handleApprove = async (orgId: string) => {
    setApprovingId(orgId)
    try {
      const { error: approveError } = await supabase.rpc('approve_booking_site', { p_org_id: orgId })
      if (approveError) throw approveError
      toast.success('承認しました。プランが pro に変更されました。')
      await Promise.all([fetchPendingApplications(), refetch()])
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '承認に失敗しました')
    } finally {
      setApprovingId(null)
    }
  }

  // 検索フィルター
  const filteredOrganizations = organizations.filter(org =>
    org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    org.slug.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // プランのバッジ色
  const getPlanBadgeVariant = (plan: string) => {
    switch (plan) {
      case 'pro': return 'default'
      case 'basic': return 'secondary'
      default: return 'outline'
    }
  }

  if (isLoading || orgLoading) {
    return (
      <AppLayout currentPage="organizations" maxWidth="max-w-[1440px]" containerPadding="px-[10px] py-3 sm:py-4 md:py-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    )
  }

  // ライセンス管理組織のみアクセス可能
  if (!isLicenseManager) {
    return (
      <AppLayout currentPage="organizations" maxWidth="max-w-[1440px]" containerPadding="px-[10px] py-3 sm:py-4 md:py-6">
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-6 flex items-center gap-3">
              <Building2 className="w-5 h-5 text-amber-600" />
              <p className="text-amber-800">
                このページはライセンス管理組織のみアクセス可能です。
              </p>
            </CardContent>
          </Card>
      </AppLayout>
    )
  }

  if (error) {
    return (
      <AppLayout currentPage="organizations" maxWidth="max-w-[1440px]" containerPadding="px-[10px] py-3 sm:py-4 md:py-6">
          <Card className="border-destructive">
            <CardContent className="p-6">
              <p className="text-destructive">エラーが発生しました: {getSafeErrorMessage(error, 'エラーが発生しました')}</p>
              <Button variant="outline" onClick={refetch} className="mt-4">
                再試行
              </Button>
            </CardContent>
          </Card>
      </AppLayout>
    )
  }

  return (
    <AppLayout currentPage="organizations" maxWidth="max-w-[1440px]" containerPadding="px-[10px] py-3 sm:py-4 md:py-6">
      <div className="space-y-6">
      <PageHeader
        title={<><Building2 className="h-5 w-5 text-primary" />テナント管理</>}
        description="MMQシステムを利用する加盟店（組織）の一覧管理"
      >
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          新規組織を追加
        </Button>
      </PageHeader>

      {/* このページの説明 */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <p className="text-sm text-blue-800">
            <strong>このページでできること：</strong>
            新規加盟店の登録、管理者の招待、組織情報の編集。
            各組織の管理者を招待すると、その組織で店舗・スタッフ・シナリオなどを管理できるようになります。
          </p>
        </CardContent>
      </Card>

      {/* 統計カード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">総組織数</div>
            <div className="text-2xl font-bold">{organizations.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">アクティブ</div>
            <div className="text-2xl font-bold text-green-600">
              {organizations.filter(o => o.is_active).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Pro プラン</div>
            <div className="text-2xl font-bold">
              {organizations.filter(o => o.plan === 'pro').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">ライセンス管理</div>
            <div className="text-2xl font-bold">
              {organizations.filter(o => o.is_license_manager).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="organizations">
        <TabsList>
          <TabsTrigger value="organizations" className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            組織一覧
          </TabsTrigger>
          <TabsTrigger value="applications" className="flex items-center gap-2">
            <Globe className="w-4 h-4" />
            予約サイト申請
            {pendingApps.length > 0 && (
              <Badge variant="destructive" className="ml-1 px-1.5 py-0 text-xs">
                {pendingApps.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── 申請一覧タブ ── */}
        <TabsContent value="applications" className="mt-4">
          {isLoadingPending ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : pendingApps.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                申請中の組織はありません
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {pendingApps.map(app => (
                <Card key={app.id}>
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{app.name}</p>
                        <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 flex-shrink-0">
                          <Clock className="w-3 h-3 mr-1" />
                          申請中
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">/{app.slug}</p>
                      {app.contact_email && (
                        <p className="text-xs text-muted-foreground">{app.contact_email}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        申請日: {new Date(app.updated_at).toLocaleDateString('ja-JP')}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleApprove(app.id)}
                      disabled={approvingId === app.id}
                      className="flex-shrink-0"
                    >
                      {approvingId === app.id
                        ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        : <CheckCircle className="w-4 h-4 mr-2" />
                      }
                      承認する
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── 組織一覧タブ ── */}
        <TabsContent value="organizations" className="mt-4 space-y-4">

      {/* 検索 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="組織名または識別子で検索..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* 組織一覧 */}
      <div className="space-y-3">
        {filteredOrganizations.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              {searchTerm ? '検索結果がありません' : '組織が登録されていません'}
            </CardContent>
          </Card>
        ) : (
          filteredOrganizations.map((org) => (
            <Card key={org.id} className={!org.is_active ? 'opacity-60' : ''}>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">{org.name}</h3>
                      <Badge variant={getPlanBadgeVariant(org.plan)}>
                        {(org.plan || 'free').toUpperCase()}
                      </Badge>
                      {org.is_license_manager && (
                        <Badge variant="secondary">ライセンス管理</Badge>
                      )}
                      {!org.is_active && (
                        <Badge variant="destructive">無効</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      識別子: {org.slug}
                    </div>
                    {org.contact_email && (
                      <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                        <Mail className="w-3 h-3" />
                        {org.contact_email}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditTargetOrg(org)}
                    >
                      <Pencil className="w-4 h-4 mr-1" />
                      編集
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setInviteTargetOrg(org)}
                    >
                      <Users className="w-4 h-4 mr-1" />
                      招待
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* 新規組織作成ダイアログ */}
      <OrganizationCreateDialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onSuccess={() => {
          setIsCreateDialogOpen(false)
          refetch()
        }}
      />

      {/* 招待ダイアログ */}
      {inviteTargetOrg && (
        <OrganizationInviteDialog
          organization={inviteTargetOrg}
          isOpen={!!inviteTargetOrg}
          onClose={() => setInviteTargetOrg(null)}
          onSuccess={() => {
            setInviteTargetOrg(null)
            refetch()
          }}
        />
      )}

      {/* 編集ダイアログ */}
      <OrganizationEditDialog
        organization={editTargetOrg}
        isOpen={!!editTargetOrg}
        onClose={() => setEditTargetOrg(null)}
        onSuccess={() => {
          setEditTargetOrg(null)
          refetch()
        }}
      />
        </TabsContent>
      </Tabs>
      </div>
    </AppLayout>
  )
}

