import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type AuthUser } from '@/lib/supabase'
import { authTrace, logger } from '@/utils/logger'
import { determineUserRole } from '@/utils/authUtils'
import { maskEmail } from '@/utils/security'
import { lookupStaffRole, logAuthEvent } from './authContextHelpers'

/**
 * Supabase セッションのユーザーからロールを解決し、staff/customer の紐付けと
 * ユーザー情報の確定（setUser）までを行う。元々 AuthContext 内の
 * setUserFromSession にあったロジックを切り出したもの。
 * 共有状態（refs / state setter / staffCache）は deps として受け取り、
 * 挙動は AuthContext 内にあった頃と不変。
 */
export interface ResolveUserDeps {
  isProcessingRef: MutableRefObject<boolean>
  userRef: MutableRefObject<AuthUser | null>
  staffCache: Map<string, string>
  setStaffCache: Dispatch<SetStateAction<Map<string, string>>>
  setUser: Dispatch<SetStateAction<AuthUser | null>>
}

export async function resolveUserFromSession(
  supabaseUser: User,
  deps: ResolveUserDeps
): Promise<void> {
  const { isProcessingRef, userRef, staffCache, setStaffCache, setUser } = deps
    // 既に処理中の場合はスキップ（重複呼び出し防止）
    // ただし、userがまだセットされていない場合は処理を続行する（初期化時の競合対策）
    if (isProcessingRef.current && userRef.current) {
      authTrace('⏭️ 処理中のためスキップ:', maskEmail(supabaseUser.email))
      return
    }
    
    const startTime = performance.now()
    isProcessingRef.current = true
    authTrace('🔐 ユーザーセッション設定開始:', maskEmail(supabaseUser.email))
    authTrace(`⏱️ setUserFromSession 開始: ${maskEmail(supabaseUser.email)} (${new Date().toISOString()})`)
    
    // 既存のユーザー情報を保持（エラー時のフォールバック用）
    // useStateのクロージャー問題を回避するため、refから取得
    const existingUser = userRef.current
    
    try {
      // データベースからユーザーのロールを取得
      let role: 'admin' | 'staff' | 'customer' | 'license_admin' = 'customer'
      
      authTrace('📊 usersテーブルからロール取得開始')
      try {
        // 遅い場合でも長く待つとログインが重いので短めに切る（成功時は通常数百ms）
        const timeoutMs = 2000
            
            const rolePromise = supabase
              .from('users')
              .select('role')
              .eq('id', supabaseUser.id)
              .maybeSingle()

            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('ロール取得タイムアウト')), timeoutMs)
            )

            const result = await Promise.race([
              rolePromise,
              timeoutPromise
            ]) as { data: { role: string } | null; error: Error | null } | undefined
            
            // Supabaseのレスポンス形式を確認
            if (result && (result.data !== undefined || result.error !== undefined)) {
          const userData = result.data
          const roleError = result.error
              
              // エラーがある場合は詳細をログに記録
              if (result.error) {
                logger.warn('⚠️ ロール取得エラー:', result.error)
                // RLSポリシーエラーの場合は特別に処理
                if (result.error.message?.includes('permission') || result.error.message?.includes('RLS')) {
                  logger.warn('⚠️ RLSポリシーエラーの可能性があります。データベースのRLSポリシーを確認してください。')
                }
              }
              
          if (userData?.role) {
          role = userData.role as 'admin' | 'staff' | 'customer' | 'license_admin'
          authTrace('✅ データベースからロール取得:', role)
          } else if (roleError) {
            throw roleError
          }
        }
      } catch (error: any) {
        logger.warn('⚠️ ロール取得失敗（タイムアウト/エラー）:', error?.message || error)
        
        // レコードが存在しない場合のみ、作成する（既存のロールを上書きしない）
        if (error?.code === 'PGRST116') {
          authTrace('📝 usersテーブルにレコードが存在しないため、作成します')
          
          // 🔴 重要: スタッフテーブルにメールアドレスが存在するか確認
          // 招待済みスタッフが自己登録した場合も、スタッフとして紐付ける
          let newRole = determineUserRole(supabaseUser.email)
          
          try {
            // まずuser_idで検索（既に紐付けられている場合）
            const { data: staffByUserId } = await supabase
              .from('staff')
              .select('id')
              .eq('user_id', supabaseUser.id)
              .maybeSingle()
            
            if (staffByUserId) {
              newRole = 'staff'
              authTrace('✅ スタッフテーブルにuser_id紐付けあり: staffロールを設定')
            } else {
              // user_idで見つからない場合、メールアドレスで検索
              // （招待済みだが自己登録したケース、または招待期限切れ後の自己登録）
              const { data: staffByEmail } = await supabase
                .from('staff')
                .select('id, user_id, name')
                .eq('email', supabaseUser.email)
                .maybeSingle()
              
              if (staffByEmail) {
                authTrace('✅ スタッフテーブルにメールアドレス一致あり:', staffByEmail.name)
                
                // staffテーブルのuser_idを確認
                if (!staffByEmail.user_id) {
                  // user_idがnullの場合のみ紐付ける
                  newRole = 'staff'
                  const { error: updateError } = await supabase
                    .from('staff')
                    .update({ user_id: supabaseUser.id, updated_at: new Date().toISOString() })
                    .eq('id', staffByEmail.id)
                  
                  if (updateError) {
                    logger.warn('⚠️ スタッフテーブルのuser_id更新エラー:', updateError)
                  } else {
                    authTrace('✅ スタッフテーブルにuser_idを紐付けました:', supabaseUser.id)
                  }
                } else if (staffByEmail.user_id === supabaseUser.id) {
                  // 既に同じユーザーに紐付いている場合はstaffロールを維持
                  newRole = 'staff'
                  authTrace('✅ 既に同じユーザーに紐付け済み')
                } else {
                  // 既に別のユーザーに紐付いている場合は上書きしない（顧客として扱う）
                  logger.warn('⚠️ スタッフレコードは既に別のユーザーに紐付いています。上書きしません。user_id:', staffByEmail.user_id)
                }
              }
            }
          } catch (staffErr) {
            logger.warn('⚠️ スタッフテーブル確認エラー:', staffErr)
          }
          
          // usersテーブルにレコードを作成（insertで新規のみ、upsertしない）
          const { error: insertError } = await supabase
            .from('users')
            .insert({
              id: supabaseUser.id,
              email: supabaseUser.email!,
              role: newRole,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
          
          if (insertError) {
            // 重複エラーの場合は既存レコードがあるので、再取得を試みる
            if (insertError.code === '23505') {
              authTrace('📋 既存レコードあり、再取得を試みます')
              const { data: retryData } = await supabase
                .from('users')
                .select('role')
                .eq('id', supabaseUser.id)
                .single()
          
              if (retryData?.role) {
                role = retryData.role as 'admin' | 'staff' | 'customer' | 'license_admin'
                authTrace('✅ 既存ロールを取得:', role)
              } else {
                role = newRole
              }
            } else {
              logger.warn('⚠️ usersテーブルへのレコード作成に失敗しました:', insertError)
            role = newRole // フォールバックとして使用
            }
          } else {
            role = newRole
            authTrace('✅ usersテーブルにレコードを作成しました:', role)
          }
        } else if (error?.message?.includes('ロール取得タイムアウト')) {
          // タイムアウトの場合: 既存のロールを保持、なければスタッフチェック
          if (existingUser && existingUser.id === supabaseUser.id) {
            role = existingUser.role
            authTrace('🔄 タイムアウト: 既存のロールを保持:', role)
          } else {
            role = (await lookupStaffRole(supabaseUser.id, supabaseUser.email)) ?? 'customer'
            authTrace('🔄 タイムアウトフォールバック: staffテーブル検索結果 ->', role)
          }
        } else {
          // その他のエラー: 既存のユーザー情報があればそのロールを保持
          if (existingUser && existingUser.id === supabaseUser.id && existingUser.role !== 'customer') {
            role = existingUser.role
            authTrace('🔄 例外発生、既存のロールを保持:', role)
          } else {
            role = (await lookupStaffRole(supabaseUser.id, supabaseUser.email)) ?? 'customer'
            authTrace('🔄 例外フォールバック: staffテーブル検索結果 ->', role)
          }
        }
      }

      // ユーザー名を生成（メールアドレスから@より前の部分を使用、またはメタデータから取得）
      const displayName = supabaseUser.user_metadata?.full_name || 
                         supabaseUser.user_metadata?.name ||
                         supabaseUser.email?.split('@')[0] ||
                         'ユーザー'

      // スタッフ情報は遅延ロード（認証処理をブロックしない）
      let staffName: string | undefined
      let customerName: string | undefined
      
      // キャッシュから確認のみ（既に取得済みの場合のみ使用）
      const cachedName = staffCache.get(supabaseUser.id)
      if (cachedName) {
        staffName = cachedName
        authTrace('📋 ⚡ キャッシュからスタッフ名取得:', staffName)
      } else if (role === 'customer') {
        // 顧客の場合、customersテーブルから名前を取得（バックグラウンド）
        authTrace('📋 顧客情報をバックグラウンドで取得開始')
        ;(async () => {
          try {
            const { data } = await supabase
              .from('customers')
              .select('name, nickname')
              .eq('user_id', supabaseUser.id)
              .maybeSingle()
            
            if (data) {
              // ニックネーム優先、なければ名前
              const name = data.nickname || data.name
              if (name) {
                authTrace('📋 ✅ バックグラウンドで顧客名取得成功:', name)
                // ユーザー情報も更新してヘッダーに反映
                setUser(prev => prev ? { ...prev, customerName: name, name: name } : prev)
              }
            } else {
              // user_idで見つからない場合、メールアドレスで検索して自動紐付け
              // 🚨 重要: user_idがnullのレコードのみを対象にする（他ユーザーと紐付き済みのレコードは除外）
              const { data: customerByEmail } = await supabase
                .from('customers')
                .select('id, name, nickname, user_id')
                .eq('email', supabaseUser.email)
                .is('user_id', null)  // まだ紐付けされていないレコードのみ
                .maybeSingle()
              
              if (customerByEmail) {
                const name = customerByEmail.nickname || customerByEmail.name
                if (name) {
                  authTrace('📋 🔗 メールアドレスで顧客発見、自動紐付け:', name)
                  // user_idを設定して紐付け
                  const { error: updateError } = await supabase
                    .from('customers')
                    .update({ user_id: supabaseUser.id })
                    .eq('id', customerByEmail.id)
                  
                  if (!updateError) {
                    authTrace('📋 ✅ 顧客自動紐付け成功:', name)
                    setUser(prev => prev ? { ...prev, customerName: name, name: name } : prev)
                  } else {
                    logger.warn('📋 ⚠️ 顧客紐付けエラー:', updateError)
                    // エラーでも名前は表示する
                    setUser(prev => prev ? { ...prev, customerName: name, name: name } : prev)
                  }
                }
              }
            }
          } catch (error) {
            authTrace('📋 顧客情報の取得エラー（バックグラウンド）:', error)
          }
        })()
      } else {
        // バックグラウンドで非同期取得（認証完了を待たない）
        if (role === 'staff' || role === 'admin') {
          authTrace('📋 スタッフ情報をバックグラウンドで取得開始')
          // 非同期で取得（await しない）
          const staffPromise = supabase
            .from('staff')
            .select('id, name, user_id')
            .eq('user_id', supabaseUser.id)
            .maybeSingle()
          
          Promise.resolve(staffPromise).then(async ({ data }) => {
              if (data?.name) {
                setStaffCache(prev => new Map(prev.set(supabaseUser.id, data.name)))
                authTrace('📋 ✅ バックグラウンドでスタッフ名取得成功:', data.name)
                // ユーザー情報も更新してヘッダーに反映
                setUser(prev => prev ? { ...prev, staffName: data.name } : prev)
              } else {
                // user_idで見つからない場合、メールアドレスで検索して自動紐付け
                authTrace('📋 user_idで見つからないため、メールアドレスで検索:', maskEmail(supabaseUser.email))
                const { data: staffByEmail } = await supabase
                  .from('staff')
                  .select('id, name, user_id')
                  .eq('email', supabaseUser.email)
                  .is('user_id', null)
                  .maybeSingle()
                
                if (staffByEmail) {
                  authTrace('📋 🔗 メールアドレスでスタッフ発見、自動紐付け:', staffByEmail.name)
                  // user_idを設定して紐付け
                  const { error: updateError } = await supabase
                    .from('staff')
                    .update({ user_id: supabaseUser.id })
                    .eq('id', staffByEmail.id)
                  
                  if (!updateError) {
                    setStaffCache(prev => new Map(prev.set(supabaseUser.id, staffByEmail.name)))
                    authTrace('📋 ✅ スタッフ自動紐付け成功:', staffByEmail.name)
                    setUser(prev => prev ? { ...prev, staffName: staffByEmail.name } : prev)
                    
                    // usersテーブルのroleをstaffに更新（adminの場合は降格させない）
                    // 🚨 重要: usersテーブルの既存ロールを必ず確認する
                    const { data: existingUserData } = await supabase
                      .from('users')
                      .select('role')
                      .eq('id', supabaseUser.id)
                      .maybeSingle()
                    
                    if (existingUserData?.role === 'admin') {
                      authTrace('📋 ⏭️ 既存ロールがadminのため、降格をスキップ')
                    } else if (role !== 'admin') {
                      await supabase
                        .from('users')
                        .update({ role: 'staff' })
                        .eq('id', supabaseUser.id)
                      authTrace('📋 ✅ ユーザーロールをstaffに更新')
                    }
                  } else {
                    logger.warn('📋 ⚠️ スタッフ紐付けエラー:', updateError)
                  }
                }
              }
          }).catch((error) => {
              authTrace('📋 スタッフ情報の取得エラー（バックグラウンド）:', error)
            })
        }
      }

      // ロール変更を検出してログに記録
      if (existingUser && existingUser.role !== role) {
        authTrace('🔄 ロール変更検出:', { 
          old: existingUser.role, 
          new: role 
        })
        logAuthEvent('role_change', supabaseUser.id, {
          oldRole: existingUser.role,
          newRole: role,
          success: true,
        })
      }
      
      const userData = {
        id: supabaseUser.id,
        email: supabaseUser.email!,
        name: displayName,
        staffName: staffName,
        role: role
      }
      
      authTrace('✅ ユーザー情報設定完了:', { 
        email: userData.email, 
        name: userData.name, 
        staffName: userData.staffName, 
        role: userData.role 
      })
      
      setUser(userData)
      userRef.current = userData
      // ロール情報はusersテーブルから取得済み（上記のロジックで処理）
    } catch (error) {
      logger.error('❌ ユーザーセッション設定エラー:', error)
      // エラー時も既存のユーザー情報を保持（ロールを維持）
      if (existingUser && existingUser.id === supabaseUser.id) {
        authTrace('🔄 エラー発生、既存のユーザー情報を保持:', existingUser.role)
        setUser(existingUser)
        userRef.current = existingUser
      } else {
        // 既存情報がない場合のみデフォルトのcustomerロールを設定
        const displayName = supabaseUser.user_metadata?.full_name || 
                           supabaseUser.user_metadata?.name ||
                           supabaseUser.email?.split('@')[0] ||
                           'ユーザー'
        
        const fallbackUserData = {
          id: supabaseUser.id,
          email: supabaseUser.email!,
          name: displayName,
          staffName: undefined,
          role: 'customer' as const
        }
        
        authTrace('🔄 フォールバックユーザー情報設定:', fallbackUserData)
        setUser(fallbackUserData)
        userRef.current = fallbackUserData
      }
    } finally {
      const endTime = performance.now()
      isProcessingRef.current = false
      authTrace(`⏱️ setUserFromSession 完了: ${maskEmail(supabaseUser.email)} (${((endTime - startTime) / 1000).toFixed(2)}秒)`)
    }
}
