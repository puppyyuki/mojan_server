# 重新創建服務指南

## 📋 重新創建服務的步驟

### 方法 1：使用 Blueprint（推薦）

如果您已經提交了 `render.yaml` 的變更到 GitHub：

1. **確認 render.yaml 已提交**：
   ```bash
   cd mojan_server
   git status
   git add render.yaml
   git commit -m "設定所有服務區域為 Singapore"
   git push origin main
   ```

2. **在 Render 中使用 Blueprint**：
   - 在 Render Dashboard 中，點擊 **"New +"** → **"Blueprint"**
   - 選擇 `mojan_server` repository
   - 選擇 `main` 分支
   - Render 會自動讀取 `render.yaml` 設定

3. **確認服務設定**：
   - 檢查所有服務都正確顯示：
     - `mojan-admin` (Web Service)
     - `mojan-server` (Web Service)
     - `mojan-database` (PostgreSQL Database)
   - 確認所有服務的區域都是 `Singapore`

4. **設定環境變數**：
   - 在 Blueprint 配置介面中，設定所有必要的環境變數：
     - `DATABASE_URL`（從 `mojan-database` 複製 Internal Database URL）
     - `JWT_SECRET`（使用 Generate 按鈕）
     - `ADMIN_USERNAME`（輸入管理員用戶名）
     - `ADMIN_PASSWORD`（輸入管理員密碼）
     - `CORS_ORIGIN`（暫時使用 `https://mojan-app.onrender.com`）

5. **創建服務**：
   - 點擊 **"Apply"** 或 **"Create"** 按鈕
   - Render 會自動創建所有服務

### 方法 2：手動創建服務

如果不想使用 Blueprint，可以手動創建：

#### 步驟 1：創建 mojan-server

1. **創建 Web Service**：
   - 在 Render Dashboard 中，點擊 **"New +"** → **"Web Service"**
   - 選擇 `mojan_server` repository
   - 選擇 `main` 分支

2. **基本設定**：
   - **Name**: `mojan-server`
   - **Region**: `Singapore (Southeast Asia)`
   - **Branch**: `main`

3. **建置設定**：
   - **Build Command**: `npm install && npx prisma generate`
   - **Start Command**: `npm start`
   - **Environment**: `Node`

4. **設定環境變數**：
   - 點擊 **"Environment"** 標籤
   - 添加以下環境變數：
     - `NODE_ENV`: `production`
     - `DATABASE_URL`: （從 `mojan-database` 複製 Internal Database URL）
     - `JWT_SECRET`: （使用 Generate 按鈕）
     - `CORS_ORIGIN`: `https://mojan-app.onrender.com`
     - `PORT`: `10000`（可選，Render 會自動設定）

5. **創建服務**：
   - 點擊 **"Create Web Service"**

#### 步驟 2：創建 mojan-admin

1. **創建 Web Service**：
   - 在 Render Dashboard 中，點擊 **"New +"** → **"Web Service"**
   - 選擇 `mojan_server` repository
   - 選擇 `main` 分支

2. **基本設定**：
   - **Name**: `mojan-admin`
   - **Region**: `Singapore (Southeast Asia)`
   - **Branch**: `main`

3. **建置設定**：
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run admin:start`
   - **Environment**: `Node`

4. **設定環境變數**：
   - 點擊 **"Environment"** 標籤
   - 添加以下環境變數：
     - `NODE_ENV`: `production`
     - `DATABASE_URL`: （從 `mojan-database` 複製 Internal Database URL）
     - `JWT_SECRET`: （使用 Generate 按鈕，建議與 mojan-server 相同）
     - `ADMIN_USERNAME`: （輸入管理員用戶名）
     - `ADMIN_PASSWORD`: （輸入管理員密碼）
     - `PORT`: `3001`（可選，Render 會自動設定）

5. **創建服務**：
   - 點擊 **"Create Web Service"**

## ✅ 創建完成後的步驟

### 1. 等待服務部署完成

- 等待所有服務狀態變為 "Deployed"（約 5-10 分鐘）
- 檢查部署日誌，確認沒有錯誤

### 2. 執行資料庫遷移

1. **進入 mojan-server 服務**：
   - 在 Render Dashboard 中，點擊 `mojan-server` 服務

2. **打開 Shell**：
   - 點擊左側選單的 **"Shell"** 標籤

3. **執行遷移命令**：
   ```bash
   npx prisma migrate deploy
   ```

4. **等待遷移完成**：
   - 遷移會創建所有必要的資料表
   - 確認沒有錯誤訊息

### 3. 驗證服務狀態

1. **檢查 mojan-server**：
   - 確認服務狀態為 "Deployed"
   - 訪問健康檢查端點：`https://mojan-server.onrender.com/health`
   - 應該返回 `{ status: 'ok', timestamp: '...' }`

2. **檢查 mojan-admin**：
   - 確認服務狀態為 "Deployed"
   - 訪問管理面板：`https://mojan-admin.onrender.com/admin/login`

3. **檢查 mojan-database**：
   - 確認資料庫狀態為 "Available"
   - 確認區域為 Singapore

## 📝 重要提醒

### 1. 環境變數設定

- **DATABASE_URL**：必須使用 Internal Database URL（不是 External）
- **JWT_SECRET**：建議兩個服務使用相同的值（如果需要互相驗證）
- **CORS_ORIGIN**：暫時使用預設值，等 mojan-app 部署後再更新

### 2. 區域一致性

- 確保所有服務都在同一區域（Singapore）
- 同一區域的服務可以通過私有網路通訊，速度更快

### 3. 資料庫連線

- 確保 `DATABASE_URL` 使用 Internal Database URL
- Internal URL 格式：`postgresql://user:password@dpg-xxxxx-a/database`
- 主機名沒有域名後綴（例如：`dpg-xxxxx-a`，不是 `dpg-xxxxx-a.singapore-postgres.render.com`）

## ✅ 檢查清單

創建完成後，確認：

- [ ] `mojan-server` 已創建並部署
- [ ] `mojan-admin` 已創建並部署
- [ ] `mojan-database` 狀態為 "Available"
- [ ] 所有服務都在 Singapore 區域
- [ ] 所有環境變數都已正確設定
- [ ] 資料庫遷移已執行
- [ ] 所有服務都能正常訪問

---

最後更新：2024年11月

