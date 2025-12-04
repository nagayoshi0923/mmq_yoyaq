import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('❌ 環境変数が設定されていません');
  console.error('以下のように実行してください:');
  console.error('SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/set-passwords-batch2.mjs');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// 対象ユーザー
const targetEmails = [
  'ariiw.z@gmail.com',      // りえぞー
  'shinpipipi.9@gmail.com', // キュウ
  'ponchan.qw@gmail.com',   // ぽんちゃん
];

const newPassword = '222222';

async function setPasswords() {
  console.log('🔐 パスワード設定を開始します...\n');
  
  for (const email of targetEmails) {
    try {
      // ユーザーを検索
      const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
      
      if (listError) {
        console.error(`❌ ユーザー一覧取得エラー:`, listError.message);
        continue;
      }
      
      const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
      
      if (!user) {
        console.log(`⚠️ ${email} - ユーザーが見つかりません`);
        continue;
      }
      
      // パスワードを更新
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        user.id,
        { 
          password: newPassword,
          email_confirm: true  // メール確認済みにする
        }
      );
      
      if (updateError) {
        console.error(`❌ ${email} - パスワード設定失敗:`, updateError.message);
      } else {
        console.log(`✅ ${email} - パスワードを「${newPassword}」に設定しました`);
      }
      
    } catch (err) {
      console.error(`❌ ${email} - エラー:`, err.message);
    }
  }
  
  console.log('\n🏁 完了しました');
}

setPasswords();

