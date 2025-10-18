import os
from supabase import create_client, Client
from dotenv import load_dotenv

# 環境変数の読み込み
load_dotenv('.env.local')
load_dotenv()

# Supabaseクライアントの初期化
supabase: Client = create_client(
    os.getenv("VITE_SUPABASE_URL"),
    os.getenv("VITE_SUPABASE_ANON_KEY")
)

# 2025年11月のデータを削除
print("2025年11月のスケジュールデータを削除します...")

try:
    # 2025年11月1日〜11月30日のデータを削除
    result = supabase.table('schedule_events').delete().gte('date', '2025-11-01').lte('date', '2025-11-30').execute()
    
    print(f"✓ 削除完了")
    
except Exception as e:
    print(f"✗ 削除失敗: {str(e)}")

