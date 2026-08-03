# 逸云阁 · 本地 git 初始化脚本（仅本地，不上传、不需要任何账号）
# 作用：把应用初始化为一个 git 仓库并提交，方便后续上传到 GitHub。
# 不会推送、不会连接任何远程，安全。
# 用法：在 sakura-desk 目录里右键本文件 →「使用 PowerShell 运行」。

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "未检测到 git。请改用「GitHub Desktop」方式（见下方说明），或先安装 git。" -ForegroundColor Yellow
  Write-Host "GitHub Desktop 下载：https://desktop.github.com" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "【纯网页方式，无需 git】" -ForegroundColor Cyan
  Write-Host "1) github.com → New repository，仓库名随便（如 yiyunge），不要勾选 README。"
  Write-Host "2) 下载安装 GitHub Desktop，登录后 Clone 该仓库到本机空文件夹。"
  Write-Host "3) 把本目录(index.html / css / js)复制进克隆文件夹，Commit → Push。"
  Write-Host "4) 网页进仓库 Settings → Pages → Source 选 main /(root) → Save。"
  Write-Host "5) 一两分钟后访问 https://你的用户名.github.io/yiyunge/ 即可，换 WiFi / 手机流量都能开。"
  pause; exit
}

git init -q
git add -A
$msg = "逸云阁发布 $(Get-Date -Format yyyy-MM-dd)"
git commit -q -m $msg
Write-Host "✅ 本地已提交：$msg" -ForegroundColor Green
Write-Host ""
Write-Host "接下来（只需在浏览器里做，不需要命令行）：" -ForegroundColor Cyan
Write-Host "1) 打开 github.com → New repository，仓库名随便（如 yiyunge），【不要】勾选 README。"
Write-Host "2) 推荐用 GitHub Desktop：克隆该仓库到本机空文件夹，把本目录内容复制进去，Commit → Push。"
Write-Host "   或用命令行（需先 'gh auth login'）： gh repo create yiyunge --private -s . --push"
Write-Host "3) 仓库 Settings → Pages → Source 选 main /(root) → Save。"
Write-Host "4) 一两分钟后访问 https://你的用户名.github.io/yiyunge/ 即可，换 WiFi / 手机流量都能开。"
Write-Host ""
Write-Host "隐私说明：本仓库只含空的 App 外壳，不含任何个人数据；真实数据仅存于你的浏览器与加密 Gist。"
pause
