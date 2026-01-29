#!/usr/bin/env python3
"""
シンプルなHTTPリクエストでカタログページからカテゴリーを取得
"""

import requests
import re
import json
from bs4 import BeautifulSoup

def scrape_catalog():
    """カタログページをスクレイピング"""
    url = "https://queenswaltz.jp/catalog"
    
    print(f"アクセス中: {url}")
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # ページ構造を確認
        print(f"ページサイズ: {len(response.text)} bytes")
        
        # カードを探す
        cards = soup.find_all(['div', 'article'], class_=re.compile(r'card|item|scenario', re.I))
        print(f"カード候補: {len(cards)}件")
        
        # テキスト全体からシナリオ情報を探す
        text = soup.get_text()
        
        # カテゴリータグを探す
        categories_found = []
        if '🔰' in text or '初心者' in text:
            categories_found.append('初心者向け')
        if '✨' in text or '新作' in text:
            categories_found.append('新作')
        if '📕' in text or 'ストーリープレイング' in text:
            categories_found.append('ストーリープレイング')
        if '🔍' in text or 'ミステリー' in text:
            categories_found.append('ミステリー')
        
        print(f"検出カテゴリー: {categories_found}")
        
        return text
        
    except Exception as e:
        print(f"エラー: {e}")
        return None

if __name__ == "__main__":
    result = scrape_catalog()
    if result:
        print(f"\n最初の2000文字:\n{result[:2000]}")




