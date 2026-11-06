# QLovehome · 前端同步脚本
#
# qlovehome/ 是唯一的前端源码目录，发布时用这个脚本同步到两个后端：
#   custom_components/qlovehome/www/   ← HACS 集成（集成模式）
#   qlovehome_addon/www/               ← HAOS Add-on（独立进程）
#
# 用法（仓库根目录）：
#   pwsh -File scripts/sync-www.ps1
# 同步完会做一次 SHA256 校验，三份不一致直接报错退出。

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'qlovehome'
if (-not (Test-Path $src)) { throw "找不到前端源码目录: $src" }

$targets = @(
  (Join-Path $root 'custom_components\qlovehome\www'),
  (Join-Path $root 'qlovehome_addon\www')
)
$files = @(
  'index.html',
  'qlovehome.js',
  'qlovehome-editor.js',
  'qlovehome.css',
  'qlovehome-data.js',
  'QLovehome.png'
)

foreach ($t in $targets) {
  if (-not (Test-Path $t)) { New-Item -ItemType Directory -Path $t -Force | Out-Null }
  foreach ($f in $files) {
    $from = Join-Path $src $f
    if (Test-Path $from) { Copy-Item $from (Join-Path $t $f) -Force }
  }
  $assets = Join-Path $src 'assets'
  if (Test-Path $assets) {
    $dst = Join-Path $t 'assets'
    if (-not (Test-Path $dst)) { New-Item -ItemType Directory -Path $dst -Force | Out-Null }
    Copy-Item (Join-Path $assets '*') $dst -Recurse -Force
  }
}

# 一致性校验：三份必须逐字节相同，否则 CI 会挂
foreach ($f in $files) {
  $from = Join-Path $src $f
  if (-not (Test-Path $from)) { continue }
  $h = (Get-FileHash $from -Algorithm SHA256).Hash
  foreach ($t in $targets) {
    $ht = (Get-FileHash (Join-Path $t $f) -Algorithm SHA256).Hash
    if ($h -ne $ht) { throw "同步失败（内容不一致）: $f -> $t" }
  }
}

Write-Host ("已同步 {0} 个文件到:" -f $files.Count)
$targets | ForEach-Object { Write-Host "  $_" }
Write-Host '三份前端内容一致 ✓'
