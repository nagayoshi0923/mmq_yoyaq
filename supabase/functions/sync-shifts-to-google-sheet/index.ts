// Supabase Edge Function: シフトをGoogleスプレッドシートに同期
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GOOGLE_APPS_SCRIPT_URL = Deno.env.get('GOOGLE_APPS_SCRIPT_URL')! // Webアプリとして公開したURL

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SyncShiftsPayload {
  year: number
  month: number
  staff_id?: string // オプション: 特定のスタッフのみ同期
}

interface ShiftData {
  staff_name: string
  date: string
  morning: boolean
  afternoon: boolean
  evening: boolean
  all_day: boolean
}

serve(async (req) => {
  // CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 環境変数チェック
    if (!GOOGLE_APPS_SCRIPT_URL) {
      throw new Error('GOOGLE_APPS_SCRIPT_URL is not set')
    }

    const payload: SyncShiftsPayload = await req.json()
    const { year, month, staff_id } = payload

    console.log('📊 シフト同期開始:', { year, month, staff_id })

    // 年月のバリデーション
    if (!year || !month || month < 1 || month > 12) {
      throw new Error('Invalid year or month')
    }

    // 月の開始日と終了日を計算
    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0)

    // 日付文字列に変換（YYYY-MM-DD）
    const startDateStr = `${year}-${String(month).padStart(2, '0')}-01`
    const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`

    // シフトデータを取得
    let query = supabase
      .from('staff_shifts')
      .select(`
        date,
        morning,
        afternoon,
        evening,
        all_day,
        staff:staff_id (
          name
        )
      `)
      .gte('date', startDateStr)
      .lte('date', endDateStr)
      .eq('status', 'submitted')

    // 特定のスタッフのみフィルター
    if (staff_id) {
      query = query.eq('staff_id', staff_id)
    }

    const { data: shifts, error: shiftsError } = await query

    if (shiftsError) {
      throw new Error(`Failed to fetch shifts: ${shiftsError.message}`)
    }

    console.log(`📋 取得したシフト: ${shifts?.length || 0}件`)

    if (!shifts || shifts.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No shifts found',
          synced_count: 0
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // データを変換
    const transformedShifts: ShiftData[] = shifts.map(shift => ({
      staff_name: (shift.staff as any)?.name || '不明',
      date: shift.date,
      morning: shift.morning || false,
      afternoon: shift.afternoon || false,
      evening: shift.evening || false,
      all_day: shift.all_day || false
    }))

    // Google Apps Scriptに送信
    const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        year,
        month,
        shifts: transformedShifts
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Google Apps Script error: ${response.status} - ${errorText}`)
    }

    const result = await response.json()
    console.log('✅ シフト同期成功:', result)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Shifts synced to Google Sheets',
        synced_count: transformedShifts.length,
        result
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Error:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

