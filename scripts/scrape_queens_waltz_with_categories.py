#!/usr/bin/env python3
"""
クインズワルツ公式カタログページからシナリオ情報（カテゴリー含む）をスクレイピング
https://queenswaltz.jp/catalog
"""

import asyncio
import re
import json
from playwright.async_api import async_playwright


# 既知のカテゴリータグ（人数フィルターは除外）
CATEGORY_TAGS = [
    '🔰 初心者におすすめ', '🔰初心者におすすめ', '初心者におすすめ',
    '✨ 新作', '✨新作',
    '📕 ストーリープレイング', '📕ストーリープレイング',
    '🔍 ミステリー', '🔍ミステリー',
    '🌀情報量多め', '🌀 情報量多め',
    '🎭 RP重視', '🎭RP重視',
    'オススメ', 'おすすめ',
]

# フィルター用カテゴリー（メニューにあるがシナリオタグではない）
FILTER_CATEGORIES = ['5人以下', '6人用', '7人用', '8人用', '9人以上', '新作', 'ストーリープレイング', 'ミステリー', '情報量多め', 'RP重視']

# スキップするテキスト
SKIP_TEXTS = [
    'マーダーミステリー専門店', 'クインズワルツ', '読み込まれました', 'contents loaded',
    'location_on', 'アクセス', 'access_time', '営業時間', 'done', '予約する',
    'local_florist', 'マダミスとは？', '公演カタログ', 'edit', '制作・提携',
    'email', '問い合わせ', 'Q&A・その他', 'TITLES', '検索する', 'search',
    'もっと見る', '料金', '円', '参加人数', '人', '所用', '時間',
]


async def scrape_catalog():
    """カタログページから全シナリオ情報を取得（カテゴリータグ含む）"""
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        url = "https://queenswaltz.jp/catalog"
        print(f"アクセス中: {url}")
        await page.goto(url, wait_until="networkidle")
        await page.wait_for_timeout(3000)
        
        # 「もっと見る」ボタンを全てクリック
        print("全データを読み込み中...")
        click_count = 0
        max_clicks = 50
        consecutive_failures = 0
        
        while click_count < max_clicks and consecutive_failures < 5:
            try:
                btn = await page.query_selector('button:has-text("もっと見る")')
                if btn and await btn.is_visible():
                    await btn.scroll_into_view_if_needed()
                    await page.wait_for_timeout(300)
                    await btn.click()
                    click_count += 1
                    consecutive_failures = 0
                    if click_count % 10 == 0:
                        print(f"  クリック {click_count}回...")
                    await page.wait_for_timeout(1000)
                else:
                    consecutive_failures += 1
                    await page.wait_for_timeout(500)
            except:
                consecutive_failures += 1
                await page.wait_for_timeout(500)
        
        print(f"合計 {click_count} 回クリック完了")
        await page.wait_for_timeout(2000)
        
        # テキストを取得
        text = await page.inner_text('body')
        lines = [l.strip() for l in text.split('\n') if l.strip()]
        
        print(f"取得行数: {len(lines)}")
        
        await browser.close()
    
    # シナリオを解析
    scenarios = []
    i = 0
    
    while i < len(lines):
        line = lines[i]
        
        # 「料金」という行を見つけたらシナリオの開始
        if line == '料金':
            # タイトルと作者は料金の2行前と1行前
            title = lines[i - 2] if i >= 2 else None
            author = lines[i - 1] if i >= 1 else None
            
            # タイトルがスキップ対象でないか確認
            if title and not any(skip in title for skip in SKIP_TEXTS) and len(title) > 1:
                # 料金を取得
                price = None
                if i + 1 < len(lines) and lines[i + 1].isdigit():
                    price = int(lines[i + 1])
                
                # 参加人数を取得
                players = None
                for j in range(i, min(i + 10, len(lines))):
                    if lines[j] == '参加人数' and j + 1 < len(lines) and lines[j + 1].isdigit():
                        players = int(lines[j + 1])
                        break
                
                # 所用時間を取得
                duration = None
                for j in range(i, min(i + 15, len(lines))):
                    if lines[j] == '所用' and j + 1 < len(lines) and lines[j + 1].isdigit():
                        duration = int(lines[j + 1])
                        break
                
                # カテゴリータグを取得（シナリオ情報の後を探す）
                categories = []
                
                # カテゴリーの絵文字リスト（HPから確認した全種類）
                category_emojis = [
                    '✨',  # 新作
                    '🎭',  # RP重視
                    '🔍',  # ミステリー
                    '🌀',  # 情報量多め
                    '📕',  # ストーリープレイング, 事前読み込み必須
                    '📖',  # 文章量多め
                    '📘',  # 事前読み込み可能
                    '💀',  # デスゲーム
                    '🎩',  # 経験者限定
                    '🔰',  # 初心者にオススメ
                    '🎲',  # ボードゲーム
                    '🎓',  # アオハルミステリー
                    '⚡',  # センシティブ
                    '🏆',  # ロングセラー
                    '📅',  # ロングセラー, 期間限定
                    '💻',  # オンライン
                    '🤝',  # 協力型
                    '💥',  # 駆け引き重視
                    '🇯🇵', # 和風
                    '🗓️', # 期間限定
                    '🗓',  # 期間限定（絵文字バリエーション）
                    '⭐',  # オススメ
                ]
                
                # 時間の後の行をチェック（カテゴリーがある）
                end_idx = min(i + 25, len(lines))
                for j in range(i + 8, end_idx):
                    check_line = lines[j]
                    # 次のシナリオの開始（料金）に達したら終了
                    if check_line == '料金':
                        break
                    # 絵文字で始まるカテゴリータグを検出
                    if any(check_line.startswith(e) for e in category_emojis):
                        # 正規化（絵文字と空白を除去）
                        normalized = check_line
                        for e in category_emojis:
                            normalized = normalized.replace(e, '')
                        normalized = normalized.strip()
                        if normalized and normalized not in categories:
                            categories.append(normalized)
                    elif check_line == 'オススメ' or check_line == 'おすすめ':
                        if 'オススメ' not in categories:
                            categories.append('オススメ')
                
                scenarios.append({
                    'title': title,
                    'author': author if author and not any(skip in author for skip in SKIP_TEXTS) else None,
                    'price': price,
                    'players': players,
                    'duration': duration,
                    'categories': categories
                })
        
        i += 1
    
    # 重複除去
    seen = set()
    unique = []
    for s in scenarios:
        if s['title'] not in seen:
            seen.add(s['title'])
            unique.append(s)
    
    return unique


def save_to_markdown(scenarios, filepath):
    """Markdownファイルに保存"""
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write("# クインズワルツ シナリオリスト\n\n")
        f.write("出典: https://queenswaltz.jp/catalog\n\n")
        f.write("## シナリオ一覧\n\n")
        f.write("| タイトル | 人数 | 時間 | 料金 | カテゴリー |\n")
        f.write("|---------|------|------|------|------------|\n")
        
        for s in scenarios:
            title = s.get('title', '').replace('|', '｜')
            players = f"{s['players']}人" if s.get('players') else '不明'
            duration = f"{s['duration']}時間" if s.get('duration') else '不明'
            price = f"{s['price']:,}円" if s.get('price') else '不明'
            cats = ', '.join(s.get('categories', [])) if s.get('categories') else '-'
            f.write(f"| {title} | {players} | {duration} | {price} | {cats} |\n")
        
        f.write(f"\n---\n\n*合計: {len(scenarios)}シナリオ*\n")
    
    print(f"保存完了: {filepath}")


def save_to_json(scenarios, filepath):
    """JSONファイルに保存"""
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(scenarios, f, ensure_ascii=False, indent=2)
    print(f"保存完了: {filepath}")


async def main():
    print("=== クインズワルツ カタログスクレイピング ===\n")
    
    scenarios = await scrape_catalog()
    
    print(f"\n取得シナリオ数: {len(scenarios)}")
    print("=" * 50)
    
    # 結果を表示
    for s in scenarios[:10]:
        cats = ', '.join(s.get('categories', [])) if s.get('categories') else '-'
        print(f"  {s['title']} | {s.get('players', '?')}人 | {cats}")
    
    if len(scenarios) > 10:
        print(f"  ... 他 {len(scenarios) - 10} 件")
    
    if scenarios:
        save_to_json(scenarios, "docs/data/queens-waltz-catalog.json")
        save_to_markdown(scenarios, "docs/data/queens-waltz-catalog.md")


if __name__ == "__main__":
    asyncio.run(main())
