/**
 * 組織向け新規登録ページ（公開向け）
 * @path /start
 * @purpose 他組織がMMQを導入する際のセルフサービス登録フォーム
 * @access 未ログインユーザー
 */
import { logger } from '@/utils/logger'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
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
  ArrowLeft,
  Check,
  Calendar,
  BarChart3,
  Users,
  Zap,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

type Step = 'organization' | 'admin' | 'confirm' | 'complete'

const STEPS: { id: Exclude<Step, 'complete'>; label: string }[] = [
  { id: 'organization', label: '組織情報' },
  { id: 'admin', label: '管理者アカウント' },
  { id: 'confirm', label: '確認' },
]

const BENEFITS = [
  {
    icon: Calendar,
    title: 'スケジュール管理',
    desc: '公演スケジュールをカレンダーで一元管理。シフト提出・GM割り当てまで完結。',
  },
  {
    icon: BarChart3,
    title: '売上・分析レポート',
    desc: '日次・月次の売上を自動集計。ライセンス報告書もワンクリックで出力。',
  },
  {
    icon: Users,
    title: 'スタッフ・GM管理',
    desc: 'スタッフの役割・空き状況を管理。招待リンクで簡単に追加できます。',
  },
  {
    icon: Zap,
    title: 'オンライン予約受付（有料）',
    desc: '24時間自動受付・自動メール送信。月額¥4,980で予約サイトを公開。',
  },
]

export default function OrgSignup() {
  const [searchParams] = useSearchParams()
  const selectedPlan = searchParams.get('plan') ?? 'free'

  const [currentStep, setCurrentStep] = useState<Step>('organization')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [orgData, setOrgData] = useState({
    name: '',
    slug: '',
    contact_email: '',
  })

  const [adminData, setAdminData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })

  const [agreedToTerms, setAgreedToTerms] = useState(false)
  // ユーザーが識別子を手動編集したかどうか（true なら組織名からの自動生成を止める）
  const [slugEdited, setSlugEdited] = useState(false)

  const generateSlug = (name: string) =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9぀-ゟ゠-ヿ一-龯]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30)

  const handleOrgNameChange = (name: string) => {
    setOrgData(prev => ({
      ...prev,
      name,
      // 手動編集済みなら slug を維持、未編集なら組織名から随時生成
      slug: slugEdited ? prev.slug : generateSlug(name),
    }))
  }

  const validateOrganization = (): boolean => {
    if (!orgData.name.trim()) { setError('組織名を入力してください'); return false }
    if (!orgData.slug.trim()) { setError('識別子を入力してください'); return false }
    if (!/^[a-z0-9-]+$/.test(orgData.slug)) { setError('識別子は半角英数字とハイフンのみ使用できます'); return false }
    setError(null)
    return true
  }

  const validateAdmin = (): boolean => {
    if (!adminData.name.trim()) { setError('管理者名を入力してください'); return false }
    if (!adminData.email.trim()) { setError('メールアドレスを入力してください'); return false }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminData.email)) { setError('有効なメールアドレスを入力してください'); return false }
    if (adminData.password.length < 8) { setError('パスワードは8文字以上で入力してください'); return false }
    if (adminData.password !== adminData.confirmPassword) { setError('パスワードが一致しません'); return false }
    setError(null)
    return true
  }

  const handleNext = () => {
    if (currentStep === 'organization' && validateOrganization()) setCurrentStep('admin')
    else if (currentStep === 'admin' && validateAdmin()) setCurrentStep('confirm')
  }

  const handleBack = () => {
    setError(null)
    if (currentStep === 'admin') setCurrentStep('organization')
    else if (currentStep === 'confirm') setCurrentStep('admin')
  }

  // 組織をロールバック（RPC経由で作成した場合）
  const rollbackOrganization = async (orgId: string) => {
    try {
      // SECURITY DEFINER RPC で作成した組織を削除するには管理者権限が必要なため、
      // フロントからは直接削除できない。signUp が失敗した場合は孤立した組織が残るが、
      // slug でアクセスされることはなく、定期クリーンアップで除去する想定。
      logger.warn('孤立した組織が発生した可能性があります（org_id=%s）。手動確認が必要です。', orgId)
    } catch (e) {
      logger.error('rollbackOrganization:', e)
    }
  }

  const handleSubmit = async () => {
    if (!agreedToTerms) { setError('利用規約に同意してください'); return }
    setIsSubmitting(true)
    setError(null)
    let createdOrgId: string | null = null

    try {
      // 1. SECURITY DEFINER RPC で組織を作成（anon 可、RLSをバイパス）
      const { data: newOrg, error: orgError } = await supabase.rpc(
        'register_organization_for_signup',
        {
          p_name:          orgData.name.trim(),
          p_slug:          orgData.slug.trim(),
          p_contact_email: orgData.contact_email.trim() || adminData.email.trim(),
        }
      )

      if (orgError) throw orgError
      if (!newOrg?.id) throw new Error('組織の作成に失敗しました')

      createdOrgId = newOrg.id

      // 2. signUp に user_metadata を渡す
      //    handle_new_user トリガーが users + staff レコードを自動作成する
      const { error: authError } = await supabase.auth.signUp({
        email: adminData.email.trim(),
        password: adminData.password,
        options: {
          data: {
            organization_id: newOrg.id,
            invited_as:      'admin',
            admin_name:      adminData.name.trim(),
          },
        },
      })

      if (authError) {
        if (createdOrgId) await rollbackOrganization(createdOrgId)
        throw authError
      }

      // 3. users / staff の手動INSERT は不要（トリガーが処理する）
      setCurrentStep('complete')
      toast.success('組織を登録しました！確認メールをご確認ください。')
    } catch (err: unknown) {
      logger.error('Registration failed:', err)
      const msg = err instanceof Error ? err.message : '登録に失敗しました'
      if (msg.includes('already registered')) {
        setError('このメールアドレスは既に登録されています')
      } else if (msg.includes('slug_already_exists')) {
        setError('この識別子は既に使用されています')
      } else if (msg.includes('invalid_slug_format')) {
        setError('識別子は半角英数字とハイフンのみ使用できます')
      } else {
        setError(msg)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const currentStepIndex = STEPS.findIndex(s => s.id === currentStep)

  // ═══ 完了画面 ═══
  if (currentStep === 'complete') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="mx-auto w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">登録完了！</h1>
            <p className="text-gray-500 text-sm leading-relaxed">
              確認メールを <span className="font-medium text-gray-700">{adminData.email}</span> に送信しました。<br />
              メールのリンクをクリックしてアカウントを有効化してください。
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4 text-left space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">組織名</span>
              <span className="font-medium">{orgData.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">管理者</span>
              <span className="font-medium">{adminData.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">ログインURL</span>
              <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                {window.location.origin}/{orgData.slug}
              </code>
            </div>
          </div>
          <Link to="/login">
            <Button className="w-full">ログインページへ</Button>
          </Link>
        </div>
      </div>
    )
  }

  // ═══ メイン登録フォーム ═══
  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[1fr_480px]">
      {/* ── 左パネル：訴求エリア ── */}
      <div
        className="hidden lg:flex flex-col justify-between p-12 text-white"
        style={{ background: 'linear-gradient(160deg, #111111 0%, #1a0000 60%, #0d0000 100%)' }}
      >
        <div>
          <div className="flex items-center gap-2 mb-12">
            <div className="w-8 h-8 bg-red-600 flex items-center justify-center rounded-sm">
              <span className="text-white font-black text-sm">M</span>
            </div>
            <span className="font-bold text-lg text-white">MMQ</span>
          </div>

          <h1 className="text-3xl font-black leading-tight mb-4">
            マーダーミステリー店舗の<br />
            <span className="text-red-500">運営をもっと簡単に。</span>
          </h1>
          <p className="text-white/60 text-sm leading-relaxed mb-10">
            MMQは、マーダーミステリー店舗向けの総合管理プラットフォームです。<br />
            管理機能はずっと無料でお使いいただけます。
          </p>

          <ul className="space-y-6">
            {BENEFITS.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex gap-4">
                <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <p className="font-semibold text-white text-sm mb-0.5">{title}</p>
                  <p className="text-white/50 text-xs leading-relaxed">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-white/30 text-xs">
          既存のアカウントをお持ちの方は{' '}
          <Link to="/login" className="text-white/60 hover:text-white underline">
            こちらからログイン
          </Link>
        </p>
      </div>

      {/* ── 右パネル：フォームエリア ── */}
      <div className="flex flex-col justify-center p-6 lg:p-10 bg-gray-50 lg:bg-white">
        {/* モバイルのみロゴ */}
        <div className="flex items-center gap-2 mb-8 lg:hidden">
          <div className="w-7 h-7 bg-red-600 flex items-center justify-center rounded-sm">
            <span className="text-white font-black text-xs">M</span>
          </div>
          <span className="font-bold text-gray-900">MMQ</span>
        </div>

        <form autoComplete="off" onSubmit={e => e.preventDefault()} className="max-w-sm w-full mx-auto">
          <h2 className="text-xl font-bold text-gray-900 mb-1">組織を登録する</h2>
          <p className="text-sm text-gray-500 mb-6">
            管理機能は無料でご利用いただけます
          </p>

          {/* ステップインジケーター */}
          <div className="flex items-center gap-1 mb-6">
            {STEPS.map((step, i) => (
              <div key={step.id} className="flex items-center flex-1">
                <div className={`
                  w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                  ${i < currentStepIndex
                    ? 'bg-green-500 text-white'
                    : i === currentStepIndex
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-200 text-gray-400'
                  }
                `}>
                  {i < currentStepIndex ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className={`ml-1.5 text-xs hidden sm:block truncate ${i === currentStepIndex ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                  {step.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-px mx-2 ${i < currentStepIndex ? 'bg-green-400' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>

          {/* エラー */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2.5 rounded-md mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* ── ステップ1：組織情報 ── */}
          {currentStep === 'organization' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="org-name" className="text-sm font-medium">組織名 <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="org-name"
                    value={orgData.name}
                    onChange={e => handleOrgNameChange(e.target.value)}
                    placeholder="例: 株式会社サンプル脱出ゲーム"
                    className="pl-9"
                    autoComplete="organization"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="org-slug" className="text-sm font-medium">
                  識別子（URL用）<span className="text-red-500">*</span>
                </Label>
                <Input
                  id="org-slug"
                  name="org-identifier-field"
                  value={orgData.slug}
                  onChange={e => {
                    setSlugEdited(true)
                    setOrgData(prev => ({ ...prev, slug: e.target.value.toLowerCase() }))
                  }}
                  placeholder="例: sample-escape"
                  autoComplete="off"
                />
                <p className="text-xs text-gray-400">
                  半角英数字・ハイフンのみ。<br />
                  予約サイトのURL（{window.location.origin}/<span className="font-mono">{orgData.slug || 'your-org'}</span>）に使用されます。
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="org-email" className="text-sm font-medium">連絡先メールアドレス</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="org-email"
                    type="email"
                    value={orgData.contact_email}
                    onChange={e => setOrgData(prev => ({ ...prev, contact_email: e.target.value }))}
                    placeholder="例: contact@example.com"
                    className="pl-9"
                    autoComplete="off"
                  />
                </div>
              </div>

              <Button className="w-full" onClick={handleNext}>
                次へ：管理者アカウント
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}

          {/* ── ステップ2：管理者アカウント ── */}
          {currentStep === 'admin' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="admin-name" className="text-sm font-medium">管理者名 <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="admin-name"
                    value={adminData.name}
                    onChange={e => setAdminData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="例: 山田太郎"
                    className="pl-9"
                    autoComplete="name"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="admin-email" className="text-sm font-medium">メールアドレス <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="admin-email"
                    type="email"
                    value={adminData.email}
                    onChange={e => setAdminData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="例: admin@example.com"
                    className="pl-9"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="admin-password" className="text-sm font-medium">パスワード <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="admin-password"
                    type="password"
                    value={adminData.password}
                    onChange={e => setAdminData(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="8文字以上"
                    className="pl-9"
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="admin-confirm" className="text-sm font-medium">パスワード（確認）<span className="text-red-500">*</span></Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="admin-confirm"
                    type="password"
                    value={adminData.confirmPassword}
                    onChange={e => setAdminData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    placeholder="もう一度入力"
                    className="pl-9"
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleBack}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  戻る
                </Button>
                <Button className="flex-1" onClick={handleNext}>
                  次へ：確認
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* ── ステップ3：確認 ── */}
          {currentStep === 'confirm' && (
            <div className="space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3 text-sm">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">組織情報</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-gray-500">組織名</span>
                      <span className="font-medium text-gray-900">{orgData.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">識別子</span>
                      <span className="font-mono text-gray-900 text-xs">{orgData.slug}</span>
                    </div>
                    {orgData.contact_email && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">連絡先</span>
                        <span className="text-gray-900">{orgData.contact_email}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="border-t border-gray-200 pt-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">管理者アカウント</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-gray-500">名前</span>
                      <span className="font-medium text-gray-900">{adminData.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">メール</span>
                      <span className="text-gray-900">{adminData.email}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Checkbox
                  id="terms"
                  checked={agreedToTerms}
                  onCheckedChange={checked => setAgreedToTerms(checked === true)}
                />
                <Label htmlFor="terms" className="text-sm text-gray-600 leading-relaxed cursor-pointer">
                  <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">利用規約</Link>
                  {' '}と{' '}
                  <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">プライバシーポリシー</Link>
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

          <p className="text-xs text-center text-gray-400 mt-6">
            既にアカウントをお持ちの方は{' '}
            <Link to="/login" className="text-gray-600 hover:underline">ログイン</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
