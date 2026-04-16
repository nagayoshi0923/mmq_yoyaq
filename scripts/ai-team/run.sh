#!/bin/bash
# AIチーム起動スクリプト
# 使い方: ./scripts/ai-team/run.sh
# 新しいGitHub Issueを取得してPMエージェントに渡す

set -e

REPO="nagayoshi0923/mmq_yoyaq"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_FILE="$SCRIPT_DIR/.processed_issues"
WORK_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TMP_DIR="$(mktemp -d)"

# 終了時に一時ファイルを削除
trap 'rm -rf "$TMP_DIR"' EXIT

# 処理済みIssue番号を記録するファイル
touch "$STATE_FILE"

echo "=== AIチーム起動 ==="
echo "リポジトリ: $REPO"
echo ""

# 未処理のオープンIssueを取得（ファイル経由でJSONを渡す）
gh issue list --repo "$REPO" --state open --json number,title,body,labels --limit 50 > "$TMP_DIR/issues.json"

# 各Issueをファイルに書き出す
python3 - <<PYEOF > "$TMP_DIR/count.txt"
import json, sys, os

processed = set()
try:
    with open('$STATE_FILE') as f:
        processed = set(line.strip() for line in f if line.strip())
except:
    pass

with open('$TMP_DIR/issues.json') as f:
    issues = json.load(f)
new = [i for i in issues if str(i['number']) not in processed]

print(len(new))
for i in new:
    path = '$TMP_DIR/' + str(i['number']) + '.json'
    with open(path, 'w') as f:
        json.dump(i, f, ensure_ascii=False)
PYEOF

COUNT=$(cat "$TMP_DIR/count.txt")

if [ "$COUNT" -eq 0 ]; then
    echo "新しいIssueはありません。"
    exit 0
fi

echo "新しいIssue: ${COUNT}件"
echo ""

# 各Issueを処理
for ISSUE_FILE in "$TMP_DIR"/*.json; do
    [ -f "$ISSUE_FILE" ] || continue

    NUMBER=$(python3 -c "import json; d=json.load(open('$ISSUE_FILE')); print(d['number'])")
    TITLE=$(python3 -c "import json; d=json.load(open('$ISSUE_FILE')); print(d['title'])")
    BODY=$(python3 -c "import json; d=json.load(open('$ISSUE_FILE')); print(d.get('body',''))")

    echo "---"
    echo "Issue #${NUMBER}: ${TITLE}"
    echo ""

    # PMエージェント用プロンプトをファイルに書き出す
    PROMPT_FILE="$TMP_DIR/prompt_${NUMBER}.md"
    cat "$SCRIPT_DIR/prompts/pm.md" > "$PROMPT_FILE"
    cat >> "$PROMPT_FILE" << PROMPT_EOF

## 担当Issue

**Issue番号**: #${NUMBER}
**タイトル**: ${TITLE}
**本文**:
${BODY}

**作業ディレクトリ**: ${WORK_DIR}
**リポジトリ**: ${REPO}

このIssueを分析して、実装を完了させ、PRを作成してください。
PROMPT_EOF

    echo "PMエージェントを起動中..."
    cd "$WORK_DIR"
    claude --dangerously-skip-permissions -p "$(cat "$PROMPT_FILE")"

    # 処理済みとしてマーク
    echo "$NUMBER" >> "$STATE_FILE"
    echo ""
    echo "Issue #${NUMBER} 処理完了"
done

echo ""
echo "=== AIチーム完了 ==="
