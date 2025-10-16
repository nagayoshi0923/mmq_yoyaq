import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { StaffEditModal } from '@/components/modals/StaffEditModal'
import { StaffAvatar } from '@/components/staff/StaffAvatar'
import { staffApi, storeApi, scenarioApi } from '@/lib/api'
import { assignmentApi } from '@/lib/assignmentApi'
import { inviteStaff, type InviteStaffRequest } from '@/lib/staffInviteApi'
import { usePageState } from '@/hooks/usePageState'
import type { Staff, Store } from '@/types'
import { 
  Users, 
  Plus, 
  Edit, 
  Trash2, 
  Calendar,
  MapPin,
  Search,
  Filter,
  Shield,
  Clock,
  ArrowLeft,
  AlertTriangle,
  Mail,
  UserPlus
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// モックデータ（後でAPIから取得）
const mockStaff = [
  {
    id: '1',
    name: '田中太郎',
    line_name: 'tanaka_taro',
    x_account: '@tanaka_gm',
    email: 'tanaka@example.com',
    phone: '090-1234-5678',
    role: ['GM', 'マネージャー'],
    stores: ['高田馬場店', '別館①'],
    status: 'active',
    experience: 3,
    availability: ['月', '火', '水', '木', '金'],
    ng_days: ['土', '日'],
    special_scenarios: ['人狼村の悲劇', '密室の謎', '学園ミステリー'],
    notes: 'ベテランGM。新人研修も担当。'
  },
  {
    id: '2',
    name: '山田花子',
    line_name: 'yamada_hana',
    email: 'yamada@example.com',
    phone: '080-9876-5432',
    role: ['スタッフ'],
    stores: ['大久保店'],
    status: 'active',
    experience: 1,
    availability: ['土', '日', '月'],
    ng_days: [],
    special_scenarios: ['初心者向けシナリオ'],
    notes: '新人スタッフ。研修中。'
  }
]

export function StaffManagement() {
  // ページ状態管理のカスタムフック
  const { restoreState, saveState, setLoading, loading } = usePageState({
    pageKey: 'staff',
    scrollRestoration: true
  })

  const [staff, setStaff] = useState<Staff[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [scenarios, setScenarios] = useState<any[]>([])
  const [error, setError] = useState('')
  
  // 状態を復元して初期化
  const [searchTerm, setSearchTerm] = useState(() => restoreState('searchTerm', ''))
  const [statusFilter, setStatusFilter] = useState<string>(() => restoreState('statusFilter', 'all'))
  
  // 編集モーダル用のstate
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null)
  
  // 招待モーダル用のstate
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)
  
  // 削除確認ダイアログ用のstate
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [staffToDelete, setStaffToDelete] = useState<Staff | null>(null)

  // 検索とフィルタの状態を自動保存
  useEffect(() => {
    saveState('searchTerm', searchTerm)
  }, [searchTerm, saveState])

  useEffect(() => {
    saveState('statusFilter', statusFilter)
  }, [statusFilter, saveState])

  useEffect(() => {
    loadStaff()
    loadStores()
    loadScenarios()
  }, [])

  async function loadStaff() {
    try {
      setLoading(true)
      setError('')
      const data = await staffApi.getAll()
      
      // 各スタッフの担当シナリオ情報をリレーションテーブルから取得
      const staffWithScenarios = await Promise.all(
        data.map(async (staffMember) => {
          try {
            // GM可能なシナリオを取得
            const gmAssignments = await assignmentApi.getStaffAssignments(staffMember.id)
            const gmScenarios = gmAssignments.map(a => a.scenarios?.id).filter(Boolean)
            
            // 体験済みシナリオを取得（GM不可）
            const experiencedAssignments = await assignmentApi.getStaffExperiencedScenarios(staffMember.id)
            const experiencedScenarios = experiencedAssignments.map(a => a.scenarios?.id).filter(Boolean)
            
            return {
              ...staffMember,
              special_scenarios: gmScenarios, // GM可能なシナリオ
              experienced_scenarios: experiencedScenarios // 体験済みシナリオ（GM不可）
            }
          } catch (error) {
            console.error(`Error loading assignments for staff ${staffMember.id}:`, error)
            return {
              ...staffMember,
              special_scenarios: staffMember.special_scenarios || [], // エラー時は既存の値を使用
              experienced_scenarios: [] // 体験済みシナリオ
            }
          }
        })
      )
      
        console.log('📥 読み込んだスタッフデータ（最初の1件）:', staffWithScenarios[0] ? {
          name: staffWithScenarios[0].name,
          avatar_color: staffWithScenarios[0].avatar_color,
          avatar_url: staffWithScenarios[0].avatar_url
        } : 'データなし')
        setStaff(staffWithScenarios)
    } catch (err: any) {
      console.error('Error loading staff:', err)
      setError('スタッフデータの読み込みに失敗しました: ' + err.message)
      // エラー時はモックデータを使用
      setStaff(mockStaff)
    } finally {
      setLoading(false)
    }
  }

  async function loadStores() {
    try {
      const data = await storeApi.getAll()
      setStores(data)
    } catch (err: any) {
      console.error('Error loading stores:', err)
    }
  }

  async function loadScenarios() {
    try {
      const data = await scenarioApi.getAll()
      setScenarios(data)
    } catch (err: any) {
      console.error('Error loading scenarios:', err)
    }
  }

  // スタッフ編集
  const handleEditStaff = (staffMember: Staff) => {
    setEditingStaff(staffMember)
    setIsEditModalOpen(true)
  }

  // スタッフ保存
  const handleSaveStaff = async (staffData: Staff) => {
    try {
      if (staffData.id) {
        // 更新
        const originalStaff = staff.find(s => s.id === staffData.id)
        const specialScenariosChanged = JSON.stringify(originalStaff?.special_scenarios?.sort()) !== JSON.stringify(staffData.special_scenarios?.sort())
        
        // まず基本情報を更新
        console.log('💾 保存するスタッフデータ:', { id: staffData.id, avatar_color: staffData.avatar_color, name: staffData.name })
        await staffApi.update(staffData.id, staffData)
        
        // 担当シナリオが変更された場合、リレーションテーブルも更新
        if (specialScenariosChanged) {
          await assignmentApi.updateStaffAssignments(staffData.id, staffData.special_scenarios || [])
        }
      } else {
        // 新規作成
        const newStaff = await staffApi.create(staffData)
        
        // 新規作成時も担当シナリオがあればリレーションテーブルに追加
        if (staffData.special_scenarios && staffData.special_scenarios.length > 0) {
          await assignmentApi.updateStaffAssignments(newStaff.id, staffData.special_scenarios)
        }
      }
      
      // スタッフ保存後、担当シナリオ情報を含めてリストを再読み込み
      await loadStaff()
    } catch (err: any) {
      console.error('Error saving staff:', err)
      alert('スタッフの保存に失敗しました: ' + err.message)
    }
  }

  // モーダルを閉じる
  const handleCloseEditModal = () => {
    setIsEditModalOpen(false)
    setEditingStaff(null)
  }

  // スタッフ招待
  const handleInviteStaff = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setInviteLoading(true)

    const formData = new FormData(event.currentTarget)
    const request: InviteStaffRequest = {
      email: formData.get('email') as string,
      name: formData.get('name') as string,
      phone: formData.get('phone') as string || undefined,
      line_name: formData.get('line_name') as string || undefined,
      x_account: formData.get('x_account') as string || undefined,
      discord_id: formData.get('discord_id') as string || undefined,
      discord_channel_id: formData.get('discord_channel_id') as string || undefined,
      role: ['gm'],
      stores: []
    }

    try {
      const result = await inviteStaff(request)
      
      if (result.success) {
        alert(`✅ ${request.name}さんを招待しました！\n\n招待メールが${request.email}に送信されました。`)
        setIsInviteModalOpen(false)
        // スタッフリストを再読み込み
        await loadStaff()
      } else {
        throw new Error(result.error || '招待に失敗しました')
      }
    } catch (err: any) {
      console.error('Error inviting staff:', err)
      alert('スタッフの招待に失敗しました: ' + err.message)
    } finally {
      setInviteLoading(false)
    }
  }

  // シナリオIDをシナリオ名に変換する関数
  const getScenarioName = (scenarioId: string) => {
    const scenario = scenarios.find(s => s.id === scenarioId)
    return scenario ? scenario.title : scenarioId
  }

  function openDeleteDialog(member: Staff) {
    setStaffToDelete(member)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteStaff() {
    if (!staffToDelete) return

    try {
      await staffApi.delete(staffToDelete.id)
      // 削除成功後、リストから除去
      setStaff(prev => prev.filter(s => s.id !== staffToDelete.id))
      setDeleteDialogOpen(false)
      setStaffToDelete(null)
    } catch (err: any) {
      console.error('Error deleting staff:', err)
      alert('スタッフの削除に失敗しました: ' + err.message)
    }
  }

  // ハッシュ変更でページ切り替え
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1)
      if (hash && hash !== 'staff') {
        // 他のページに切り替わった場合、AdminDashboardに戻る
        window.location.href = '/#' + hash
      } else if (!hash) {
        // ダッシュボードに戻る
        window.location.href = '/'
      }
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  function getStatusBadge(status: string) {
    switch (status) {
      case 'active':
        return <Badge size="sm" className="bg-green-100 text-green-800 font-normal text-xs">在籍中</Badge>
      case 'inactive':
        return <Badge size="sm" className="bg-gray-100 text-gray-800 font-normal text-xs">休職中</Badge>
      case 'on_leave':
        return <Badge size="sm" className="bg-yellow-100 text-yellow-800 font-normal text-xs">休暇中</Badge>
      case 'resigned':
        return <Badge size="sm" className="bg-red-100 text-red-800 font-normal text-xs">退職</Badge>
      default:
        return <Badge size="sm" className="bg-gray-100 text-gray-800 font-normal text-xs">{status}</Badge>
    }
  }

  function getRoleBadges(roles: string[]) {
    const roleNames: Record<string, string> = {
      'gm': 'GM',
      'manager': 'マネージャー',
      'staff': 'スタッフ',
      'trainee': '研修生',
      'admin': '管理者'
    }

    return roles.map((role, index) => (
      <Badge key={index} size="sm" className="font-normal text-xs px-1 py-0.5 bg-gray-100 text-gray-800">
        {roleNames[role] || role}
      </Badge>
    ))
  }

  function getStoreColors(storeName: string) {
    const storeColorMap: Record<string, string> = {
      '高田馬場店': 'bg-blue-100 text-blue-800',
      '別館①': 'bg-green-100 text-green-800',
      '別館②': 'bg-purple-100 text-purple-800',
      '大久保店': 'bg-orange-100 text-orange-800',
      '大塚店': 'bg-red-100 text-red-800',
      '埼玉大宮店': 'bg-amber-100 text-amber-800'
    }
    return storeColorMap[storeName] || 'bg-gray-100 text-gray-800'
  }


  // フィルタリング
  const filteredStaff = staff.filter(member => {
    const matchesSearch = member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (member.line_name && member.line_name.toLowerCase().includes(searchTerm.toLowerCase()))
    const matchesStatus = statusFilter === 'all' || member.status === statusFilter
    return matchesSearch && matchesStatus
  })

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="staff" />
        
        <div className="container mx-auto max-w-7xl px-8 py-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h1>スタッフ管理</h1>
              <Button disabled>
                <Plus className="h-4 w-4 mr-2" />
                新規スタッフ
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader>
                    <div className="h-6 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="h-4 bg-gray-200 rounded"></div>
                      <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="staff" />
        
        <div className="container mx-auto max-w-7xl px-8 py-6">
          <div className="space-y-6">
            <h1>スタッフ管理</h1>
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-red-800">
                  <Trash2 className="h-5 w-5" />
                  <p>{error}</p>
                </div>
                <Button 
                  onClick={() => setError('')} 
                  className="mt-4"
                  variant="outline"
                >
                  再読み込み
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="staff" />
      
      <div className="container mx-auto max-w-7xl px-8 py-6">
        <div className="space-y-6">
          {/* ヘッダー */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => window.history.back()}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                戻る
              </Button>
              <div>
                <h1>スタッフ管理</h1>
                <p className="text-muted-foreground">
                  全{staff.length}名のスタッフ管理
                </p>
              </div>
            </div>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              新規スタッフ
            </Button>
          </div>

          {/* 統計情報 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">{staff.length}</p>
                    <p className="text-muted-foreground">総スタッフ数</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">
                      {staff.filter(s => s.status === 'active').length}
                    </p>
                    <p className="text-muted-foreground">在籍中</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">
                      {staff.filter(s => s.role && s.role.includes('GM')).length}
                    </p>
                    <p className="text-muted-foreground">GM</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">
                      {Math.round(staff.reduce((sum, s) => sum + s.experience, 0) / staff.length) || 0}
                    </p>
                    <p className="text-muted-foreground">平均経験年数</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 検索・フィルター */}
          <div className="flex gap-4 items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="スタッフ名・LINE名で検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全ステータス</SelectItem>
                  <SelectItem value="active">在籍中</SelectItem>
                  <SelectItem value="inactive">休職中</SelectItem>
                  <SelectItem value="on-leave">休暇中</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button 
              variant="outline"
              onClick={() => setIsInviteModalOpen(true)}
              className="flex items-center gap-2"
            >
              <Mail className="h-4 w-4" />
              スタッフを招待
            </Button>

            <Button 
              onClick={() => {
                setEditingStaff(null)
                setIsEditModalOpen(true)
              }}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              新規作成
            </Button>
          </div>

          {/* スタッフ一覧 - スプレッドシート形式 */}
          <div className="space-y-1">
            {/* ヘッダー行 */}
            <Card>
              <CardContent className="p-0">
                <div className="flex items-center h-[50px] bg-muted/30">
                  <div className="flex-shrink-0 w-56 px-3 py-2 border-r font-medium text-sm">基本情報</div>
                  <div className="flex-shrink-0 w-32 px-3 py-2 border-r font-medium text-sm">役割</div>
                  <div className="flex-shrink-0 w-32 px-3 py-2 border-r font-medium text-sm">担当店舗</div>
                  <div className="flex-1 px-3 py-2 border-r font-medium text-sm min-w-0">GM可能</div>
                  <div className="flex-1 px-3 py-2 border-r font-medium text-sm min-w-0">体験済み</div>
                  <div className="flex-shrink-0 w-32 px-3 py-2 font-medium text-sm text-center">アクション</div>
                </div>
              </CardContent>
            </Card>

            {/* スタッフデータ行 */}
            <div className="space-y-1">
            {filteredStaff.map((member) => (
              <Card key={member.id} className="overflow-hidden hover:shadow-sm transition-shadow">
                <CardContent className="p-0">
                  <div className="flex items-center h-[50px]">
                    {/* 基本情報 */}
                    <div className="flex-shrink-0 w-56 px-3 py-2 border-r">
                      <div className="flex items-center gap-2">
                        <StaffAvatar
                          name={member.name}
                          avatarUrl={member.avatar_url}
                          avatarColor={member.avatar_color}
                          size="sm"
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-sm truncate leading-tight">{member.name}</h3>
                        </div>
                        <div className="flex-shrink-0">
                          {getStatusBadge(member.status)}
                        </div>
                      </div>
                    </div>

                    {/* 役割 */}
                    <div className="flex-shrink-0 w-32 px-3 py-2 border-r">
                      <div className="flex flex-wrap gap-1">
                        {member.role && member.role.length > 0 ? (
                          <>
                            {getRoleBadges(member.role.slice(0, 1))}
                            {member.role.length > 1 && (
                              <Badge size="sm" variant="outline" className="font-normal text-xs px-1 py-0.5">
                                +{member.role.length - 1}
                              </Badge>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </div>
                    </div>

                    {/* 担当店舗 */}
                    <div className="flex-shrink-0 w-32 px-3 py-2 border-r">
                      <div className="flex flex-wrap gap-1">
                        {member.stores && member.stores.length > 0 ? (
                          <>
                            {member.stores.slice(0, 1).map((storeId, index) => {
                              const storeObj = stores.find(s => s.id === storeId)
                              return (
                                <Badge key={index} size="sm" variant="static" className={`font-normal text-xs px-1 py-0.5 ${getStoreColors(storeObj?.name || '')}`}>
                                  {storeObj ? storeObj.name : storeId}
                                </Badge>
                              )
                            })}
                            {member.stores.length > 1 && (
                              <Badge size="sm" variant="outline" className="font-normal text-xs px-1 py-0.5">
                                +{member.stores.length - 1}
                              </Badge>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </div>
                    </div>


                    {/* GM可能なシナリオ */}
                    <div className="flex-1 px-3 py-2 border-r min-w-0">
                      {member.special_scenarios && member.special_scenarios.length > 0 ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1 overflow-hidden cursor-pointer">
                              <div className="flex gap-1 overflow-hidden">
                                {member.special_scenarios.slice(0, 4).map((scenarioId, index) => (
                                  <Badge key={index} size="sm" variant="outline" className="font-normal text-xs px-1 py-0.5 whitespace-nowrap flex-shrink-0">
                                    {getScenarioName(scenarioId)}
                                  </Badge>
                                ))}
                              </div>
                              {member.special_scenarios.length > 4 && (
                                <Badge size="sm" variant="outline" className="font-normal text-xs px-1 py-0.5 whitespace-nowrap flex-shrink-0">
                                  +{member.special_scenarios.length - 4}
                                </Badge>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs max-h-96 overflow-y-auto">
                            <div className="space-y-1">
                              <p className="font-medium text-xs">GM可能シナリオ（全{member.special_scenarios.length}件）:</p>
                              {member.special_scenarios.map((scenarioId, index) => (
                                <p key={index} className="text-xs">• {getScenarioName(scenarioId)}</p>
                              ))}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </div>

                    {/* 体験済みシナリオ（GM不可） */}
                    <div className="flex-1 px-3 py-2 border-r min-w-0">
                      {(member as any).experienced_scenarios && (member as any).experienced_scenarios.length > 0 ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1 overflow-hidden cursor-pointer">
                              <div className="flex gap-1 overflow-hidden">
                                {(member as any).experienced_scenarios.slice(0, 4).map((scenarioId: string, index: number) => (
                                  <Badge key={index} size="sm" variant="outline" className="font-normal text-xs px-1 py-0.5 whitespace-nowrap flex-shrink-0">
                                    {getScenarioName(scenarioId)}
                                  </Badge>
                                ))}
                              </div>
                              {(member as any).experienced_scenarios.length > 4 && (
                                <Badge size="sm" variant="outline" className="font-normal text-xs px-1 py-0.5 whitespace-nowrap flex-shrink-0">
                                  +{(member as any).experienced_scenarios.length - 4}
                                </Badge>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs max-h-96 overflow-y-auto">
                            <div className="space-y-1">
                              <p className="font-medium text-xs">体験済みシナリオ（全{(member as any).experienced_scenarios.length}件）:</p>
                              {(member as any).experienced_scenarios.map((scenarioId: string, index: number) => (
                                <p key={index} className="text-xs">• {getScenarioName(scenarioId)}</p>
                              ))}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </div>


                    {/* アクション */}
                    <div className="flex-shrink-0 w-32 px-3 py-2">
                      <div className="flex gap-1 justify-center">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleEditStaff(member)}
                          className="h-6 w-6 p-0"
                          title="編集"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => openDeleteDialog(member)}
                          className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          title="削除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            </div>

            {/* 検索結果が空の場合 */}
            {filteredStaff.length === 0 && (
              <Card>
                <CardContent className="pt-6 text-center">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    {searchTerm || statusFilter !== 'all' 
                      ? '検索条件に一致するスタッフが見つかりません' 
                      : 'スタッフが登録されていません'}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* スタッフ招待モーダル */}
      <Dialog open={isInviteModalOpen} onOpenChange={setIsInviteModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              スタッフを招待
            </DialogTitle>
            <DialogDescription>
              新しいスタッフメンバーを招待します。招待メールが送信され、ユーザーアカウントが自動的に作成されます。
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleInviteStaff} className="space-y-4">
            <div className="space-y-4">
              {/* 基本情報 */}
              <div className="space-y-3">
                <h3 className="font-medium text-sm">基本情報 *</h3>
                
                <div>
                  <Label htmlFor="invite-email">メールアドレス *</Label>
                  <Input
                    id="invite-email"
                    name="email"
                    type="email"
                    required
                    placeholder="example@gmail.com"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    このメールアドレスに招待メールが送信されます
                  </p>
                </div>

                <div>
                  <Label htmlFor="invite-name">名前 *</Label>
                  <Input
                    id="invite-name"
                    name="name"
                    type="text"
                    required
                    placeholder="山田 太郎"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="invite-phone">電話番号</Label>
                  <Input
                    id="invite-phone"
                    name="phone"
                    type="tel"
                    placeholder="090-1234-5678"
                    className="mt-1"
                  />
                </div>
              </div>

              {/* SNS・連絡先 */}
              <div className="space-y-3">
                <h3 className="font-medium text-sm">SNS・連絡先（任意）</h3>
                
                <div>
                  <Label htmlFor="invite-line">LINE名</Label>
                  <Input
                    id="invite-line"
                    name="line_name"
                    type="text"
                    placeholder="yamada_taro"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="invite-x">X (Twitter) アカウント</Label>
                  <Input
                    id="invite-x"
                    name="x_account"
                    type="text"
                    placeholder="@yamada_gm"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="invite-discord-id">Discord ID</Label>
                  <Input
                    id="invite-discord-id"
                    name="discord_id"
                    type="text"
                    placeholder="123456789012345678"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="invite-discord-channel">Discord チャンネルID</Label>
                  <Input
                    id="invite-discord-channel"
                    name="discord_channel_id"
                    type="text"
                    placeholder="987654321098765432"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    このチャンネルに貸切リクエストの通知が送信されます
                  </p>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <Mail className="h-4 w-4 text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-sm text-blue-900">招待後の流れ</p>
                    <ul className="text-xs text-blue-800 space-y-1 mt-2">
                      <li>1. 招待メールが送信されます</li>
                      <li>2. スタッフがメール内のリンクをクリック</li>
                      <li>3. パスワードを設定してログイン</li>
                      <li>4. すぐに使用開始できます</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsInviteModalOpen(false)}
                disabled={inviteLoading}
              >
                キャンセル
              </Button>
              <Button type="submit" disabled={inviteLoading}>
                {inviteLoading ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    招待中...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    招待メールを送信
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* スタッフ編集モーダル */}
      <StaffEditModal
        isOpen={isEditModalOpen}
        onClose={handleCloseEditModal}
        onSave={handleSaveStaff}
        staff={editingStaff}
        stores={stores}
        scenarios={scenarios}
      />

      {/* 削除確認ダイアログ */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              スタッフを削除
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                「<span className="font-semibold text-foreground">{staffToDelete?.name}</span>」を削除してもよろしいですか？
              </p>
              <p className="text-amber-600 font-medium">
                この操作は取り消せません。以下の処理が実行されます：
              </p>
              <ul className="list-disc list-inside text-sm space-y-1 pl-2">
                <li>シフト提出データを削除</li>
                <li>シナリオアサインメントを削除</li>
                <li>スケジュールのGM欄からこのスタッフを削除</li>
                <li>予約のスタッフ欄からこのスタッフを削除</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-2">
                ※ スケジュールイベントと予約自体は削除されません
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteStaff}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </TooltipProvider>
  )
}