import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function getDemoCustomer() {
  console.log('デモ顧客を検索中...')
  
  // デモ顧客を検索（名前に「デモ」が含まれる顧客）
  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, name, email, phone')
    .or('name.ilike.%デモ%,email.ilike.%demo%')
  
  if (error) {
    console.error('エラー:', error)
    return
  }
  
  if (!customers || customers.length === 0) {
    console.log('デモ顧客が見つかりませんでした')
    return
  }
  
  console.log('デモ顧客:', customers)
  return customers[0]
}

getDemoCustomer()

