#!/usr/bin/env python3
"""
クインズワルツ公式カタログページからシナリオ情報をスクレイピング
URL: https://queenswaltz.jp/catalog
"""

import asyncio
import json
import re
from datetime import datetime
from playwright.async_api import async_playwright


async def scrape_catalog():
    """カタログページからシナリオ情報を取得"""
    scenarios = []
    all_tags = set()
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        url = "https://queenswaltz.jp/catalog"
        print(f"アクセス中: {url}")
        
        try:
            await page.goto(url, wait_until="networkidle", timeout=60000)
            await page.wait_for_timeout(5000)
            
            # ページ全体をスクロールして「もっと見る」をクリック
            for _ in range(20):
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await page.wait_for_timeout(500)
                
                # 「もっと見る」ボタンをクリック
                try:
                    more_button = await page.query_selector("text=もっと見る")
                    if more_button:
                        await more_button.click()
                        await page.wait_for_timeout(1000)
                except:
                    pass
            
            await page.evaluate("window.scrollTo(0, 0)")
            await page.wait_for_timeout(1000)
            
            # ページのテキストを取得
            body_text = await page.inner_text("body")
            
            # デバッグ用に保存
            with open("catalog_debug.txt", "w", encoding="utf-8") as f:
                f.write(body_text)
            print("テキストを catalog_debug.txt に保存しました")
            
            lines = [l.strip() for l in body_text.split('\n') if l.strip()]
            
            # シナリオ情報をパース
            i = 0
            seen_titles = set()
            
            while i < len(lines):
                line = lines[i]
                
                # シナリオタイトルの候補を検出
                # 条件: 2-60文字、数字のみでない、メニュー項目でない
                skip_keywords = [
                    '読み込み', 'location', 'access', 'アクセス', '営業時間', '予約する',
                    'local_florist', 'マダミスとは', '公演カタログ', '制作', '問い合わせ',
                    'Q&A', 'TITLES', '検索する', '初心者におすすめ', '✨ 新作', '📕', '🔍',
                    '5人以下', '6人用', '7人用', '8人用', '9人以上', 'もっと見る',
                    'keyboard_arrow', 'home', 'クインズワルツ', '東京都', '株式会社',
                    'お問い合せ', '会社概要', 'プライバシー', 'FAQ', 'email', '@queens',
                    '©', 'Queen', 'edit', 'done', 'search', 'マーダーミステリー専門店',
                    '円', '人', '時間', '料金', '参加人数', '所用'
                ]
                
                is_menu_item = any(kw in line for kw in skip_keywords)
                is_too_short = len(line) < 2
                is_too_long = len(line) > 60
                is_number_only = re.match(r'^[\d,.\s]+$', line)
                
                if not is_menu_item and not is_too_short and not is_too_long and not is_number_only:
                    # これがシナリオタイトルの可能性がある
                    potential_title = line
                    
                    # 次の行が作者名かどうか確認
                    author = ""
                    price = ""
                    player_count = ""
                    duration = ""
                    tags = []
                    
                    # 次の10行を解析
                    for j in range(i+1, min(i+20, len(lines))):
                        next_line = lines[j].strip()
                        
                        # 料金
                        if next_line == "料金" and j+1 < len(lines):
                            # 次の行に金額がある
                            price_line = lines[j+1].strip()
                            price_match = re.search(r'([\d,]+)', price_line)
                            if price_match:
                                price = price_match.group(1) + "円"
                        
                        # 参加人数
                        if next_line == "参加人数" and j+1 < len(lines):
                            count_line = lines[j+1].strip()
                            count_match = re.search(r'(\d+)', count_line)
                            if count_match:
                                player_count = count_match.group(1) + "人"
                        
                        # 所用時間
                        if next_line == "所用" and j+1 < len(lines):
                            time_line = lines[j+1].strip()
                            time_match = re.search(r'([\d.~]+)', time_line)
                            if time_match:
                                duration = time_match.group(1) + "時間"
                        
                        # タグ（絵文字付きのもの）
                        tag_patterns = [
                            ('✨ 新作', '新作'),
                            ('🎭 RP重視', 'RP重視'),
                            ('🔍 ミステリー', 'ミステリー重視'),
                            ('📕 ストーリー', 'ストーリー重視'),
                            ('🔰 初心者', '初心者向け'),
                            ('💀デスゲーム', 'デスゲーム'),
                            ('🌀情報量多め', '情報量多め'),
                            ('🎩 経験者限定', '経験者向け'),
                            ('📅 ロングセラー', 'ロングセラー'),
                            ('オススメ', 'オススメ'),
                        ]
                        
                        for pattern, tag in tag_patterns:
                            if pattern in next_line and tag not in tags:
                                tags.append(tag)
                                all_tags.add(tag)
                        
                        # 作者名（タイトルの直後の行で、料金などでない場合）
                        if j == i+1 and not any(kw in next_line for kw in ['料金', '参加人数', '所用', '円', '人', '時間', '✨', '🎭', '🔍', '📕', '💀', '🌀', '🎩', '📅', '🔰']):
                            if len(next_line) < 30 and not re.match(r'^[\d,.\s]+$', next_line):
                                author = next_line
                        
                        # 次のシナリオタイトルが見つかったら終了
                        if j > i + 5:
                            is_next_scenario = (
                                len(next_line) >= 2 and 
                                len(next_line) <= 60 and
                                not any(kw in next_line for kw in skip_keywords) and
                                not re.match(r'^[\d,.\s]+$', next_line)
                            )
                            if is_next_scenario and player_count:
                                break
                    
                    # 人数情報がある場合、シナリオとして追加
                    if player_count and potential_title not in seen_titles:
                        seen_titles.add(potential_title)
                        scenario = {
                            "title": potential_title,
                            "author": author,
                            "player_count": player_count,
                            "duration": duration,
                            "price": price,
                            "tags": tags
                        }
                        scenarios.append(scenario)
                        print(f"✓ {potential_title} | {author} | {player_count} | {duration} | {price}")
                        if tags:
                            print(f"  タグ: {', '.join(tags)}")
                
                i += 1
            
            await browser.close()
            
        except Exception as e:
            print(f"エラー: {e}")
            import traceback
            traceback.print_exc()
            await browser.close()
    
    return scenarios, all_tags


def save_to_markdown(scenarios, all_tags, filepath):
    """Markdownファイルに保存"""
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write("# クインズワルツ カタログ シナリオリスト\n\n")
        f.write("出典: https://queenswaltz.jp/catalog\n\n")
        
        # タグ一覧
        if all_tags:
            f.write("## カテゴリタグ一覧\n\n")
            for tag in sorted(all_tags):
                f.write(f"- {tag}\n")
            f.write("\n")
        
        f.write("## シナリオ一覧\n\n")
        f.write("| タイトル | 作者 | 人数 | 時間 | 料金 | タグ |\n")
        f.write("|---------|------|------|------|------|------|\n")
        
        for s in scenarios:
            title = s.get("title", "").replace("|", "\\|")
            author = s.get("author", "").replace("|", "\\|")
            player = s.get("player_count", "").replace("|", "\\|")
            duration = s.get("duration", "").replace("|", "\\|")
            price = s.get("price", "").replace("|", "\\|")
            tags = ", ".join(s.get("tags", []))
            f.write(f"| {title} | {author} | {player} | {duration} | {price} | {tags} |\n")
        
        f.write(f"\n---\n\n")
        f.write(f"*合計: {len(scenarios)}シナリオ*\n")
        f.write(f"*スクレイピング日: {datetime.now().strftime('%Y-%m-%d')}*\n")
    
    print(f"\n保存完了: {filepath}")


def save_to_json(scenarios, all_tags, filepath):
    """JSONファイルに保存"""
    data = {
        "scenarios": scenarios,
        "tags": list(all_tags),
        "scraped_at": datetime.now().isoformat()
    }
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"保存完了: {filepath}")


async def main():
    print("=== クインズワルツ カタログ スクレイピング ===\n")
    
    scenarios, all_tags = await scrape_catalog()
    
    print(f"\n=============================")
    print(f"取得したシナリオ数: {len(scenarios)}")
    print(f"タグ数: {len(all_tags)}")
    print(f"=============================")
    
    if scenarios:
        save_to_markdown(scenarios, all_tags, "docs/data/queens-waltz-catalog.md")
        save_to_json(scenarios, all_tags, "docs/data/queens-waltz-catalog.json")
    else:
        print("シナリオが取得できませんでした")


if __name__ == "__main__":
    asyncio.run(main())
