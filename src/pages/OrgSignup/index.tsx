/**
 * 組織向け新規登録ページ（公開向け）
 * @path /start
 * @purpose 他組織がMMQを導入する際のセルフサービス登録フォーム
 * @access 未ログインユーザー
 */
import { logger } from '@/utils/logger'
import { useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
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
  LogIn,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { resendSignupConfirmationEmail } from '@/lib/authResendSignup'

type Step = 'form' | 'confirm' | 'complete'

const PREFECTURES = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
  '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
  '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
  '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
]

const STEPS: { id: Exclude<Step, 'complete'>; label: string }[] = [
  { id: 'form', label: '入力' },
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
  const { user } = useAuth()
  const navigate = useNavigate()
  const isLoggedIn = !!user

  const [currentStep, setCurrentStep] = useState<Step>('form')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [orgData, setOrgData] = useState({
    name: '',
    slug: '',
  })

  const [adminData, setAdminData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    prefecture: '',
    birthDate: '',
  })

  const [storeData, setStoreData] = useState({
    name: '',
    address: '',
  })

  const [agreedToTerms, setAgreedToTerms] = useState(false)

  // 既存メアドチェック関連
  const [emailCheckStatus, setEmailCheckStatus] = useState<
    'idle' | 'confirmed' | 'pending_confirmation'
  >('idle')
  const [isCheckingEmail, setIsCheckingEmail] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const [resendError, setResendError] = useState('')

  const handleOrgNameChange = (name: string) => {
    setOrgData(prev => ({ ...prev, name }))
  }

  // メアドが変更されたら既存チェック結果をリセット
  const handleAdminEmailChange = (email: string) => {
    setAdminData(prev => ({ ...prev, email }))
    if (emailCheckStatus !== 'idle') {
      setEmailCheckStatus('idle')
      setResendMessage('')
      setResendError('')
    }
  }

  // 確認メール再送
  const handleResendConfirmation = async () => {
    setResendError('')
    setResendMessage('')
    setResendLoading(true)
    try {
      const result = await resendSignupConfirmationEmail(
        adminData.email.trim(),
        `${window.location.origin}/complete-profile`
      )
      if (result.ok) {
        setResendMessage(
          '確認メールを再送しました。メールのリンクをクリックして登録を完了してから、再度この画面から組織登録をやり直してください。'
        )
      } else {
        setResendError(result.message)
      }
    } finally {
      setResendLoading(false)
    }
  }

  const validateForm = (): boolean => {
    // 組織情報
    if (!orgData.name.trim()) { setError('組織名を入力してください'); return false }
    if (!orgData.slug.trim()) { setError('識別子を入力してください'); return false }
    if (!/^[a-z0-9-]+$/.test(orgData.slug)) { setError('識別子は半角英数字とハイフンのみ使用できます'); return false }

    // 管理者アカウント（未ログイン時のみ）
    if (!isLoggedIn) {
      if (!adminData.name.trim()) { setError('管理者名を入力してください'); return false }
      if (!adminData.email.trim()) { setError('メールアドレスを入力してください'); return false }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminData.email)) { setError('有効なメールアドレスを入力してください'); return false }
      if (adminData.password.length < 8) { setError('パスワードは8文字以上で入力してください'); return false }
      if (adminData.password !== adminData.confirmPassword) { setError('パスワードが一致しません'); return false }

      const phoneDigits = adminData.phone.replace(/[-\s]/g, '')
      if (!phoneDigits) { setError('電話番号を入力してください'); return false }
      if (!/^\d{10,11}$/.test(phoneDigits)) { setError('電話番号は10〜11桁で入力してください'); return false }
      if (!adminData.prefecture) { setError('お住まいの都道府県を選択してください'); return false }
      if (!adminData.birthDate) { setError('生年月日を入力してください'); return false }
      const birthDateMatch = adminData.birthDate.match(/^(\d{4})\/(\d{2})\/(\d{2})$/)
      if (!birthDateMatch) { setError('生年月日は YYYY/MM/DD 形式で入力してください'); return false }
      const [, y, m, d] = birthDateMatch
      const dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
      if (dt.getFullYear() !== parseInt(y) || dt.getMonth() !== parseInt(m) - 1 || dt.getDate() !== parseInt(d)) {
        setError('有効な日付を入力してください'); return false
      }
      if (dt >= new Date()) { setError('生年月日に未来の日付は設定できません'); return false }
    }

    // 代表店舗（店舗名は空ならフォーム上で組織名にフォールバック）
    const effectiveStoreName = storeData.name.trim() || orgData.name.trim()
    if (!effectiveStoreName) { setError('店舗名を入力してください'); return false }
    if (!storeData.address.trim()) { setError('住所を入力してください'); return false }

    setError(null)
    return true
  }

  // メアド欄を離れた時に既存アカウントチェック（インライン警告表示用）
  const handleAdminEmailBlur = async () => {
    const email = adminData.email.trim()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return
    setIsCheckingEmail(true)
    try {
      const { data: status, error: checkErr } = await supabase.rpc(
        'check_email_registration_status',
        { p_email: email }
      )
      if (checkErr) {
        logger.warn('check_email_registration_status エラー（onBlur）:', checkErr)
        return
      }
      if (status === 'confirmed') {
        setEmailCheckStatus('confirmed')
      } else if (status === 'pending_confirmation') {
        setEmailCheckStatus('pending_confirmation')
      } else {
        setEmailCheckStatus('idle')
      }
    } finally {
      setIsCheckingEmail(false)
    }
  }

  const handleNext = async () => {
    if (currentStep !== 'form') return
    if (!validateForm()) return

    // 確認ステップへ進む前に最終的なメアドチェック（onBlur が走ってないケース対策）
    if (!isLoggedIn) {
      setIsCheckingEmail(true)
      try {
        const { data: status, error: checkErr } = await supabase.rpc(
          'check_email_registration_status',
          { p_email: adminData.email.trim() }
        )
        if (checkErr) {
          logger.warn('check_email_registration_status エラー（next 押下）:', checkErr)
        } else if (status === 'confirmed') {
          setEmailCheckStatus('confirmed')
          return
        } else if (status === 'pending_confirmation') {
          setEmailCheckStatus('pending_confirmation')
          return
        }
      } finally {
        setIsCheckingEmail(false)
      }
    }

    // 店舗名が空なら組織名で確定する（confirm 表示・RPC 送信を一貫させる）
    if (!storeData.name.trim()) {
      setStoreData(prev => ({ ...prev, name: orgData.name.trim() }))
    }
    setCurrentStep('confirm')
  }

  const handleBack = () => {
    setError(null)
    if (currentStep === 'confirm') setCurrentStep('form')
  }

  // 組織をロールバック（RPC経由で作成した場合）
  // signUp 失敗時など、ユーザー紐付け前の孤立組織を rollback_orphan_organization RPC で削除する
  // RPC 側で「作成 10 分以内 + ユーザー/スタッフ未紐付け」を検証するので不正利用は防げる
  const rollbackOrganization = async (orgId: string) => {
    try {
      const { error } = await supabase.rpc('rollback_orphan_organization', { p_org_id: orgId })
      if (error) {
        logger.error('rollback_orphan_organization failed (org_id=%s):', orgId, error)
      } else {
        logger.log('孤立組織を rollback しました (org_id=%s)', orgId)
      }
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
      // 1. SECURITY DEFINER RPC で組織+代表店舗を作成（anon 可、RLSをバイパス）
      const { data: newOrg, error: orgError } = await supabase.rpc(
        'register_organization_for_signup',
        {
          p_name:          orgData.name.trim(),
          p_slug:          orgData.slug.trim(),
          // 連絡先メアドは admin メアド / ログイン中ユーザーのメアドを自動採用
          p_contact_email: isLoggedIn ? user?.email ?? '' : adminData.email.trim(),
          p_store_name:    storeData.name.trim() || orgData.name.trim(),
          p_store_address: storeData.address.trim(),
        }
      )

      if (orgError) throw orgError
      if (!newOrg?.id) throw new Error('組織の作成に失敗しました')

      createdOrgId = newOrg.id

      if (isLoggedIn) {
        // ── ログイン済みパス: 既存アカウントを admin に昇格 ──
        const { error: claimError } = await supabase.rpc('claim_organization_as_admin', {
          p_org_id:     newOrg.id,
          p_admin_name: user?.email ?? '',
        })
        if (claimError) {
          if (createdOrgId) await rollbackOrganization(createdOrgId)
          throw claimError
        }
        setCurrentStep('complete')
        toast.success('組織を登録しました！')
        // セッションのロール変更を反映するためリロード
        setTimeout(() => navigate(`/${newOrg.slug}/dashboard`), 1500)
      } else {
        // ── 新規アカウントパス: signUp に user_metadata を渡す ──
        //    handle_new_user トリガーが users + staff + customers レコードを自動作成する
        const birthMatch = adminData.birthDate.match(/^(\d{4})\/(\d{2})\/(\d{2})$/)
        const adminBirthDateIso = birthMatch
          ? `${birthMatch[1]}-${birthMatch[2]}-${birthMatch[3]}`
          : null
        const { error: authError } = await supabase.auth.signUp({
          email: adminData.email.trim(),
          password: adminData.password,
          options: {
            data: {
              organization_id:   newOrg.id,
              invited_as:        'admin',
              admin_name:        adminData.name.trim(),
              admin_phone:       adminData.phone.trim(),
              admin_prefecture:  adminData.prefecture,
              admin_birth_date:  adminBirthDateIso,
            },
          },
        })

        if (authError) {
          if (createdOrgId) await rollbackOrganization(createdOrgId)
          throw authError
        }

        // users / staff の手動INSERT は不要（トリガーが処理する）
        setCurrentStep('complete')
        toast.success('組織を登録しました！確認メールをご確認ください。')
      }
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
            {isLoggedIn ? (
              <p className="text-gray-500 text-sm leading-relaxed">
                ダッシュボードに移動しています…
              </p>
            ) : (
              <p className="text-gray-500 text-sm leading-relaxed">
                確認メールを <span className="font-medium text-gray-700">{adminData.email}</span> に送信しました。<br />
                メールのリンクをクリックしてアカウントを有効化してください。
              </p>
            )}
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

        {!isLoggedIn && (
          <p className="text-white/30 text-xs">
            既存のアカウントをお持ちの方は{' '}
            <Link to={`/login?next=${encodeURIComponent('/start')}`} className="text-white/60 hover:text-white underline">
              こちらからログイン
            </Link>
          </p>
        )}
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

          {/* ── ステップ：入力（組織 + 管理者 + 代表店舗 を1ページに統合）── */}
          {currentStep === 'form' && (
            <div className="space-y-6">
              {/* セクション: 組織情報 */}
              <section className="space-y-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">組織情報</h3>

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
                    onChange={e => setOrgData(prev => ({ ...prev, slug: e.target.value.toLowerCase() }))}
                    placeholder="例: sample-escape"
                    autoComplete="off"
                  />
                  <p className="text-xs text-gray-400">
                    半角英数字・ハイフンのみ。<br />
                    予約サイトのURL（{window.location.origin}/<span className="font-mono">{orgData.slug || 'your-org'}</span>）に使用されます。
                  </p>
                </div>
              </section>

              {/* セクション: 管理者アカウント（未ログイン時のみ）*/}
              {!isLoggedIn && (
                <section className="space-y-4 pt-4 border-t border-gray-200">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">管理者アカウント</h3>

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
                    <Label htmlFor="admin-email" className="text-sm font-medium">
                      メールアドレス <span className="text-red-500">*</span>
                      {isCheckingEmail && <Loader2 className="w-3 h-3 inline ml-2 animate-spin text-gray-400" />}
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="admin-email"
                        type="email"
                        value={adminData.email}
                        onChange={e => handleAdminEmailChange(e.target.value)}
                        onBlur={handleAdminEmailBlur}
                        placeholder="例: admin@example.com"
                        className="pl-9"
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  {/* 既存 MMQ アカウントあり */}
                  {emailCheckStatus === 'confirmed' && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
                      <div className="flex items-start gap-2 text-sm text-amber-900">
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <p>
                          このメールアドレスは既に MMQ アカウントとして登録されています。
                          <br />
                          <span className="font-medium">先にログイン</span>してから組織を登録してください。
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Link to={`/login?next=${encodeURIComponent('/start')}`} className="flex-1 min-w-[140px]">
                          <Button type="button" size="sm" className="w-full">
                            <LogIn className="w-3.5 h-3.5 mr-1.5" />
                            ログインへ進む
                          </Button>
                        </Link>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="flex-1 min-w-[140px]"
                          onClick={() => {
                            setEmailCheckStatus('idle')
                            setAdminData(prev => ({ ...prev, email: '' }))
                          }}
                        >
                          別のメアドを入力
                        </Button>
                      </div>
                      <p className="text-xs text-amber-700">
                        ※ ログイン後にこの画面へ戻る際は組織情報の再入力が必要です。
                      </p>
                    </div>
                  )}

                  {/* 未確認（確認メール待ち） */}
                  {emailCheckStatus === 'pending_confirmation' && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
                      <div className="flex items-start gap-2 text-sm text-amber-900">
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <p>
                          このメールアドレスは確認メール待ちの状態です。
                          <br />
                          まずメールのリンクから登録を完了してから、再度この画面で組織登録をやり直してください。
                        </p>
                      </div>
                      {resendMessage && (
                        <p className="text-xs text-green-700">{resendMessage}</p>
                      )}
                      {resendError && (
                        <p className="text-xs text-red-600">{resendError}</p>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-full"
                        disabled={resendLoading}
                        onClick={handleResendConfirmation}
                      >
                        {resendLoading ? '送信中…' : '確認メールを再送する'}
                      </Button>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="admin-phone" className="text-sm font-medium">
                      電話番号 <span className="text-red-500">*</span>
                      <span className="text-xs text-gray-500 ml-2">（当日連絡用）</span>
                    </Label>
                    <Input
                      id="admin-phone"
                      type="tel"
                      value={adminData.phone}
                      onChange={e => setAdminData(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="例: 090-1234-5678"
                      autoComplete="tel"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="admin-prefecture" className="text-sm font-medium">
                      お住まいの都道府県 <span className="text-red-500">*</span>
                    </Label>
                    <select
                      id="admin-prefecture"
                      value={adminData.prefecture}
                      onChange={e => setAdminData(prev => ({ ...prev, prefecture: e.target.value }))}
                      className="w-full h-10 px-3 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-[#E60012] focus:border-transparent"
                    >
                      <option value="">選択してください</option>
                      {PREFECTURES.map((pref) => (
                        <option key={pref} value={pref}>{pref}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="admin-birth-date" className="text-sm font-medium">
                      生年月日 <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="admin-birth-date"
                      type="text"
                      inputMode="numeric"
                      value={adminData.birthDate}
                      onChange={e => {
                        let value = e.target.value.replace(/[^\d/]/g, '')
                        const digits = value.replace(/\//g, '')
                        if (digits.length <= 4) {
                          value = digits
                        } else if (digits.length <= 6) {
                          value = `${digits.slice(0, 4)}/${digits.slice(4)}`
                        } else {
                          value = `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6, 8)}`
                        }
                        setAdminData(prev => ({ ...prev, birthDate: value }))
                      }}
                      placeholder="1990/01/15"
                      maxLength={10}
                    />
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
                </section>
              )}

              {/* セクション: 代表店舗 */}
              <section className="space-y-4 pt-4 border-t border-gray-200">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">代表店舗</h3>

                <div className="space-y-1.5">
                  <Label htmlFor="store-name" className="text-sm font-medium">
                    店舗名 <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="store-name"
                    value={storeData.name}
                    onChange={e => setStoreData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder={`例: ${orgData.name || '〇〇店'}`}
                  />
                  <p className="text-xs text-gray-400">
                    未入力なら組織名を使います。実店舗の名前があれば入力してください。
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="store-address" className="text-sm font-medium">
                    住所 <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="store-address"
                    value={storeData.address}
                    onChange={e => setStoreData(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="例: 東京都渋谷区道玄坂 1-2-3 〇〇ビル 5F"
                    autoComplete="street-address"
                  />
                </div>
              </section>

              <Button
                className="w-full"
                onClick={handleNext}
                disabled={isCheckingEmail || emailCheckStatus !== 'idle'}
              >
                {isCheckingEmail && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                次へ：確認
                {!isCheckingEmail && <ArrowRight className="w-4 h-4 ml-2" />}
              </Button>
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
                  </div>
                </div>
                {!isLoggedIn && (
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
                      <div className="flex justify-between">
                        <span className="text-gray-500">電話番号</span>
                        <span className="text-gray-900">{adminData.phone}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">都道府県</span>
                        <span className="text-gray-900">{adminData.prefecture}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">生年月日</span>
                        <span className="text-gray-900">{adminData.birthDate}</span>
                      </div>
                    </div>
                  </div>
                )}
                <div className="border-t border-gray-200 pt-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">代表店舗</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-gray-500">店舗名</span>
                      <span className="font-medium text-gray-900">{storeData.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">住所</span>
                      <span className="text-gray-900 text-right max-w-[60%]">{storeData.address}</span>
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

          {!isLoggedIn && (
            <p className="text-xs text-center text-gray-400 mt-6">
              既にアカウントをお持ちの方は{' '}
              <Link to={`/login?next=${encodeURIComponent('/start')}`} className="text-gray-600 hover:underline">ログイン</Link>
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
