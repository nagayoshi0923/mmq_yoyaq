import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

// .env.localを読み込み
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.VITE_SUPABASE_URL!
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function fixParticipants() {
  console.log('current_participants > max_participants のイベントを修正します...')
  
  // シナリオ情報も含めて全イベントを取得
  const { data: events, error } = await supabase
    .from('schedule_events')
    .select('id, current_participants, max_participants, scenarios(player_count_max)')
  
  if (error) {
    console.error('取得エラー:', error)
    return
  }
  
  let fixedCount = 0
  for (const event of events || []) {
    const scenarioMax = (event.scenarios as { player_count_max?: number } | null)?.player_count_max
    const maxParticipants = scenarioMax || event.max_participants || 8
    const currentParticipants = event.current_participants || 0
    
    // current_participants が max_participants を超えている場合、max_participants に修正
    if (currentParticipants > maxParticipants) {
      console.log(`修正: イベント ${event.id}: ${currentParticipants} → ${maxParticipants}`)
      const { error: updateError } = await supabase
        .from('schedule_events')
        .update({ current_participants: maxParticipants })
        .eq('id', event.id)
      
      if (updateError) {
        console.error(`更新エラー: ${event.id}`, updateError)
      } else {
        fixedCount++
      }
    }
  }
  
  console.log(`完了: ${fixedCount}件を修正しました`)
}

fixParticipants()
