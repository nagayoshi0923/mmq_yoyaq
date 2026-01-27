/**
 * 在庫整合性チェック Edge Function
 * 
 * 日次で実行され、schedule_events.current_participants と
 * 実際の予約数を比較し、不整合があれば自動修正してDiscordに通知する。
 * 
 * 🔒 認証: Service Role Key または 管理者のみ呼び出し可能
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, verifyAuth, errorResponse, sanitizeErrorMessage } from '../_shared/security.ts'

/**
 * Service Role Key での呼び出しか確認（Cron用）
 */
function isServiceRoleCall(req: Request): boolean {
  const authHeader = req.headers.get('Authorization')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  
  if (!authHeader || !serviceRoleKey) return false
  
  // Service Role Key の先頭20文字で簡易チェック
  const token = authHeader.replace('Bearer ', '')
  return token === serviceRoleKey
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 🔒 認証チェック: Service Role Key または 管理者のみ
    if (!isServiceRoleCall(req)) {
      const authResult = await verifyAuth(req, ['admin', 'owner'])
      if (!authResult.success) {
        console.warn('⚠️ 認証失敗: check-inventory-consistency への不正アクセス試行')
        return errorResponse(
          authResult.error || '認証が必要です',
          authResult.statusCode || 401,
          corsHeaders
        )
      }
      console.log('✅ 管理者認証成功:', authResult.user?.email)
    } else {
      console.log('✅ Service Role Key 認証成功（Cron/システム呼び出し）')
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log('🔍 Starting inventory consistency check...')

    // 整合性チェックを実行
    const { data, error } = await serviceClient.rpc('run_inventory_consistency_check')

    if (error) {
      console.error('❌ Error running consistency check:', error)
      throw new Error(`整合性チェックに失敗しました: ${error.message}`)
    }

    console.log('✅ Consistency check completed:', data)

    // 不整合が見つかった場合、Discordに通知
    if (data.inconsistencies_found > 0) {
      await sendDiscordNotification(data)
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        ...data
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('❌ Error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        // 🔒 セキュリティ: 技術的詳細をサニタイズ
        error: sanitizeErrorMessage(error, '在庫整合性チェックに失敗しました')
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})

/**
 * Discordに通知を送信
 */
async function sendDiscordNotification(checkResult: any) {
  const discordWebhookUrl = Deno.env.get('DISCORD_WEBHOOK_URL')
  
  if (!discordWebhookUrl) {
    console.warn('⚠️ DISCORD_WEBHOOK_URL is not set. Skipping Discord notification.')
    return
  }

  const details = checkResult.details || []
  
  // Embedを構築
  const embed: any = {
    title: '🔍 在庫整合性チェック結果',
    color: checkResult.inconsistencies_found > 0 ? 0xf59e0b : 0x10b981, // オレンジ or 緑
    fields: [
      {
        name: '📊 チェック対象',
        value: `${checkResult.total_checked} イベント`,
        inline: true
      },
      {
        name: '⚠️ 不整合検出',
        value: `${checkResult.inconsistencies_found} イベント`,
        inline: true
      },
      {
        name: '🔧 自動修正',
        value: `${checkResult.auto_fixed} イベント`,
        inline: true
      },
      {
        name: '⏱️ 実行時間',
        value: `${checkResult.execution_time_ms}ms`,
        inline: true
      }
    ],
    timestamp: new Date().toISOString()
  }
  
  if (details.length > 0) {
    const detailsText = details.slice(0, 5).map((detail: any) => {
      const diff = detail.difference > 0 ? `+${detail.difference}` : detail.difference
      return `**${detail.scenario_title}** (${detail.store_name})\n` +
             `日時: ${detail.date} ${detail.start_time}\n` +
             `保存値: ${detail.stored_count} → 実際: ${detail.actual_count} (差分: ${diff})`
    }).join('\n\n')
    
    embed.fields.push({
      name: '📝 不整合の詳細',
      value: detailsText + (details.length > 5 ? `\n\n... 他 ${details.length - 5} 件の不整合` : ''),
      inline: false
    })
  }

  try {
    const response = await fetch(discordWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'MMQ在庫管理Bot',
        avatar_url: 'https://cdn.discordapp.com/embed/avatars/0.png',
        embeds: [embed]
      }),
    })

    if (!response.ok) {
      console.error('❌ Discord notification failed:', await response.text())
    } else {
      console.log('✅ Discord notification sent')
    }
  } catch (error) {
    console.error('❌ Error sending Discord notification:', error)
  }
}

