#!/usr/bin/env bash
set -euo pipefail

required_kb=1500000
available_kb=$(awk '/MemAvailable/ {print $2}' /proc/meminfo)
machine=$(uname -m)
free_gb=$(df -Pk . | awk 'NR==2 {printf "%.1f", $4/1024/1024}')

echo "VieNeu-TTS v3.3.0 | Apache-2.0 | CPU/ONNX | mode=v3turbo"
echo "Kiến trúc: $machine | RAM khả dụng: $((available_kb/1024)) MB | Đĩa trống: ${free_gb} GB"

case "$machine" in x86_64|aarch64) ;; *) echo "KHÔNG CÀI: kiến trúc chưa được hỗ trợ: $machine"; exit 1;; esac
if (( available_kb < required_kb )); then
  echo "KHÔNG CÀI: cần tối thiểu 1500 MB RAM khả dụng để chạy cùng hệ thống."
  exit 1
fi
if ! awk -v free="$free_gb" 'BEGIN {exit !(free >= 2.0)}'; then
  echo "KHÔNG CÀI: cần tối thiểu 2 GB dung lượng trống."
  exit 1
fi
echo "ĐẠT KIỂM TRA: có thể bật profile vieneu. Không cài VieNeu v4/API trả phí."
