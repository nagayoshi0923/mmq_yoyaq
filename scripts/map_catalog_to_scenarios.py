#!/usr/bin/env python3
"""
クインズワルツのカタログデータとDBのシナリオをマッピング
タイトルの緩いファジーマッチングを使用
"""

import os
import json
import re
from difflib import SequenceMatcher
from supabase import create_client, Client
from dotenv import load_dotenv

# 環境変数の読み込み
load_dotenv('.env.local')
load_dotenv()

# Supabaseクライアントの初期化
def get_supabase_client():
    url = os.getenv("VITE_SUPABASE_URL")
    key = os.getenv("VITE_SUPABASE_ANON_KEY")
    if not url or not key:
        print("❌ エラー: VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を設定してください")
        return None
    return create_client(url, key)


def normalize_title(title):
    """タイトルを正規化（マッチング用）"""
    if not title:
        return ""
    
    # 英語→日本語の既知変換マップ
    en_to_ja = {
        "lost": "ロスト",
        "remembrance": "リメンブランス",
        "sorcier": "ソルシエ",
    }
    
    # 既知の英語タイトルを日本語に変換
    for en, ja in en_to_ja.items():
        title = re.sub(rf'\b{en}\b', ja, title, flags=re.IGNORECASE)
    
    # 小文字化
    title = title.lower()
    
    # 全角を半角に変換
    title = title.translate(str.maketrans({
        'ａ': 'a', 'ｂ': 'b', 'ｃ': 'c', 'ｄ': 'd', 'ｅ': 'e',
        'ｆ': 'f', 'ｇ': 'g', 'ｈ': 'h', 'ｉ': 'i', 'ｊ': 'j',
        'ｋ': 'k', 'ｌ': 'l', 'ｍ': 'm', 'ｎ': 'n', 'ｏ': 'o',
        'ｐ': 'p', 'ｑ': 'q', 'ｒ': 'r', 'ｓ': 's', 'ｔ': 't',
        'ｕ': 'u', 'ｖ': 'v', 'ｗ': 'w', 'ｘ': 'x', 'ｙ': 'y',
        'ｚ': 'z', '０': '0', '１': '1', '２': '2', '３': '3',
        '４': '4', '５': '5', '６': '6', '７': '7', '８': '8',
        '９': '9', '　': ' ', '～': '~', '−': '-', '：': ':',
    }))
    
    # 空白、記号を除去
    title = re.sub(r'[\s\-\_\.\,\!\?\'\"\`\~\:\;\/\\（）\(\)\[\]\{\}【】「」『』〈〉《》・]', '', title)
    
    # 特殊文字を除去
    title = re.sub(r'[☆★♡♥♪♫✨🎭🔍📕💀🎩📅🌀💥🇯🇵🗓️]', '', title)
    
    return title


def similarity_ratio(a, b):
    """2つの文字列の類似度を計算（0.0〜1.0）"""
    return SequenceMatcher(None, a, b).ratio()


def contains_match(a, b):
    """一方がもう一方を含むかチェック"""
    a_norm = normalize_title(a)
    b_norm = normalize_title(b)
    
    if len(a_norm) < 3 or len(b_norm) < 3:
        return False
    
    return a_norm in b_norm or b_norm in a_norm


def extract_core_title(title):
    """タイトルからコア部分を抽出（季節マーダー等の特殊処理）"""
    # 「季節のマーダーミステリー「xxx」」→ 「xxx」
    import re
    match = re.search(r'「(.+?)」', title)
    if match:
        return match.group(1)
    
    # 「季節／xxx」 → 「xxx」
    if '／' in title:
        return title.split('／')[-1]
    
    return title


def find_best_match(catalog_title, db_scenarios, threshold=0.6):
    """
    カタログタイトルに最も近いDBシナリオを見つける
    
    Args:
        catalog_title: カタログのシナリオタイトル
        db_scenarios: DBシナリオのリスト [{"id": ..., "title": ...}, ...]
        threshold: マッチと見なす最低類似度
    
    Returns:
        (best_match, similarity) or (None, 0)
    """
    catalog_norm = normalize_title(catalog_title)
    catalog_core = normalize_title(extract_core_title(catalog_title))
    
    best_match = None
    best_score = 0
    
    for scenario in db_scenarios:
        db_title = scenario.get("title", "")
        db_norm = normalize_title(db_title)
        db_core = normalize_title(extract_core_title(db_title))
        
        # 完全一致
        if catalog_norm == db_norm:
            return scenario, 1.0
        
        # コアタイトルの完全一致（季節シリーズ等）
        if catalog_core == db_core and len(catalog_core) >= 3:
            return scenario, 1.0
        
        # 含有チェック（一方がもう一方を含む）
        if contains_match(catalog_title, db_title):
            score = 0.9  # 含有は高スコア
            if score > best_score:
                best_score = score
                best_match = scenario
            continue
        
        # コアタイトルの含有チェック
        if contains_match(extract_core_title(catalog_title), extract_core_title(db_title)):
            score = 0.95
            if score > best_score:
                best_score = score
                best_match = scenario
            continue
        
        # 類似度計算
        score = similarity_ratio(catalog_norm, db_norm)
        
        # コアタイトルでも類似度計算
        core_score = similarity_ratio(catalog_core, db_core)
        score = max(score, core_score)
        
        if score > best_score:
            best_score = score
            best_match = scenario
    
    # 低スコアの場合は誤マッチを防ぐ
    if best_score < 0.7:
        # タイトルの長さが大きく違う場合はマッチしない
        if best_match:
            cat_len = len(normalize_title(catalog_title))
            db_len = len(normalize_title(best_match.get("title", "")))
            if abs(cat_len - db_len) > max(cat_len, db_len) * 0.5:
                return None, 0
    
    if best_score >= threshold:
        return best_match, best_score
    
    return None, 0


def fetch_scenarios_from_db(supabase):
    """DBからシナリオ情報を取得"""
    
    # scenario_masters テーブルから取得
    print("scenario_masters を取得中...")
    try:
        result = supabase.table('scenario_masters').select('id, title, author').execute()
        master_scenarios = result.data if result.data else []
        print(f"  → {len(master_scenarios)} 件のマスタシナリオ")
    except Exception as e:
        print(f"  エラー: {e}")
        master_scenarios = []
    
    # scenarios テーブルから取得（レガシー）
    print("scenarios を取得中...")
    try:
        result = supabase.table('scenarios').select('id, title, author').execute()
        legacy_scenarios = result.data if result.data else []
        print(f"  → {len(legacy_scenarios)} 件のレガシーシナリオ")
    except Exception as e:
        print(f"  エラー: {e}")
        legacy_scenarios = []
    
    # organization_scenarios を取得
    print("organization_scenarios を取得中...")
    try:
        result = supabase.table('organization_scenarios_with_master').select('*').execute()
        org_scenarios = result.data if result.data else []
        print(f"  → {len(org_scenarios)} 件の組織シナリオ")
    except Exception as e:
        print(f"  エラー: {e}")
        org_scenarios = []
    
    return master_scenarios, legacy_scenarios, org_scenarios


def load_catalog_data():
    """カタログデータを読み込み"""
    catalog_path = "docs/data/queens-waltz-catalog.json"
    
    try:
        with open(catalog_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data.get("scenarios", [])
    except FileNotFoundError:
        print(f"❌ カタログファイルが見つかりません: {catalog_path}")
        return []


def map_scenarios(catalog_scenarios, db_scenarios, threshold=0.5):
    """
    カタログとDBのシナリオをマッピング
    
    Returns:
        (matched, unmatched_catalog, unmatched_db)
    """
    matched = []
    unmatched_catalog = []
    used_db_ids = set()
    
    for cat_scenario in catalog_scenarios:
        cat_title = cat_scenario.get("title", "")
        
        best_match, score = find_best_match(cat_title, db_scenarios, threshold)
        
        if best_match:
            matched.append({
                "catalog_title": cat_title,
                "db_id": best_match.get("id"),
                "db_title": best_match.get("title"),
                "db_author": best_match.get("author"),
                "similarity": round(score, 3),
                "catalog_data": cat_scenario
            })
            used_db_ids.add(best_match.get("id"))
        else:
            unmatched_catalog.append(cat_scenario)
    
    # DBにあってカタログにないシナリオ
    unmatched_db = [s for s in db_scenarios if s.get("id") not in used_db_ids]
    
    return matched, unmatched_catalog, unmatched_db


def main():
    print("=== カタログ ↔ DB シナリオマッピング ===\n")
    
    # Supabase接続
    supabase = get_supabase_client()
    if not supabase:
        return
    
    # DBからシナリオ取得
    master_scenarios, legacy_scenarios, org_scenarios = fetch_scenarios_from_db(supabase)
    
    # カタログデータ読み込み
    catalog_scenarios = load_catalog_data()
    print(f"\nカタログシナリオ数: {len(catalog_scenarios)}")
    
    # マッピング実行（緩い閾値 0.5）
    print("\n=== マッピング実行（閾値: 0.5）===\n")
    
    # マスタシナリオとマッピング
    if master_scenarios:
        print("【scenario_masters との マッピング】")
        matched, unmatched_cat, unmatched_db = map_scenarios(
            catalog_scenarios, master_scenarios, threshold=0.5
        )
        
        print(f"\n✅ マッチした: {len(matched)} 件")
        print(f"❌ カタログのみ: {len(unmatched_cat)} 件")
        print(f"❓ DBのみ: {len(unmatched_db)} 件")
        
        # 結果を保存
        result = {
            "matched": matched,
            "unmatched_catalog": unmatched_cat,
            "unmatched_db": unmatched_db,
            "stats": {
                "matched_count": len(matched),
                "unmatched_catalog_count": len(unmatched_cat),
                "unmatched_db_count": len(unmatched_db),
                "total_catalog": len(catalog_scenarios),
                "total_db": len(master_scenarios)
            }
        }
        
        output_path = "docs/data/scenario-mapping-masters.json"
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"\n保存: {output_path}")
        
        # マッチ詳細を表示
        print("\n--- マッチ詳細（上位20件）---")
        for m in sorted(matched, key=lambda x: -x["similarity"])[:20]:
            print(f"  [{m['similarity']:.2f}] {m['catalog_title']}")
            print(f"        → {m['db_title']}")
    
    # レガシーシナリオとマッピング
    if legacy_scenarios:
        print("\n\n【scenarios（レガシー）との マッピング】")
        matched_legacy, unmatched_cat_legacy, unmatched_db_legacy = map_scenarios(
            catalog_scenarios, legacy_scenarios, threshold=0.5
        )
        
        print(f"\n✅ マッチした: {len(matched_legacy)} 件")
        print(f"❌ カタログのみ: {len(unmatched_cat_legacy)} 件")
        print(f"❓ DBのみ: {len(unmatched_db_legacy)} 件")
        
        result_legacy = {
            "matched": matched_legacy,
            "unmatched_catalog": unmatched_cat_legacy,
            "unmatched_db": unmatched_db_legacy,
            "stats": {
                "matched_count": len(matched_legacy),
                "unmatched_catalog_count": len(unmatched_cat_legacy),
                "unmatched_db_count": len(unmatched_db_legacy),
                "total_catalog": len(catalog_scenarios),
                "total_db": len(legacy_scenarios)
            }
        }
        
        output_path_legacy = "docs/data/scenario-mapping-legacy.json"
        with open(output_path_legacy, 'w', encoding='utf-8') as f:
            json.dump(result_legacy, f, ensure_ascii=False, indent=2)
        print(f"\n保存: {output_path_legacy}")
        
        # マッチ詳細を表示
        print("\n--- マッチ詳細（上位20件）---")
        for m in sorted(matched_legacy, key=lambda x: -x["similarity"])[:20]:
            print(f"  [{m['similarity']:.2f}] {m['catalog_title']}")
            print(f"        → {m['db_title']}")
        
        # 未マッチのカタログを表示
        if unmatched_cat_legacy:
            print(f"\n--- 未マッチ（カタログ側、最初の20件）---")
            for s in unmatched_cat_legacy[:20]:
                print(f"  - {s['title']}")
    
    print("\n=== 完了 ===")


if __name__ == "__main__":
    main()

