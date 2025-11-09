# 環境變數設定步驟

## 📋 從資料庫取得 Internal Database URL

您已經看到資料庫的連接資訊，現在需要：

1. **複製 Internal Database URL**：
   - 在資料庫服務頁面中，找到 "Internal Database URL"
   - 點擊右側的 "複製" 圖示（或手動複製）
   - URL 格式：`postgresql://mojan_user:password@dpg-xxxxx-a/mojan_db`

## 🔧 設定 mojan-server 環境變數

### 步驟 1：進入 mojan-server 服務設定

1. 在 Render Dashboard 中，點擊 `mojan-server` 服務
2. 點擊左側選單的 **"Environment"** 標籤

### 步驟 2：設定環境變數

在環境變數設定介面中，添加以下變數：

#### 1. DATABASE_URL
- **Key**: `DATABASE_URL`
- **Value**: 貼上剛才複製的 **Internal Database URL**
- 例如：`postgresql://mojan_user:gB2ggA4wLxP9iq0DIm8ucfvAZOduN1dv@dpg-d481vlkhg0os7380cm8g-a/mojan_db`

#### 2. JWT_SECRET
- **Key**: `JWT_SECRET`
- **Value**: 點擊 **"Generate"** 按鈕自動生成
- 或手動輸入一個隨機字串（至少 32 個字元）

#### 3. CORS_ORIGIN
- **Key**: `CORS_ORIGIN`
- **Value**: `https://mojan-app.onrender.com`
- （等 mojan-app 部署完成後，再更新為實際的 URL）

#### 4. NODE_ENV
- **Key**: `NODE_ENV`
- **Value**: `production`
- （如果使用 Blueprint，可能已自動設定）

#### 5. PORT
- **Key**: `PORT`
- **Value**: `10000`
- （Render 會自動設定，但可以明確指定）

### 步驟 3：保存設定

1. 點擊 **"Save Changes"** 按鈕
2. Render 會自動重新部署服務

## 🔧 設定 mojan-admin 環境變數

### 步驟 1：進入 mojan-admin 服務設定

1. 在 Render Dashboard 中，點擊 `mojan-admin` 服務
2. 點擊左側選單的 **"Environment"** 標籤

### 步驟 2：設定環境變數

在環境變數設定介面中，添加以下變數：

#### 1. DATABASE_URL
- **Key**: `DATABASE_URL`
- **Value**: 貼上剛才複製的 **Internal Database URL**
- （與 mojan-server 使用相同的 URL）

#### 2. JWT_SECRET
- **Key**: `JWT_SECRET`
- **Value**: 點擊 **"Generate"** 按鈕自動生成
- **建議**：使用與 mojan-server 相同的 JWT_SECRET（如果兩個服務需要互相驗證）

#### 3. ADMIN_USERNAME
- **Key**: `ADMIN_USERNAME`
- **Value**: 輸入管理員用戶名（例如：`admin` 或 `mojan_admin`）
- 這是您用來登入管理面板的用戶名

#### 4. ADMIN_PASSWORD
- **Key**: `ADMIN_PASSWORD`
- **Value**: 輸入管理員密碼（建議使用強密碼）
- **記住這個密碼**，稍後登入管理面板時需要用到

#### 5. NODE_ENV
- **Key**: `NODE_ENV`
- **Value**: `production`
- （如果使用 Blueprint，可能已自動設定）

#### 6. PORT
- **Key**: `PORT`
- **Value**: `3001`
- （Render 會自動設定，但可以明確指定）

### 步驟 3：保存設定

1. 點擊 **"Save Changes"** 按鈕
2. Render 會自動重新部署服務

## ✅ 設定完成後

### 1. 執行資料庫遷移

設定完環境變數後，需要執行資料庫遷移：

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

### 2. 驗證服務狀態

1. **檢查 mojan-server**：
   - 確認服務狀態為 "Deployed"
   - 訪問健康檢查端點：`https://mojan-server.onrender.com/health`

2. **檢查 mojan-admin**：
   - 確認服務狀態為 "Deployed"
   - 訪問管理面板：`https://mojan-admin.onrender.com/admin/login`

## ⚠️ 重要提醒

### 1. 敏感資訊安全
- **不要**將 Internal Database URL 提交到 Git
- **不要**將 JWT_SECRET 提交到 Git
- **不要**將 ADMIN_PASSWORD 提交到 Git
- 這些資訊只在 Render Dashboard 中設定

### 2. JWT_SECRET 一致性
- 如果兩個服務需要互相驗證，使用相同的 `JWT_SECRET`
- 如果兩個服務是獨立的，可以使用不同的 `JWT_SECRET`

### 3. CORS_ORIGIN 更新
- 暫時使用預設值 `https://mojan-app.onrender.com`
- 等 mojan-app 部署完成後，取得實際 URL
- 再回來更新 `CORS_ORIGIN` 為實際的 URL

## 📝 檢查清單

設定完成後，確認：

- [ ] `mojan-server` 的 `DATABASE_URL` 已設定
- [ ] `mojan-server` 的 `JWT_SECRET` 已設定
- [ ] `mojan-server` 的 `CORS_ORIGIN` 已設定
- [ ] `mojan-admin` 的 `DATABASE_URL` 已設定
- [ ] `mojan-admin` 的 `JWT_SECRET` 已設定
- [ ] `mojan-admin` 的 `ADMIN_USERNAME` 已設定
- [ ] `mojan-admin` 的 `ADMIN_PASSWORD` 已設定
- [ ] 資料庫遷移已執行
- [ ] 所有服務都已重新部署

---

最後更新：2024年11月

