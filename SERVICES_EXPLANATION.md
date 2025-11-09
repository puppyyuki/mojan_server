# Render 服務說明

## 📋 三個服務的用途

### 1. mojan_app (Static Site) ✅ 已部署
- **類型**：Flutter Web 前端應用
- **用途**：玩家使用的遊戲介面
- **是否必需**：✅ **必需** - 這是玩家使用的應用程式

### 2. mojan-server (Node.js Web Service) ✅ 已部署
- **類型**：Socket.io 遊戲伺服器
- **用途**：處理遊戲邏輯、Socket.io 連線、API 請求
- **是否必需**：✅ **必需** - 這是後端伺服器，處理所有遊戲邏輯

### 3. mojan-admin (Node.js Web Service) ❌ 部署失敗
- **類型**：Next.js 管理面板
- **用途**：管理後台，用於：
  - 用戶管理
  - 俱樂部管理
  - 遊戲記錄管理
  - 支付管理
  - 代理管理
- **是否必需**：❓ **可選** - 如果您不需要管理功能，可以刪除

## 🤔 是否保留 mojan-admin？

### 保留 mojan-admin 的情況：
- ✅ 需要管理用戶、俱樂部、遊戲記錄
- ✅ 需要查看遊戲統計數據
- ✅ 需要管理支付和代理
- ✅ 需要後台管理功能

### 刪除 mojan-admin 的情況：
- ✅ 只需要基本的遊戲功能
- ✅ 不需要管理後台
- ✅ 想要節省資源（免費方案有限制）
- ✅ 暫時不需要管理功能（以後可以再加回來）

## 🔧 修復 mojan-admin 部署問題

如果您決定保留 mojan-admin，需要修復部署問題：

### 可能的原因：
1. **環境變數未設定**：
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD`

2. **建置錯誤**：
   - Next.js 建置失敗
   - 依賴套件問題

3. **啟動命令錯誤**：
   - `npm run admin:start` 可能無法正常啟動

### 修復步驟：
1. **檢查部署日誌**：
   - 在 Render Dashboard 中，點擊 `mojan-admin` 服務
   - 查看 "Logs" 標籤
   - 找出具體的錯誤訊息

2. **設定環境變數**：
   - 進入 `mojan-admin` 服務設定
   - 設定所有必要的環境變數

3. **檢查建置命令**：
   - 確認 `buildCommand: npm install && npm run build` 正確
   - 確認 `startCommand: npm run admin:start` 正確

## 🗑️ 刪除 mojan-admin

如果您決定刪除 mojan-admin：

### 方法 1：在 Render Dashboard 中刪除
1. 進入 Render Dashboard
2. 找到 `mojan-admin` 服務
3. 點擊 "Settings" → "Delete Service"
4. 確認刪除

### 方法 2：從 render.yaml 中移除
1. 編輯 `mojan_server/render.yaml`
2. 刪除 `mojan-admin` 服務定義
3. 提交到 GitHub
4. Render 會自動同步（或手動刪除服務）

## 📝 建議

### 如果這是測試階段：
- ✅ **建議刪除 mojan-admin**（暫時不需要）
- ✅ 專注於讓 `mojan-app` 和 `mojan-server` 正常運行
- ✅ 等基本功能穩定後，再添加管理面板

### 如果需要管理功能：
- ✅ **建議修復 mojan-admin**
- ✅ 檢查部署日誌找出問題
- ✅ 設定所有必要的環境變數
- ✅ 確認建置和啟動命令正確

## ✅ 最小部署配置

如果只保留必需的服務：

1. **mojan_app** (Static Site) - 前端
2. **mojan-server** (Web Service) - 後端
3. **mojan-database** (PostgreSQL) - 資料庫

這三個服務就足夠讓遊戲正常運行。

---

最後更新：2024年11月

