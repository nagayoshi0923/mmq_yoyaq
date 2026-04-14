#!/bin/bash
# cronから呼ばれるラッパースクリプト
# GH_TOKENとPATHを設定してrun.shを実行する

export PATH="/Users/nagayoshimai/.nvm/versions/node/v22.19.0/bin:/usr/local/bin:/usr/bin:/bin"
# GH_TOKEN を一時的に外してキーリングの OAuth トークンを取得する（PAT ファイルは期限切れになるので使わない）
export GH_TOKEN="$(unset GH_TOKEN; gh auth token 2>/dev/null)"

SCRIPT_DIR="/Users/nagayoshimai/Desktop/mmq_yoyaq/scripts/ai-team"
LOG_FILE="$SCRIPT_DIR/cron.log"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] AIチーム起動" >> "$LOG_FILE"
bash "$SCRIPT_DIR/run.sh" >> "$LOG_FILE" 2>&1
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 完了" >> "$LOG_FILE"
