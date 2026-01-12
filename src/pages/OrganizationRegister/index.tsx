/**
 * セルフサービス組織登録ページ
 * @page OrganizationRegister
 * @path #register
 * @purpose 新規組織がセルフサービスで登録申請できるページ
 * @access 未ログインユーザー
 * @organization なし（新規組織作成）
 */
import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { 
  Building2, 
  Mail, 
  User, 
  Lock,
  CheckCircle,
  Loader2,
  AlertCircle,
  ArrowRight,
  ArrowLeft
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { createOrganization } from '@/lib/organization'
import { toast } from 'sonner'

type Step = 'organization' | 'admin' | 'confirm' | 'complete'

export default function OrganizationRegister() {
  const [currentStep, setCurrentStep] = useState<Step>('organization')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 組織情報
  const [orgData, setOrgData] = useState({
    name: '',
    slug: '',
    contact_email: '',
  })

  // 管理者情報
  const [adminData, setAdminData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })

  // 利用規約同意
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  // slug を name から自動生成
  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30)
  }

  const handleOrgNameChange = (name: string) => {
    setOrgData(prev => ({
      ...prev,
      name,
      slug: prev.slug || generateSlug(name),
    }))
  }

  // ステップ1: 組織情報のバリデーション
  const validateOrganization = (): boolean => {
    if (!orgData.name.trim()) {
      setError('組織名を入力してください')
      return false
    }
    if (!orgData.slug.trim()) {
      setError('識別子を入力してください')
      return false
    }
    if (!/^[a-z0-9-]+$/.test(orgData.slug)) {
      setError('識別子は半角英数字とハイフンのみ使用できます')
      return false
    }
    setError(null)
    return true
  }

  // ステップ2: 管理者情報のバリデーション
  const validateAdmin = (): boolean => {
    if (!adminData.name.trim()) {
      setError('管理者名を入力してください')
      return false
    }
    if (!adminData.email.trim()) {
      setError('メールアドレスを入力してください')
      return false
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminData.email)) {
      setError('有効なメールアドレスを入力してください')
      return false
    }
    if (adminData.password.length < 8) {
      setError('パスワードは8文字以上で入力してください')
      return false
    }
    if (adminData.password !== adminData.confirmPassword) {
      setError('パスワードが一致しません')
      return false
    }
    setError(null)
    return true
  }

  // 次のステップへ
  const handleNext = () => {
    if (currentStep === 'organization') {
      if (validateOrganization()) {
        setCurrentStep('admin')
      }
    } else if (currentStep === 'admin') {
      if (validateAdmin()) {
        setCurrentStep('confirm')
      }
    }
  }

  // 前のステップへ
  const handleBack = () => {
    setError(null)
    if (currentStep === 'admin') {
      setCurrentStep('organization')
    } else if (currentStep === 'confirm') {
      setCurrentStep('admin')
    }
  }

  // 組織を削除するロールバック関数
  const rollbackOrganization = async (orgId: string) => {
    try {
      const { error } = await supabase
        .from('organizations')
        .delete()
        .eq('id', orgId)
      
      if (error) {
        console.error('組織のロールバックに失敗:', error)
      } else {
        console.log('組織をロールバックしました:', orgId)
      }
    } catch (e) {
      console.error('組織のロールバック中にエラー:', e)
    }
  }

  // 登録を実行
  const handleSubmit = async () => {
    if (!agreedToTerms) {
      setError('利用規約に同意してください')
      return
    }

    setIsSubmitting(true)
    setError(null)

    let createdOrgId: string | null = null

    try {
      // 1. 組織を作成
      const org = await createOrganization({
        name: orgData.name.trim(),
        slug: orgData.slug.trim(),
        plan: 'free',
        contact_email: orgData.contact_email.trim() || adminData.email.trim(),
        is_active: true,
      })

      if (!org) {
        throw new Error('組織の作成に失敗しました')
      }

      createdOrgId = org.id

      // 2. 管理者ユーザーを作成
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: adminData.email.trim(),
        password: adminData.password,
      })

      if (authError) {
        // 組織を削除してロールバック
        if (createdOrgId) {
          await rollbackOrganization(createdOrgId)
        }
        throw authError
      }

      const userId = authData.user?.id
      if (!userId) {
        throw new Error('ユーザーの作成に失敗しました')
      }

      // 3. users テーブルにレコードを作成
      const { error: userError } = await supabase
        .from('users')
        .upsert({
          id: userId,
          email: adminData.email.trim(),
          role: 'admin',
          organization_id: org.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' })

      if (userError) {
        console.error('Failed to create user record:', userError)
      }

      // 4. staff テーブルにレコードを作成
      const { error: staffError } = await supabase
        .from('staff')
        .insert({
          name: adminData.name.trim(),
          email: adminData.email.trim(),
          user_id: userId,
          organization_id: org.id,
          role: ['管理者'],
          status: 'active',
          stores: [],
          ng_days: [],
          want_to_learn: [],
          available_scenarios: [],
          availability: [],
          experience: 0,
          special_scenarios: [],
        })

      if (staffError) {
        console.error('Failed to create staff record:', staffError)
      }

      // 成功
      setCurrentStep('complete')
      toast.success('組織を登録しました')
    } catch (error: unknown) {
      console.error('Registration failed:', error)
      
      // エラー時に組織をロールバック
      if (createdOrgId) {
        await rollbackOrganization(createdOrgId)
      }
      
      const message = error instanceof Error ? error.message : '登録に失敗しました'
      
      // よくあるエラーの日本語化
      if (message.includes('already registered')) {
        setError('このメールアドレスは既に登録されています')
      } else if (message.includes('duplicate key') && message.includes('slug')) {
        setError('この識別子は既に使用されています')
      } else {
        setError(message)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // ステップインジケーター
  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {(['organization', 'admin', 'confirm'] as const).map((step, index) => (
        <div key={step} className="flex items-center">
          <div className={`
            w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
            ${currentStep === step || (currentStep === 'complete' && step === 'confirm')
              ? 'bg-primary text-primary-foreground' 
              : index < ['organization', 'admin', 'confirm'].indexOf(currentStep)
                ? 'bg-green-500 text-white'
                : 'bg-muted text-muted-foreground'
            }
          `}>
            {index < ['organization', 'admin', 'confirm'].indexOf(currentStep) || currentStep === 'complete'
              ? <CheckCircle className="w-4 h-4" />
              : index + 1
            }
          </div>
          {index < 2 && (
            <div className={`w-12 h-0.5 mx-1 ${
              index < ['organization', 'admin', 'confirm'].indexOf(currentStep)
                ? 'bg-green-500'
                : 'bg-muted'
            }`} />
          )}
        </div>
      ))}
    </div>
  )

  // 完了画面
  if (currentStep === 'complete') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle>登録が完了しました！</CardTitle>
            <CardDescription>
              確認メールを送信しました。メールを確認してアカウントを有効化してください。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">組織名:</span>
                <span className="font-medium">{orgData.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">識別子:</span>
                <span className="font-medium">{orgData.slug}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">管理者:</span>
                <span className="font-medium">{adminData.name}</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              メール認証後、以下のURLからログインできます：
            </p>
            <code className="block text-center text-xs bg-muted p-2 rounded">
              {window.location.origin}/{orgData.slug}
            </code>
            <Button 
              className="w-full" 
              onClick={() => window.location.href = '/login'}
            >
              ログインページへ
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>新規組織登録</CardTitle>
          <CardDescription>
            MMQを利用する組織を登録します
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StepIndicator />

          {/* エラー表示 */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* ステップ1: 組織情報 */}
          {currentStep === 'organization' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="org-name">組織名 *</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="org-name"
                    value={orgData.name}
                    onChange={(e) => handleOrgNameChange(e.target.value)}
                    placeholder="例: 株式会社サンプル"
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="org-slug">識別子 (URL用) *</Label>
                <Input
                  id="org-slug"
                  value={orgData.slug}
                  onChange={(e) => setOrgData(prev => ({ ...prev, slug: e.target.value.toLowerCase() }))}
                  placeholder="例: sample-company"
                />
                <p className="text-xs text-muted-foreground">
                  半角英数字とハイフンのみ。予約サイトのURLに使用されます。
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="org-email">連絡先メールアドレス</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="org-email"
                    type="email"
                    value={orgData.contact_email}
                    onChange={(e) => setOrgData(prev => ({ ...prev, contact_email: e.target.value }))}
                    placeholder="例: contact@example.com"
                    className="pl-10"
                  />
                </div>
              </div>

              <Button className="w-full" onClick={handleNext}>
                次へ
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}

          {/* ステップ2: 管理者情報 */}
          {currentStep === 'admin' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="admin-name">管理者名 *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="admin-name"
                    value={adminData.name}
                    onChange={(e) => setAdminData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="例: 山田太郎"
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-email">メールアドレス *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="admin-email"
                    type="email"
                    value={adminData.email}
                    onChange={(e) => setAdminData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="例: admin@example.com"
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-password">パスワード *</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="admin-password"
                    type="password"
                    value={adminData.password}
                    onChange={(e) => setAdminData(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="8文字以上"
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-confirm-password">パスワード（確認）*</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="admin-confirm-password"
                    type="password"
                    value={adminData.confirmPassword}
                    onChange={(e) => setAdminData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    placeholder="もう一度入力"
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleBack}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  戻る
                </Button>
                <Button className="flex-1" onClick={handleNext}>
                  次へ
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* ステップ3: 確認 */}
          {currentStep === 'confirm' && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <h4 className="font-medium">組織情報</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">組織名:</span>
                    <span>{orgData.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">識別子:</span>
                    <span>{orgData.slug}</span>
                  </div>
                  {orgData.contact_email && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">連絡先:</span>
                      <span>{orgData.contact_email}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <h4 className="font-medium">管理者情報</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">名前:</span>
                    <span>{adminData.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">メール:</span>
                    <span>{adminData.email}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Checkbox
                  id="terms"
                  checked={agreedToTerms}
                  onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                />
                <Label htmlFor="terms" className="text-sm leading-relaxed">
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">利用規約</a>
                  と
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">プライバシーポリシー</a>
                  に同意します
                </Label>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleBack}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  戻る
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={handleSubmit}
                  disabled={isSubmitting || !agreedToTerms}
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  登録する
                </Button>
              </div>
            </div>
          )}

          <p className="text-xs text-center text-muted-foreground mt-4">
            既にアカウントをお持ちの場合は
            <a href="/login" className="text-primary hover:underline ml-1">
              ログイン
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

