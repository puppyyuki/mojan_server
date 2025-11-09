# Render 環境變數設定指南

## 📋 設定步驟

### 第一步：創建資料庫（自動）

1. **mojan-database** 會自動創建
2. **等待資料庫創建完成**（約 1-2 分鐘）
3. **取得 Internal Database URL**：
   - 在 Render Dashboard 中，點擊 `mojan-database` 服務
   - 找到 "Internal Database URL" 或 "Connection String"
   - **複製這個 URL**（稍後需要用到）

### 第二步：設定 mojan-admin 環境變數

在 Render 的 Blueprint 配置介面中，找到 "Create web service mojan-admin" 區塊：

#### 1. DATABASE_URL
- **點擊 "Enter value" 欄位**
- **貼上剛才複製的 Internal Database URL**
- 格式類似：`postgresql://mojan_user:password@dpg-xxxxx-a.singapore-postgres.render.com/mojan_db`

#### 2. JWT_SECRET
- **點擊 "Generate" 按鈕**（右側的魔術棒圖示）
- Render 會自動生成一個安全的隨機字串
- **不要手動輸入**，使用自動生成的值

#### 3. ADMIN_USERNAME
- **點擊 "Enter value" 欄位**
- **輸入管理員用戶名**（例如：`admin` 或 `mojan_admin`）
- 這是您用來登入管理面板的用戶名

#### 4. ADMIN_PASSWORD
- **點擊 "Enter value" 欄位**
- **輸入管理員密碼**（建議使用強密碼）
- 這是您用來登入管理面板的密碼
- **記住這個密碼**，稍後登入時需要用到

### 第三步：設定 mojan-server 環境變數

在 Render 的 Blueprint 配置介面中，找到 "Create web service mojan-server" 區塊：

#### 1. DATABASE_URL
- **點擊 "Enter value" 欄位**
- **貼上剛才複製的 Internal Database URL**（與 mojan-admin 相同）
- 兩個服務使用同一個資料庫

#### 2. JWT_SECRET
- **點擊 "Generate" 按鈕**（右側的魔術棒圖示）
- Render 會自動生成一個安全的隨機字串
- **建議使用與 mojan-admin 相同的 JWT_SECRET**（如果兩個服務需要互相驗證）
- 或使用不同的值（如果它們是獨立的）

#### 3. CORS_ORIGIN
- **暫時留空或使用預設值** `https://mojan-app.onrender.com`
- **等 mojan-app 部署完成後，再回來更新為實際的 URL**

## 🔄 設定順序建議

### 方法 1：先創建資料庫，再設定服務（推薦）

1. **先創建資料庫**：
   - 在 Blueprint 配置中，只選擇創建 `mojan-database`
   - 點擊 "Apply" 或 "Create"
   - 等待資料庫創建完成

2. **取得 DATABASE_URL**：
   - 在 Render Dashboard 中，進入 `mojan-database` 服務
   - 複製 "Internal Database URL"

3. **再創建服務並設定環境變數**：
   - 回到 Blueprint 配置
   - 選擇創建 `mojan-admin` 和 `mojan-server`
   - 填入剛才取得的 `DATABASE_URL`
   - 設定其他環境變數

### 方法 2：一次性創建所有服務（如果 Render 支援）

1. **先創建資料庫**（在 Blueprint 中）
2. **等待資料庫創建完成**
3. **取得 DATABASE_URL**
4. **在 Blueprint 配置中填入所有環境變數**
5. **一次性創建所有服務**

## ⚠️ 重要提醒

### 1. DATABASE_URL 的取得方式

如果資料庫還沒創建，您可以：

1. **先創建資料庫**（在 Blueprint 中只選擇資料庫）
2. **等待創建完成**
3. **取得 URL**
4. **再創建服務並填入 URL**

或者：

1. **先創建所有服務**（DATABASE_URL 暫時留空或使用佔位符）
2. **等資料庫創建完成後，再更新環境變數**

### 2. JWT_SECRET 的一致性

- **如果兩個服務需要互相驗證**：使用相同的 `JWT_SECRET`
- **如果兩個服務是獨立的**：可以使用不同的 `JWT_SECRET`

### 3. CORS_ORIGIN 的更新

- **暫時使用預設值** `https://mojan-app.onrender.com`
- **等 mojan-app 部署完成後**，取得實際 URL
- **再回來更新** `CORS_ORIGIN` 為實際的 URL

### 4. 敏感資訊安全

- **不要**將這些值提交到 Git
- **只在 Render Dashboard 中設定**
- **記住** `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`（用於登入管理面板）

## ✅ 設定完成後

1. **點擊 "Apply" 或 "Create"** 開始部署
2. **等待所有服務部署完成**（約 5-10 分鐘）
3. **取得服務 URL**：
   - `mojan-admin`: `https://mojan-admin.onrender.com`
   - `mojan-server`: `https://mojan-server.onrender.com`
4. **執行資料庫遷移**：
   - 在 Render Dashboard 中，進入 `mojan-server` 服務
   - 點擊 "Shell" 標籤
   - 執行：`npx prisma migrate deploy`
5. **更新 mojan-app 的環境變數**：
   - 進入 `mojan-app` 服務的環境變數設定
   - 更新 `API_URL` 和 `SOCKET_URL` 為 `mojan-server` 的實際 URL
6. **更新 mojan-server 的 CORS_ORIGIN**：
   - 進入 `mojan-server` 服務的環境變數設定
   - 更新 `CORS_ORIGIN` 為 `mojan-app` 的實際 URL

## 🔍 驗證設定

設定完成後，檢查：

- [ ] `mojan-database` 已創建並運行
- [ ] `mojan-admin` 已創建並運行
- [ ] `mojan-server` 已創建並運行
- [ ] 所有環境變數都已正確設定
- [ ] 資料庫遷移已執行
- [ ] 服務 URL 已取得

---

最後更新：2024年11月

