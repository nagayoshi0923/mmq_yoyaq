import { useState, useEffect, useCallback } from 'react'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Button } from '@/components/ui/button'
import { Plus, RefreshCw, Ticket } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useOrganization } from '@/hooks/useOrganization'
import { 
  getCampaigns, 
  createCampaign, 
  updateCampaign, 
  toggleCampaignActive,
  type CampaignFormData 
} from '@/lib/api/couponApi'
import type { CouponCampaign } from '@/types'
import { CampaignList } from './components/CampaignList'
import { CampaignDialog } from './components/CampaignDialog'
import { GrantCouponDialog } from './components/GrantCouponDialog'
import { CampaignStats } from './components/CampaignStats'
import { toast } from 'sonner'

export function CouponManagement() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { organization } = useOrganization()

  const [campaigns, setCampaigns] = useState<CouponCampaign[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [toggleLoading, setToggleLoading] = useState<string | null>(null)

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState<CouponCampaign | null>(null)

  const [grantDialogOpen, setGrantDialogOpen] = useState(false)
  const [grantCampaign, setGrantCampaign] = useState<CouponCampaign | null>(null)

  const [statsDialogOpen, setStatsDialogOpen] = useState(false)
  const [statsCampaign, setStatsCampaign] = useState<CouponCampaign | null>(null)

  const loadCampaigns = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await getCampaigns()
      setCampaigns(data)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCampaigns()
  }, [loadCampaigns])

  const handlePageChange = useCallback((pageId: string) => {
    const slug = organization?.slug || 'queens-waltz'
    if (pageId === 'mypage' || pageId === 'my-page') {
      navigate('/mypage')
    } else {
      navigate(`/${slug}/${pageId}`)
    }
  }, [navigate, organization?.slug])

  const handleCreateNew = () => {
    setSelectedCampaign(null)
    setEditDialogOpen(true)
  }

  const handleEdit = (campaign: CouponCampaign) => {
    setSelectedCampaign(campaign)
    setEditDialogOpen(true)
  }

  const handleSubmitCampaign = async (data: CampaignFormData) => {
    if (selectedCampaign) {
      const result = await updateCampaign(selectedCampaign.id, data)
      if (result.success) {
        toast.success('キャンペーンを更新しました')
        loadCampaigns()
      } else {
        toast.error(result.error || '更新に失敗しました')
        throw new Error(result.error)
      }
    } else {
      const result = await createCampaign(data)
      if (result.success) {
        toast.success('キャンペーンを作成しました')
        loadCampaigns()
      } else {
        toast.error(result.error || '作成に失敗しました')
        throw new Error(result.error)
      }
    }
  }

  const handleToggleActive = async (campaign: CouponCampaign) => {
    setToggleLoading(campaign.id)
    try {
      const result = await toggleCampaignActive(campaign.id)
      if (result.success) {
        setCampaigns(prev => prev.map(c => 
          c.id === campaign.id ? { ...c, is_active: result.isActive! } : c
        ))
        toast.success(result.isActive ? 'キャンペーンを有効にしました' : 'キャンペーンを無効にしました')
      } else {
        toast.error(result.error || '状態の変更に失敗しました')
      }
    } finally {
      setToggleLoading(null)
    }
  }

  const handleGrant = (campaign: CouponCampaign) => {
    setGrantCampaign(campaign)
    setGrantDialogOpen(true)
  }

  const handleViewStats = (campaign: CouponCampaign) => {
    setStatsCampaign(campaign)
    setStatsDialogOpen(true)
  }

  const handleGrantSuccess = () => {
    loadCampaigns()
  }

  const shouldShowNavigation = user && user.role !== 'customer'

  return (
    <div className="min-h-screen bg-background">
      <Header onPageChange={handlePageChange} />
      {shouldShowNavigation && (
        <NavigationBar currentPage="coupons" onPageChange={handlePageChange} />
      )}

      <main className="container mx-auto max-w-[1440px] px-[10px] py-3 sm:py-4 md:py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Ticket className="h-6 w-6" />
            <h1 className="text-2xl font-bold">クーポン管理</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={loadCampaigns}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button onClick={handleCreateNew}>
              <Plus className="h-4 w-4 mr-2" />
              新規キャンペーン
            </Button>
          </div>
        </div>

        <CampaignList
          campaigns={campaigns}
          isLoading={isLoading}
          onEdit={handleEdit}
          onToggleActive={handleToggleActive}
          onGrant={handleGrant}
          onViewStats={handleViewStats}
          toggleLoading={toggleLoading}
        />
      </main>

      <CampaignDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        campaign={selectedCampaign}
        onSubmit={handleSubmitCampaign}
      />

      <GrantCouponDialog
        open={grantDialogOpen}
        onOpenChange={setGrantDialogOpen}
        campaign={grantCampaign}
        onSuccess={handleGrantSuccess}
      />

      <CampaignStats
        open={statsDialogOpen}
        onOpenChange={setStatsDialogOpen}
        campaign={statsCampaign}
      />
    </div>
  )
}

export default CouponManagement
