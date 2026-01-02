/**
 * テナント管理設定
 * 全組織の一覧表示・新規作成・招待（ライセンス管理者専用）
 */
import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { 
  Building2, 
  Plus, 
  Search, 
  Users, 
  Mail,
  Loader2,
  Pencil
} from 'lucide-react'
import { useOrganization, useOrganizations } from '@/hooks/useOrganization'
import { OrganizationCreateDialog } from '@/pages/OrganizationManagement/components/OrganizationCreateDialog'
import { OrganizationInviteDialog } from '@/pages/OrganizationManagement/components/OrganizationInviteDialog'
import { OrganizationEditDialog } from '@/pages/OrganizationManagement/components/OrganizationEditDialog'
import type { Organization } from '@/types'

export function TenantManagementSettings() {
  const { isLicenseManager, isLoading: orgLoading } = useOrganization()
  const { organizations, isLoading, error, refetch } = useOrganizations()
  const [searchTerm, setSearchTerm] = useState('')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [inviteTargetOrg, setInviteTargetOrg] = useState<Organization | null>(null)
  const [editTargetOrg, setEditTargetOrg] = useState<Organization | null>(null)

  // 検索フィルター
  const filteredOrganizations = organizations.filter(org =>
    org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    org.slug.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // プランのバッジ色
  const getPlanBadgeVariant = (plan: string) => {
    switch (plan) {
      case 'pro': return 'default' as const
      case 'basic': return 'secondary' as const
      default: return 'outline' as const
    }
  }

  if (isLoading || orgLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ライセンス管理組織のみアクセス可能
  if (!isLicenseManager) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-6 flex items-center gap-3">
          <Building2 className="w-5 h-5 text-amber-600" />
          <p className="text-amber-800">
            このページはライセンス管理組織（Queens Waltz）のみアクセス可能です。
          </p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="p-6">
          <p className="text-destructive">エラーが発生しました: {error.message}</p>
          <Button variant="outline" onClick={refetch} className="mt-4">
            再試行
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            MMQシステムを利用する加盟店（組織）の一覧管理
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          新規組織を追加
        </Button>
      </div>

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
                        {org.plan.toUpperCase()}
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
    </div>
  )
}

