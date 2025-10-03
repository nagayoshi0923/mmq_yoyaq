import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { StaffEditModal } from '@/components/modals/StaffEditModal'
import { staffApi, storeApi, scenarioApi } from '@/lib/api'
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
  ArrowLeft
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'

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
  const [staff, setStaff] = useState<Staff[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [scenarios, setScenarios] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  
  // 編集モーダル用のstate
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null)

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
      setStaff(data)
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
        
        if (specialScenariosChanged) {
          // 担当シナリオが変更された場合、同期更新APIを使用
          await staffApi.updateSpecialScenarios(staffData.id, staffData.special_scenarios || [])
        } else {
          // 担当シナリオが変更されていない場合、通常の更新APIを使用
          await staffApi.update(staffData.id, staffData)
        }
        setStaff(prev => prev.map(s => s.id === staffData.id ? staffData : s))
      } else {
        // 新規作成
        const newStaff = await staffApi.create(staffData)
        setStaff(prev => [...prev, newStaff])
        
        // 新規作成時も担当シナリオがあれば同期更新
        if (staffData.special_scenarios && staffData.special_scenarios.length > 0) {
          await staffApi.updateSpecialScenarios(newStaff.id, staffData.special_scenarios)
        }
      }
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

  // シナリオIDをシナリオ名に変換する関数
  const getScenarioName = (scenarioId: string) => {
    const scenario = scenarios.find(s => s.id === scenarioId)
    return scenario ? scenario.title : scenarioId
  }

  async function handleDeleteStaff(member: Staff) {
    if (!confirm(`「${member.name}」を削除してもよろしいですか？\n\nこの操作は取り消せません。`)) {
      return
    }

    try {
      await staffApi.delete(member.id)
      // 削除成功後、リストから除去
      setStaff(prev => prev.filter(s => s.id !== member.id))
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
                  <div className="flex-shrink-0 w-40 px-3 py-2 border-r font-medium text-sm">基本情報</div>
                  <div className="flex-shrink-0 w-32 px-3 py-2 border-r font-medium text-sm">役割</div>
                  <div className="flex-shrink-0 w-32 px-3 py-2 border-r font-medium text-sm">担当店舗</div>
                  <div className="flex-1 px-3 py-2 border-r font-medium text-sm min-w-0">担当シナリオ</div>
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
                    <div className="flex-shrink-0 w-40 px-3 py-2 border-r">
                      <div className="flex items-center gap-2">
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


                    {/* 担当シナリオ */}
                    <div className="flex-1 px-3 py-2 border-r min-w-0">
                      <div className="flex flex-wrap gap-1">
                        {member.special_scenarios && member.special_scenarios.length > 0 ? (
                          <>
                            {member.special_scenarios.slice(0, 3).map((scenarioId, index) => (
                              <Badge key={index} size="sm" variant="outline" className="font-normal text-xs px-1 py-0.5">
                                {getScenarioName(scenarioId)}
                              </Badge>
                            ))}
                            {member.special_scenarios.length > 3 && (
                              <Badge size="sm" variant="outline" className="font-normal text-xs px-1 py-0.5">
                                +{member.special_scenarios.length - 3}
                              </Badge>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </div>
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

      {/* スタッフ編集モーダル */}
      <StaffEditModal
        isOpen={isEditModalOpen}
        onClose={handleCloseEditModal}
        onSave={handleSaveStaff}
        staff={editingStaff}
        stores={stores}
        scenarios={scenarios}
      />
    </div>
  )
}