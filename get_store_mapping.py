import os
from supabase import create_client, Client
from dotenv import load_dotenv
import json

# 環境変数の読み込み
load_dotenv('.env.local')
load_dotenv()

# Supabaseクライアントの初期化
supabase: Client = create_client(
    os.getenv("VITE_SUPABASE_URL"),
    os.getenv("VITE_SUPABASE_ANON_KEY")
)

# stores テーブルから店舗情報を取得
print("店舗マッピングを取得中...")

try:
    result = supabase.table('stores').select('id, name, short_name').execute()
    
    stores = result.data
    
    print("\n店舗一覧:")
    print("=" * 60)
    
    mapping = {}
    for store in stores:
        print(f"ID: {store['id']}")
        print(f"  名前: {store['name']}")
        print(f"  短縮名: {store['short_name']}")
        print()
        
        # 短縮名をキーにしたマッピング
        mapping[store['short_name']] = store['id']
    
    print("=" * 60)
    print("\nPythonの辞書形式:")
    print(json.dumps(mapping, ensure_ascii=False, indent=2))
    
except Exception as e:
    print(f"エラー: {str(e)}")

