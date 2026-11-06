# QLovehome 发布打包脚本
# 用法：powershell -ExecutionPolicy Bypass -File scripts\package.ps1
#
# 产出两个 zip 到 release\ 目录：
#   1. QLovehome-v<版本>.zip              完整包，首层是 custom_components\ + qlovehome_addon\ + 文档
#   2. QLovehome-integration-v<版本>.zip  集成专用，首层即 manifest.json
#      （冬瓜 HAOS 伴侣等「从压缩包安装集成」的工具要求这种结构）
#
# 说明：历史上手工压缩多包了一层 QLovehome-vX.Y.Z\，导致 manifest.json 落在第 3 层，
#      这类工具会报「压缩包中未找到 manifest.json」。所以统一用本脚本打包。

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$repo = Split-Path -Parent $PSScriptRoot
$ver = (Get-Content (Join-Path $repo 'custom_components\qlovehome\manifest.json') -Raw | ConvertFrom-Json).version
$out = Join-Path $repo 'release'
$tmp = Join-Path $env:TEMP "qlh_pack_$ver"

Write-Host "QLovehome $ver 打包" -ForegroundColor Cyan

# ── 三份前端副本一致性校验（不一致就不打包） ─────────────────
$www = @('index.html', 'qlovehome.js', 'qlovehome-editor.js', 'qlovehome.css', 'qlovehome-data.js', 'QLovehome.png')
$mismatch = @()
foreach ($f in $www) {
    $src = Join-Path $repo "qlovehome\$f"
    if (-not (Test-Path $src)) { continue }
    $h = (Get-FileHash $src -Algorithm SHA256).Hash
    foreach ($d in @('custom_components\qlovehome\www', 'qlovehome_addon\www')) {
        $t = Join-Path $repo "$d\$f"
        if (-not (Test-Path $t) -or (Get-FileHash $t -Algorithm SHA256).Hash -ne $h) { $mismatch += "$f -> $d" }
    }
}
if ($mismatch.Count -gt 0) {
    Write-Host '前端三份副本不一致，请先运行 scripts\sync-www.ps1：' -ForegroundColor Red
    $mismatch | ForEach-Object { Write-Host "  $_" }
    exit 1
}
Write-Host '  前端副本一致性 OK' -ForegroundColor Green

# ── 准备临时目录 ────────────────────────────────────────────
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
$main = Join-Path $tmp 'main'
$one = Join-Path $tmp 'one'
New-Item -ItemType Directory -Force -Path $main, $one | Out-Null

# 完整包：首层直接是 custom_components\ 与 qlovehome_addon\
Copy-Item (Join-Path $repo 'custom_components\qlovehome') (Join-Path $main 'custom_components\qlovehome') -Recurse -Force
New-Item -ItemType Directory -Force -Path (Join-Path $main 'qlovehome_addon') | Out-Null
Copy-Item (Join-Path $repo 'qlovehome_addon\config.yaml') (Join-Path $main 'qlovehome_addon\') -Force
Copy-Item (Join-Path $repo 'qlovehome_addon\Dockerfile') (Join-Path $main 'qlovehome_addon\') -Force
Copy-Item (Join-Path $repo 'qlovehome_addon\run.sh') (Join-Path $main 'qlovehome_addon\') -Force
Copy-Item (Join-Path $repo 'qlovehome_addon\README.md') (Join-Path $main 'qlovehome_addon\') -Force
Copy-Item (Join-Path $repo 'qlovehome_addon\www') (Join-Path $main 'qlovehome_addon\www') -Recurse -Force
Copy-Item (Join-Path $repo 'qlovehome_addon\server') (Join-Path $main 'qlovehome_addon\server') -Recurse -Force
foreach ($f in @('repository.yaml', 'hacs.json', 'README.md', 'USER_GUIDE.md', 'info.md', 'LICENSE')) {
    Copy-Item (Join-Path $repo $f) $main -Force
}

# 集成专用包：首层就是 manifest.json
Copy-Item (Join-Path $repo 'custom_components\qlovehome\*') $one -Recurse -Force

# ── 清理缓存 ────────────────────────────────────────────────
foreach ($d in @($main, $one)) {
    Get-ChildItem $d -Recurse -Directory -Filter '__pycache__' -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
    Get-ChildItem $d -Recurse -File -Include '*.pyc', '*.pyo' -ErrorAction SilentlyContinue | Remove-Item -Force
}

# ── 压缩 ────────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path $out | Out-Null
$zips = @(
    @{ Name = "QLovehome-v$ver.zip"; Src = $main },
    @{ Name = "QLovehome-integration-v$ver.zip"; Src = $one }
)
foreach ($z in $zips) {
    $dest = Join-Path $out $z.Name
    if (Test-Path $dest) { Remove-Item $dest -Force }
    # 注意：不能用 ZipFile.CreateFromDirectory / Compress-Archive，
    # .NET Framework 会把目录分隔符写成反斜杠，Linux 解压后 "www\index.html"
    # 会变成一个文件名而不是 www/ 目录，集成因此找不到前端文件。
    # 这里手工写条目，强制使用正斜杠。
    $srcRoot = (Resolve-Path $z.Src).Path.TrimEnd('\')
    $zip = [System.IO.Compression.ZipFile]::Open($dest, 'Create')
    try {
        foreach ($f in Get-ChildItem $z.Src -Recurse -File) {
            $rel = $f.FullName.Substring($srcRoot.Length + 1).Replace('\', '/')
            $entry = $zip.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
            $es = $entry.Open()
            $fs = [System.IO.File]::OpenRead($f.FullName)
            try { $fs.CopyTo($es) } finally { $fs.Dispose(); $es.Dispose() }
        }
    } finally { $zip.Dispose() }
    $size = [math]::Round((Get-Item $dest).Length / 1MB, 2)
    $hash = (Get-FileHash $dest -Algorithm SHA256).Hash
    Write-Host ("  {0}  {1} MB  {2}" -f $z.Name, $size, $hash) -ForegroundColor Green
}

# ── 结构自检（含分隔符检查） ────────────────────────────────
foreach ($z in $zips) {
    $a = [System.IO.Compression.ZipFile]::OpenRead((Join-Path $out $z.Name))
    $top = @($a.Entries | ForEach-Object { ($_.FullName -split '/')[0] } | Sort-Object -Unique)
    $bad = @($a.Entries | Where-Object { $_.FullName -match '\\' }).Count
    $a.Dispose()
    if ($bad -gt 0) {
        Write-Host ("  {0} 含 {1} 个反斜杠条目，Linux 解压会出错！" -f $z.Name, $bad) -ForegroundColor Red
        exit 1
    }
    Write-Host ("  {0} 首层: {1}" -f $z.Name, ($top -join ', ')) -ForegroundColor DarkGray
}

Remove-Item $tmp -Recurse -Force
Write-Host "完成，产物在 release\" -ForegroundColor Cyan
