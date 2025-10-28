// Supabase Edge Function: シフトをGoogleスプレッドシートに同期
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SyncShiftsPayload {
  year: number
  month: number
  staff_id?: string
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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 環境変数を取得
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const GOOGLE_APPS_SCRIPT_URL = Deno.env.get('GOOGLE_APPS_SCRIPT_URL')
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GOOGLE_APPS_SCRIPT_URL) {
      throw new Error('Required environment variables are not set')
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const payload: SyncShiftsPayload = await req.json()
    const { year, month, staff_id } = payload

    console.log('📊 シフト同期開始:', { year, month, staff_id })
    console.log('📊 環境変数チェック:', {
      has_supabase_url: !!SUPABASE_URL,
      has_service_key: !!SUPABASE_SERVICE_ROLE_KEY,
      has_google_url: !!GOOGLE_APPS_SCRIPT_URL
    })

    if (!year || !month || month < 1 || month > 12) {
      throw new Error('Invalid year or month')
    }

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0)

    const startDateStr = `${year}-${String(month).padStart(2, '0')}-01`
    const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`
    
    console.log('📅 日付範囲:', { startDateStr, endDateStr })

    // シフトデータを取得
    let query = supabase
      .from('shift_submissions')
      .select(`
        date,
        morning,
        afternoon,
        evening,
        all_day,
        staff_id
      `)
      .gte('date', startDateStr)
      .lte('date', endDateStr)
      .eq('status', 'submitted')

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

    // スタッフIDを取得してスタッフ情報を別途取得
    const staffIds = [...new Set(shifts.map(s => s.staff_id))]
    console.log('👥 スタッフID数:', staffIds.length)
    
    let staffMembers = []
    if (staffIds.length > 0) {
      const { data, error: staffError } = await supabase
        .from('staff')
        .select('id, name')
        .in('id', staffIds)

      if (staffError) {
        throw new Error(`Failed to fetch staff: ${staffError.message}`)
      }
      
      staffMembers = data || []
    }

    // スタッフIDからnameのマップを作成
    const staffNameMap = new Map(staffMembers?.map(s => [s.id, s.name]) || [])
    console.log('👥 スタッフ取得:', { staff_count: staffMembers?.length || 0 })
    console.log('👥 スタッフマップ:', Array.from(staffNameMap.entries()))

    // データを変換
    const transformedShifts: ShiftData[] = shifts.map(shift => ({
      staff_name: staffNameMap.get(shift.staff_id) || '不明',
      date: shift.date,
      morning: shift.morning || false,
      afternoon: shift.afternoon || false,
      evening: shift.evening || false,
      all_day: shift.all_day || false
    }))
    
    console.log('🔄 変換完了:', { transformed_count: transformedShifts.length })
    console.log('🔄 変換サンプル:', transformedShifts.slice(0, 2))

    // Google Apps Scriptに送信
    console.log('🚀 Google Apps Script送信開始')
    console.log('📤 送信データ:', {
      year,
      month,
      shifts_count: transformedShifts.length,
      sample_shift: transformedShifts[0]
    })
    
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

    console.log('📡 レスポンスステータス:', response.status, response.statusText)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Google Apps Scriptエラー:', errorText)
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
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    
    console.error('❌ Error:', errorMessage)
    console.error('❌ Error stack:', errorStack)
    console.error('❌ Error details:', {
      message: errorMessage,
      name: error instanceof Error ? error.name : 'Unknown',
      cause: error instanceof Error ? error.cause : undefined
    })
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage,
        stack: errorStack,
        details: {
          name: error instanceof Error ? error.name : 'Error',
          cause: error instanceof Error ? error.cause : undefined
        }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
