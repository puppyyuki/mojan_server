# Windows 終止進程指令指南

## 終止特定端口的進程

### 1. 查看佔用特定端口的進程
```bash
netstat -ano | findstr :3001
```

### 2. 終止特定端口的進程（一步完成）
```bash
# 終止 port 3001 的進程
for /f "tokens=5" %a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do taskkill /F /PID %a

# 終止 port 3000 的進程
for /f "tokens=5" %a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %a
```

## 終止 Node.js 相關進程

### 終止所有 node.exe 進程
```bash
taskkill /F /IM node.exe
```

### 終止所有 npm 進程
```bash
taskkill /F /IM npm.exe
```

## 終止特定 PID 的進程

```bash
taskkill /F /PID <進程ID>
```

例如：
```bash
taskkill /F /PID 24444
```

## 終止 Next.js 開發服務器

如果 Next.js 開發服務器正在運行：
```bash
# 方法 1: 終止所有 node.exe
taskkill /F /IM node.exe

# 方法 2: 終止特定端口
for /f "tokens=5" %a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do taskkill /F /PID %a
```

## PowerShell 版本（更簡潔）

在 PowerShell 中可以使用：

```powershell
# 終止 port 3001 的進程
Get-NetTCPConnection -LocalPort 3001 | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }

# 終止 port 3000 的進程
Get-NetTCPConnection -LocalPort 3000 | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }

# 終止所有 node.exe
Stop-Process -Name node -Force
```

## 快速清理所有開發服務器

```bash
# 終止 port 3000 和 3001
for /f "tokens=5" %a in ('netstat -ano ^| findstr ":3000 :3001" ^| findstr LISTENING') do taskkill /F /PID %a

# 或者終止所有 node 進程
taskkill /F /IM node.exe
```

## 注意事項

⚠️ **警告**：
- `/F` 參數會強制終止進程，可能會導致未保存的數據丟失
- 終止所有 node.exe 會關閉所有 Node.js 應用程序
- 建議先查看進程，確認要終止的進程後再執行

