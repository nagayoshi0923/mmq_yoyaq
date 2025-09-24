import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { staffApi } from '@/lib/api'
import type { Staff } from '@/types'
import { 
  Users, 
  Plus, 
  Edit, 
  Trash2, 
  Phone, 
  Mail,
  Eye,
  EyeOff,
  Calendar,
  MapPin,
  Star,
  Search,
  Filter,
  Shield,
  Clock,
  ArrowLeft
} from 'lucide-react'

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [contactPassword, setContactPassword] = useState('')
  const [showContactInfo, setShowContactInfo] = useState<Record<string, boolean>>({})

  useEffect(() => {
    loadStaff()
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
        return <Badge className="bg-green-100 text-green-800">在籍中</Badge>
      case 'inactive':
        return <Badge className="bg-gray-100 text-gray-800">休職中</Badge>
      case 'on-leave':
        return <Badge className="bg-yellow-100 text-yellow-800">休暇中</Badge>
      default:
        return <Badge className="bg-gray-100 text-gray-800">{status}</Badge>
    }
  }

  function getRoleBadges(roles: string[]) {
    const roleColors: Record<string, string> = {
      'GM': 'bg-blue-100 text-blue-800',
      'マネージャー': 'bg-purple-100 text-purple-800',
      '企画スタッフ': 'bg-orange-100 text-orange-800',
      'スタッフ': 'bg-green-100 text-green-800'
    }

    return roles.map((role, index) => (
      <Badge key={index} className={roleColors[role] || 'bg-gray-100 text-gray-800'}>
        {role}
      </Badge>
    ))
  }

  function getStoreColors(storeName: string) {
    const storeColorMap: Record<string, string> = {
      '高田馬場店': 'bg-blue-500',
      '別館①': 'bg-green-500',
      '別館②': 'bg-purple-500',
      '大久保店': 'bg-orange-500',
      '大塚店': 'bg-red-500',
      '埼玉大宮店': 'bg-amber-500'
    }
    return storeColorMap[storeName] || 'bg-gray-500'
  }

  function toggleContactInfo(staffId: string) {
    if (contactPassword !== '0909') {
      const password = prompt('連絡先を表示するにはパスワードを入力してください:')
      if (password === '0909') {
        setContactPassword('0909')
        setShowContactInfo(prev => ({ ...prev, [staffId]: !prev[staffId] }))
      } else {
        alert('パスワードが正しくありません')
      }
    } else {
      setShowContactInfo(prev => ({ ...prev, [staffId]: !prev[staffId] }))
    }
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
        
        <div className="container mx-auto px-4 py-6">
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
        
        <div className="container mx-auto px-4 py-6">
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
      
      <div className="container mx-auto px-4 py-6">
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
                  <Star className="h-5 w-5 text-muted-foreground" />
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
              <input
                type="text"
                placeholder="スタッフ名・LINE名で検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="all">全ステータス</option>
                <option value="active">在籍中</option>
                <option value="inactive">休職中</option>
                <option value="on-leave">休暇中</option>
              </select>
            </div>
          </div>

          {/* スタッフ一覧 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredStaff.map((member) => (
              <Card key={member.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        {member.name}
                      </CardTitle>
                      <CardDescription>
                        {member.line_name && `LINE: ${member.line_name}`}
                        {member.x_account && ` / X: ${member.x_account}`}
                      </CardDescription>
                    </div>
                    {getStatusBadge(member.status)}
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  {/* 役割 */}
                  {member.role && member.role.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">役割</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {getRoleBadges(member.role)}
                      </div>
                    </div>
                  )}

                  {/* 担当店舗 */}
                  {member.stores && member.stores.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">担当店舗</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {member.stores.map((store, index) => (
                          <div key={index} className="flex items-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${getStoreColors(store)}`}></div>
                            <span className="text-sm">{store}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 経験・出勤情報 */}
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">経験年数</p>
                      <p className="font-bold">{member.experience}年</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">出勤可能日</p>
                      <p className="text-sm">{member.availability?.length || 0}日/週</p>
                    </div>
                  </div>

                  {/* 連絡先（保護機能付き） */}
                  <div className="pt-2 border-t border-border">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-muted-foreground">連絡先</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleContactInfo(member.id)}
                      >
                        {showContactInfo[member.id] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    
                    {showContactInfo[member.id] ? (
                      <div className="space-y-1 mt-2">
                        {member.phone && (
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="h-4 w-4" />
                            <span>{member.phone}</span>
                          </div>
                        )}
                        {member.email && (
                          <div className="flex items-center gap-2 text-sm">
                            <Mail className="h-4 w-4" />
                            <span>{member.email}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1 mt-2">
                        {member.phone && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone className="h-4 w-4" />
                            <span>***-****-****</span>
                          </div>
                        )}
                        {member.email && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Mail className="h-4 w-4" />
                            <span>****@****.com</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* メモ */}
                  {member.notes && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">メモ</p>
                      <p className="text-sm line-clamp-2">{member.notes}</p>
                    </div>
                  )}

                  {/* アクションボタン */}
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" className="flex-1">
                      <Edit className="h-4 w-4 mr-2" />
                      編集
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-red-600 hover:text-red-700"
                      onClick={() => handleDeleteStaff(member)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
  )
}