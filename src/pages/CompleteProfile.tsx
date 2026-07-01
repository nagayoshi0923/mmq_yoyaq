/**
 * プロフィール設定ページ
 * 初回ログイン後に氏名・電話番号を設定（OAuthでも必須）
 * メールサインアップ（確認メール経由）の場合はパスワードも設定
 * @path /complete-profile
 */
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { maskEmail } from '@/utils/security'
import { safeRedirectAfterProfileCompletion } from '@/lib/utils'
import { isCustomerProfileComplete } from '@/utils/customerProfileGate'
import { grantRegistrationCoupon } from '@/lib/api/couponApi'
import { ProfileForm } from './completeProfile/ProfileForm'
import { SuccessScreen, ReopenLinkScreen, DuplicateAccountScreen } from './completeProfile/StatusScreens'
import { useNavigate } from 'react-router-dom'
import { getOrganizationBySlug, QUEENS_WALTZ_ORG_ID } from '@/lib/organization'
import { getOrganizationSlugFromPath } from '@/lib/publicBookingPath'

export function CompleteProfile() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [userEmail, setUserEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [isOAuthUser, setIsOAuthUser] = useState(false)
  const [birthDate, setBirthDate] = useState('')
  const [prefecture, setPrefecture] = useState('')
  const [acceptNewsletter, setAcceptNewsletter] = useState(true)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [resendEmailInput, setResendEmailInput] = useState('')
  const [resendLoading, setResendLoading] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const [resendError, setResendError] = useState('')
  /** セッション確定後: プロフィール要否・重複メールの判定（userId がある間は resolving から開始） */
  const [profileGate, setProfileGate] = useState<
    'resolving' | 'form' | 'duplicate_account' | 'leaving'
  >('resolving')
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    let sessionReceived = false

    const applySession = (sessionUser: { id: string; email?: string; app_metadata?: Record<string, unknown> }) => {
      if (cancelled || sessionReceived) return
      sessionReceived = true
      setUserEmail(sessionUser.email || '')
      setUserId(sessionUser.id)
      
      // OAuth ユーザーまたは Magic Link (OTP) ユーザーはパスワード設定不要
      const provider = sessionUser.app_metadata?.provider as string | undefined
      const amr = sessionUser.app_metadata?.amr as Array<{ method: string }> | undefined
      const isOtp = amr?.some(a => a.method === 'otp')
      const isOAuth = Boolean(provider && provider !== 'email')
      setIsOAuthUser(isOAuth || Boolean(isOtp))
      
      setError('')
      setIsCheckingSession(false)
      logger.log('✅ セッション確認完了:', sessionUser.email, 'provider:', provider, 'isOtp:', isOtp)
    }

    // PKCE コード交換完了など、非同期でセッションが確立されたときに受け取る
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      logger.log('🔄 onAuthStateChange:', event, session?.user?.email)
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user && !cancelled) {
        applySession(session.user)
      }
    })

    // 初回: 既存セッション確認
    const checkSession = async () => {
      try {
        // まず即座にセッションを確認
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          applySession(session.user)
          return
        }
        
        // セッションがない場合、URL にトークン/コードがあれば処理
        const hash = window.location.hash
        const urlParams = new URLSearchParams(window.location.search)
        const hasTokenInHash = hash.includes('access_token')
        const hasCode = urlParams.has('code')
        
        // ハッシュからトークンを手動で抽出してセッション設定を試みる
        if (hasTokenInHash) {
          logger.log('⏳ ハッシュから認証トークンを抽出中...')
          const hashParams = new URLSearchParams(hash.substring(1))
          const accessToken = hashParams.get('access_token')
          const refreshToken = hashParams.get('refresh_token')
          
          if (accessToken && refreshToken) {
            logger.log('🔑 トークン検出 — setSession を実行')
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            })
            
            if (error) {
              logger.error('setSession error:', error)
            } else if (data.session?.user) {
              applySession(data.session.user)
              // ハッシュをクリア
              window.history.replaceState(null, '', window.location.pathname + window.location.search)
              return
            }
          }
          
          // setSession が失敗した場合は onAuthStateChange を待機
          logger.log('⏳ onAuthStateChange を待機中...')
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              if (!sessionReceived && !cancelled) {
                logger.warn('⚠️ セッション確立タイムアウト')
              }
              resolve()
            }, 10000)
            
            const checkInterval = setInterval(() => {
              if (sessionReceived || cancelled) {
                clearTimeout(timeout)
                clearInterval(checkInterval)
                resolve()
              }
            }, 100)
          })
        } else if (hasCode) {
          logger.log('⏳ PKCE コード検出 — セッション確立を待機中...')
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              if (!sessionReceived && !cancelled) {
                logger.warn('⚠️ セッション確立タイムアウト')
              }
              resolve()
            }, 10000)
            
            const checkInterval = setInterval(() => {
              if (sessionReceived || cancelled) {
                clearTimeout(timeout)
                clearInterval(checkInterval)
                resolve()
              }
            }, 100)
          })
        } else {
          logger.log('⏳ トークンなし — 既存セッションを再確認')
          const { data: { session: retrySession } } = await supabase.auth.getSession()
          if (retrySession?.user) {
            applySession(retrySession.user)
          }
        }
      } catch (err) {
        logger.error('Session check error:', err)
      } finally {
        if (!cancelled) {
          setIsCheckingSession(false)
        }
      }
    }

    checkSession()

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  // AppRoot と同じ基準で「プロフィール完了」なら next へ。未完了でメールが他アカウントの顧客に取られていれば案内
  useEffect(() => {
    if (isCheckingSession || !userId) {
      return
    }

    let cancelled = false
    setProfileGate('resolving')

    ;(async () => {
      try {
        // admin/staff ユーザーは顧客プロフィールフォームをスキップしてダッシュボードへ
        const { data: userRecord } = await supabase
          .from('users')
          .select('role, organization_id')
          .eq('id', userId)
          .maybeSingle()

        if (cancelled) return

        const isStaffOrAdmin =
          userRecord?.role === 'admin' ||
          userRecord?.role === 'staff' ||
          userRecord?.role === 'license_admin'

        if (isStaffOrAdmin) {
          logger.log('✅ admin/staff ユーザーのためダッシュボードへリダイレクト')
          setProfileGate('leaving')
          const { data: org } = await supabase
            .from('organizations')
            .select('slug')
            .eq('id', userRecord?.organization_id)
            .maybeSingle()
          const dest = org?.slug ? `/${org.slug}/dashboard` : '/dashboard'
          navigate(dest, { replace: true })
          return
        }

        const { data: rows, error } = await supabase
          .from('customers')
          .select('id, name, phone, email')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(1)

        if (cancelled) return

        if (error) {
          logger.error('プロフィールゲート: 顧客取得エラー:', error)
          setProfileGate('form')
          return
        }

        const customer = rows?.[0] ?? null
        if (isCustomerProfileComplete(customer, userEmail)) {
          logger.log('✅ プロフィール済みのため complete-profile をスキップ')
          setProfileGate('leaving')
          const nextParam = new URLSearchParams(window.location.search).get('next')
          const dest = safeRedirectAfterProfileCompletion(nextParam, '/mypage')
          navigate(dest, { replace: true })
          return
        }

        if (!customer && userEmail.trim()) {
          const { data: linkedElsewhere, error: rpcErr } = await supabase.rpc(
            'is_customer_email_linked_to_other_user',
            { p_email: userEmail.trim() }
          )
          if (cancelled) return
          if (rpcErr) {
            logger.warn('is_customer_email_linked_to_other_user RPC エラー（フォームへ）:', rpcErr)
            setProfileGate('form')
            return
          }
          if (linkedElsewhere === true) {
            logger.log('⚠️ メールは既に別アカウントの顧客として登録済み')
            setProfileGate('duplicate_account')
            return
          }
        }

        setProfileGate('form')
      } catch (err) {
        logger.error('プロフィールゲート例外:', err)
        if (!cancelled) setProfileGate('form')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [userId, userEmail, isCheckingSession, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    // バリデーション
    if (!name.trim()) {
      setError('お名前を入力してください')
      return
    }
    
    if (!phone.trim()) {
      setError('電話番号を入力してください')
      return
    }
    
    const phoneDigits = phone.replace(/[-\s]/g, '')
    if (!/^\d{10,11}$/.test(phoneDigits)) {
      setError('電話番号は10〜11桁で入力してください')
      return
    }
    if (!prefecture) {
      setError('お住まいの都道府県を選択してください')
      return
    }
    if (!birthDate) {
      setError('生年月日を入力してください')
      return
    }
    // YYYY/MM/DD 形式のバリデーション
    const birthDateMatch = birthDate.match(/^(\d{4})\/(\d{2})\/(\d{2})$/)
    if (!birthDateMatch) {
      setError('生年月日は YYYY/MM/DD 形式で入力してください（例: 1990/01/15）')
      return
    }
    const [, year, month, day] = birthDateMatch
    const birthDateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
    // 有効な日付かチェック（例: 2/30 は無効）
    if (
      birthDateObj.getFullYear() !== parseInt(year) ||
      birthDateObj.getMonth() !== parseInt(month) - 1 ||
      birthDateObj.getDate() !== parseInt(day)
    ) {
      setError('有効な日付を入力してください')
      return
    }
    // 未来日チェック
    if (birthDateObj >= new Date()) {
      setError('生年月日に未来の日付は設定できません')
      return
    }
    // DB保存用に YYYY-MM-DD 形式に変換
    const birthDateForDB = `${year}-${month}-${day}`

    if (!userEmail.trim()) {
      setError('メールアドレスが取得できませんでした。別のログイン方法をお試しください。')
      return
    }
    
    if (!acceptTerms) {
      setError('利用規約とプライバシーポリシーに同意してください')
      return
    }

    // メールサインアップ（確認メール）ではパスワード設定が必要
    if (!isOAuthUser) {
      if (password.length < 6) {
        setError('パスワードは6文字以上で入力してください')
        return
      }
      
      if (password !== confirmPassword) {
        setError('パスワードが一致しません')
        return
      }
    }
    
    setIsLoading(true)
    
    try {
      // ⚠️ P1-20: validateRedirectUrl 相当 + 規約ページ等への戻りを防ぐ
      const nextParam = new URLSearchParams(window.location.search).get('next')
      const nextUrl = safeRedirectAfterProfileCompletion(nextParam, '/')

      // 1. パスワードを設定（メールサインアップのみ）
      if (!isOAuthUser && password) {
        const { error: updateError } = await supabase.auth.updateUser({
          password: password
        })

        if (updateError) {
          const msg = updateError.message || ''
          if (
            msg.includes('different from the old password') ||
            // OTPセッション（マジックリンク）では updateUser({ password }) が 422 を返すことがある。
            // セッションは有効なままなのでプロフィール保存は続行し、パスワードはスキップする。
            updateError.status === 422
          ) {
            logger.log('✅ パスワード設定スキップ（既設定 or OTPセッション制限）:', msg)
          } else {
            throw updateError
          }
        } else {
          logger.log('✅ パスワード設定完了')
        }
      }
      
      // 2. usersテーブルにレコードを作成/更新
      const { data: existingUser } = await supabase
        .from('users')
        .select('role, organization_id')
        .eq('id', userId)
        .maybeSingle()

      // CompleteProfile は顧客向け。既に staff/admin 等が設定済みなら維持、それ以外は customer に固定。
      const role =
        existingUser?.role === 'admin' ||
        existingUser?.role === 'staff' ||
        existingUser?.role === 'license_admin'
          ? existingUser.role
          : 'customer'

      let organizationId = existingUser?.organization_id ?? null
      if (!organizationId) {
        // 1. 現在のURLパスからスラッグを取得（/complete-profile は adminPaths なので null になる）
        const slug = getOrganizationSlugFromPath()
        if (slug) {
          const org = await getOrganizationBySlug(slug)
          organizationId = org?.id ?? null
        }
      }
      if (!organizationId) {
        // 2. next クエリパラメータからスラッグを取得（例: ?next=/queens-waltz/booking/...）
        const nextParam = new URLSearchParams(window.location.search).get('next')
        const nextSlug = nextParam?.match(/^\/([^/?#]+)/)?.[1]
        if (nextSlug) {
          const org = await getOrganizationBySlug(nextSlug)
          organizationId = org?.id ?? null
        }
      }
      if (!organizationId) {
        // 3. どうしても特定できない場合はデフォルト組織（Queens Waltz）を使用
        logger.warn('CompleteProfile: org_id が特定できません（URLにorgスラッグがありません）')
        organizationId = QUEENS_WALTZ_ORG_ID
      }
      const { error: usersUpsertError } = await supabase
        .from('users')
        .upsert({
          id: userId,
          email: userEmail,
          role: role,
          organization_id: organizationId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' })
      
      if (usersUpsertError) {
        logger.warn('⚠️ usersテーブル更新エラー（続行）:', usersUpsertError)
        // usersテーブルのエラーは致命的ではない（handle_new_userトリガーで作成済みの場合がある）
        // ただし organization_id の設定が重要なので、個別にUPDATEを試行
        const { error: updateOrgErr } = await supabase
          .from('users')
          .update({ 
            organization_id: organizationId,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId)
        
        if (updateOrgErr) {
          logger.warn('⚠️ organization_id更新もエラー:', updateOrgErr)
        } else {
          logger.log('✅ organization_id個別更新成功')
        }
      } else {
        logger.log('✅ usersテーブル更新完了')
      }
      
      // 3. customersテーブルにレコードを作成/更新
      // user_id で自分のレコードを検索（重複レコードがあっても最初のものを使う）
      const { data: existingRows } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
      const existingByUserId = existingRows?.[0] ?? null

      // メールアドレスで既存顧客を検索（自分以外で同じメールアドレスの顧客）
      // クーポン不正取得防止：同じメールで登録済みならクーポン付与しない
      const { data: existingByEmail } = await supabase
        .from('customers')
        .select('id, user_id')
        .eq('email', userEmail)
        .neq('user_id', userId) // 自分以外
        .maybeSingle()

      // 同じメールの既存顧客をログ
      // NOTE: 電話番号での重複チェックは廃止（真正性を確認できないため、他人の番号を使われる可能性がある）
      if (existingByEmail) {
        logger.log('⚠️ 同じメールの既存顧客が見つかりました:', userEmail)
      }

      const notificationSettings = {
        email_notifications: true,
        reminder_notifications: true,
        campaign_notifications: acceptNewsletter
      }

      // customers.organization_id は platform customer (role='customer') では NULL に固定する。
      // 予約は org をまたいで可能なので、customer 行は組織非依存にする必要がある。
      // staff/admin が自分用に customer 行を作る場合は所属組織に紐付ける。
      const customerOrganizationId = role === 'customer' ? null : organizationId

      const customerProfilePayload = {
        name: name.trim(),
        nickname: nickname.trim() || null,
        email: userEmail,
        phone: phone.trim(),
        prefecture: prefecture,
        birth_date: birthDateForDB,
        organization_id: customerOrganizationId,
        notification_settings: notificationSettings,
        updated_at: new Date().toISOString()
      }

      // 新規登録かどうかを判定（クーポンページ遷移の判断に使用）
      // メールアドレスで既存顧客が見つかった場合は新規扱いしない
      let isNewCustomer = false
      const hasExistingCustomer = !!existingByEmail

      if (existingByUserId) {
        // 自分のレコードがある → UPDATE（既存ユーザー）
        const { error: updateCustErr } = await supabase
          .from('customers')
          .update(customerProfilePayload)
          .eq('id', existingByUserId.id)
          .eq('user_id', userId)

        if (updateCustErr) {
          throw updateCustErr
        }
        logger.log('✅ 既存の顧客レコードを更新しました')
        isNewCustomer = false
      } else {
        // 新規 → INSERT
        const { error: insertCustErr } = await supabase
          .from('customers')
          .insert({
            user_id: userId,
            name: name.trim(),
            nickname: nickname.trim() || null,
            email: userEmail,
            phone: phone.trim(),
            prefecture: prefecture,
            birth_date: birthDateForDB,
            organization_id: customerOrganizationId,
            notification_settings: notificationSettings,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })

        if (insertCustErr) {
          // 一意制約違反: メールは別アカウント／店舗登録済み等。RLS では衝突行が見えないことがある
          if (insertCustErr.code === '23505') {
            logger.warn('⚠️ customers INSERT unique 違反:', maskEmail(userEmail), insertCustErr.message)
            const { data: byEmail } = await supabase
              .from('customers')
              .select('id, user_id')
              .eq('email', userEmail)
              .maybeSingle()

            if (byEmail && !byEmail.user_id) {
              const { error: linkErr } = await supabase
                .from('customers')
                .update({
                  user_id: userId,
                  ...customerProfilePayload
                })
                .eq('id', byEmail.id)
                .is('user_id', null)

              if (linkErr) {
                throw linkErr
              }
              logger.log('✅ 既存メール顧客にuser_idを紐付けました')
              isNewCustomer = false
            } else if (byEmail?.user_id === userId) {
              // 同時送信などで INSERT は失敗したが、自分の行は既にある
              const { error: raceUpdErr } = await supabase
                .from('customers')
                .update(customerProfilePayload)
                .eq('id', byEmail.id)
                .eq('user_id', userId)
              if (raceUpdErr) {
                throw raceUpdErr
              }
              logger.log('✅ 重複INSERT後に既存行を更新（競合解消）')
              isNewCustomer = false
            } else if (byEmail?.user_id && byEmail.user_id !== userId) {
              throw new Error(
                'このメールアドレスは既に別のアカウントで登録されています。' +
                  'そのメールでログインするか、別のメールアドレスをお使いください。'
              )
            } else {
              // byEmail が取れない: 他ユーザーの行は RLS で非表示。メールなしの二重顧客を作ると検証・連携が壊れるため禁止
              const { data: myRows } = await supabase
                .from('customers')
                .select('id')
                .eq('user_id', userId)
                .order('updated_at', { ascending: false })
                .limit(1)

              if (myRows && myRows.length > 0) {
                const { error: raceUpdErr } = await supabase
                  .from('customers')
                  .update(customerProfilePayload)
                  .eq('id', myRows[0].id)
                  .eq('user_id', userId)
                if (raceUpdErr) {
                  if (raceUpdErr.code === '23505') {
                    throw new Error(
                      'このメールアドレスは既に登録に使用されています。ログインをお試しください。'
                    )
                  }
                  throw raceUpdErr
                }
                logger.log('✅ unique 違反後に自分の行を更新（RLS で衝突行非表示のケース）')
                isNewCustomer = false
              } else {
                throw new Error(
                  'このメールアドレスは既に登録に使用されています（別アカウントの可能性があります）。' +
                    'ログインをお試しください。解決しない場合はお問い合わせください。'
                )
              }
            }
          } else {
            throw insertCustErr
          }
        } else {
          logger.log('✅ 新規顧客レコードを作成しました')
          // メールまたは電話で既存顧客が見つかっている場合はクーポン付与対象外
          isNewCustomer = !hasExistingCustomer
        }
      }
      
      logger.log('✅ customersテーブル作成/更新完了')
      
      // 保存結果を検証（RLSで静かにブロックされるケースを検出）
      // maybeSingle は同一 user_id が複数あると PostgREST がエラーを返すため limit(1) で最新行を使う
      const { data: verifyRows, error: verifyErr } = await supabase
        .from('customers')
        .select('id, name, phone, email, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)

      const verify = verifyRows?.[0]

      if (verifyErr) {
        logger.warn('⚠️ 保存検証クエリエラー:', verifyErr.message, verifyErr)
      } else if (!verify) {
        logger.error('❌ 顧客レコードが見つかりません（RLSブロックの可能性）')
        throw new Error('プロフィールの保存に失敗しました。もう一度お試しください。')
      } else {
        const savedOk = Boolean(verify.name) && Boolean(verify.phone)
        if (!savedOk) {
          logger.error('❌ 保存データが不完全:', {
            customerId: verify.id,
            hasName: Boolean(verify.name),
            hasPhone: Boolean(verify.phone),
            hasEmail: Boolean(verify.email),
          })
          throw new Error('プロフィールの保存が不完全です。もう一度お試しください。')
        }
        logger.log('✅ 保存検証OK:', { name: verify.name, phone: verify.phone, email: verify.email })
        
        // 新規顧客の場合、クーポンを付与
        if (isNewCustomer && verify.id) {
          try {
            const couponResult = await grantRegistrationCoupon(
              verify.id,
              organizationId
            )
            if (couponResult.granted > 0) {
              logger.log(`✅ クーポン ${couponResult.granted} 枚付与`)
            } else if (couponResult.skipped) {
              logger.log(`⚠️ クーポン付与スキップ: ${couponResult.reason}`)
              // キャンペーンなし等の場合はクーポンページに遷移しない
              isNewCustomer = false
            }
          } catch (couponErr) {
            logger.error('クーポン付与エラー:', couponErr)
            // クーポン付与失敗でも登録は成功として続行
          }
        }
      }
      
      setSuccess(true)
      
      // 2秒後にリダイレクト
      setTimeout(() => {
        if (isNewCustomer) {
          // 新規登録者はクーポンプレゼントページへ
          const couponUrl = `/coupon-present?next=${encodeURIComponent(nextUrl)}`
          navigate(couponUrl, { replace: true })
        } else {
          // 既存ユーザーは直接遷移先へ
          navigate(nextUrl, { replace: true })
        }
      }, 2000)
      
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'エラーが発生しました'
      setError('登録に失敗しました: ' + errorMessage)
      logger.error('Complete profile error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <SuccessScreen navigate={navigate} />
    )
  }

  if (isCheckingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">認証情報を確認中...</p>
        </div>
      </div>
    )
  }

  if (!userId) {
    return (
      <ReopenLinkScreen
        resendEmailInput={resendEmailInput}
        setResendEmailInput={setResendEmailInput}
        resendMessage={resendMessage}
        setResendMessage={setResendMessage}
        resendError={resendError}
        setResendError={setResendError}
        resendLoading={resendLoading}
        setResendLoading={setResendLoading}
        navigate={navigate}
      />
    )
  }

  if (profileGate === 'resolving' || profileGate === 'leaving') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">アカウント情報を確認しています...</p>
        </div>
      </div>
    )
  }

  if (profileGate === 'duplicate_account') {
    return (
      <DuplicateAccountScreen userEmail={userEmail} navigate={navigate} />
    )
  }

  return (
    <ProfileForm
      userEmail={userEmail}
      handleSubmit={handleSubmit}
      name={name}
      setName={setName}
      nickname={nickname}
      setNickname={setNickname}
      phone={phone}
      setPhone={setPhone}
      prefecture={prefecture}
      setPrefecture={setPrefecture}
      birthDate={birthDate}
      setBirthDate={setBirthDate}
      isOAuthUser={isOAuthUser}
      showPassword={showPassword}
      setShowPassword={setShowPassword}
      password={password}
      setPassword={setPassword}
      confirmPassword={confirmPassword}
      setConfirmPassword={setConfirmPassword}
      acceptTerms={acceptTerms}
      setAcceptTerms={setAcceptTerms}
      acceptNewsletter={acceptNewsletter}
      setAcceptNewsletter={setAcceptNewsletter}
      error={error}
      isLoading={isLoading}
    />
  )
}
