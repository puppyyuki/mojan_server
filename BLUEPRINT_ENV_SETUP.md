# Blueprint 環境變數設定指南

## 📋 在 Blueprint 配置介面中設定環境變數

### 第一步：設定 mojan-admin 的環境變數

在 "Create web service mojan-admin-Okuv (Starter)" 區塊中：

#### 1. DATABASE_URL
- **點擊 "Enter value" 欄位**
- **貼上您的 PostgreSQL URL**：
  ```
  postgresql://mojan_user:gB2ggA4wLxP9iq0DIm8ucfvAZOduN1dv@dpg-d481vlkhg0os7380cm8g-a/mojan_db
  ```
- **確認 URL 格式正確**（主機名沒有域名後綴，這是 Internal URL）

#### 2. JWT_SECRET
- **點擊 "Generate" 按鈕**（右側的魔術棒圖示）
- Render 會自動生成一個安全的隨機字串
- **不要手動輸入**，使用自動生成的值
- **記住這個值**（或複製保存），稍後 mojan-server 也需要使用相同的值

#### 3. ADMIN_USERNAME
- **點擊 "Enter value" 欄位**
- **輸入管理員用戶名**（例如：`admin` 或 `mojan_admin`）
- 這是您用來登入管理面板的用戶名

#### 4. ADMIN_PASSWORD
- **點擊 "Enter value" 欄位**
- **輸入管理員密碼**（建議使用強密碼）
- **記住這個密碼**，稍後登入管理面板時需要用到

### 第二步：設定 mojan-server 的環境變數

在 "Create web service mojan-server-Okuv (Starter)" 區塊中：

#### 1. DATABASE_URL
- **點擊 "Enter value" 欄位**
- **貼上相同的 PostgreSQL URL**：
  ```
  postgresql://mojan_user:gB2ggA4wLxP9iq0DIm8ucfvAZOduN1dv@dpg-d481vlkhg0os7380cm8g-a/mojan_db
  ```
- 兩個服務使用同一個資料庫

#### 2. JWT_SECRET
- **點擊 "Generate" 按鈕**（右側的魔術棒圖示）
- **建議**：使用與 mojan-admin 相同的 JWT_SECRET
  - 如果兩個服務需要互相驗證，使用相同的值
  - 或者手動輸入剛才 mojan-admin 生成的 JWT_SECRET

### 第三步：確認設定

1. **檢查所有環境變數**：
   - ✅ `mojan-admin` 的 `DATABASE_URL` 已設定
   - ✅ `mojan-admin` 的 `JWT_SECRET` 已生成
   - ✅ `mojan-admin` 的 `ADMIN_USERNAME` 已輸入
   - ✅ `mojan-admin` 的 `ADMIN_PASSWORD` 已輸入
   - ✅ `mojan-server` 的 `DATABASE_URL` 已設定
   - ✅ `mojan-server` 的 `JWT_SECRET` 已生成（建議與 mojan-admin 相同）

2. **檢查服務選項**：
   - 確認選擇了 **"Create all as new services"**（已選中）
   - 這會創建新的服務，而不是關聯現有服務

### 第四步：創建服務

1. **點擊 "Apply" 或 "Create" 按鈕**
2. **等待服務創建完成**（約 5-10 分鐘）
3. **檢查部署狀態**：
   - 確認所有服務狀態變為 "Deployed"
   - 檢查部署日誌，確認沒有錯誤

## ⚠️ 重要提醒

### 1. DATABASE_URL 格式

您提供的 URL 格式是正確的：
```
postgresql://mojan_user:gB2ggA4wLxP9iq0DIm8ucfvAZOduN1dv@dpg-d481vlkhg0os7380cm8g-a/mojan_db
```

這是 **Internal Database URL**，特點：
- ✅ 主機名：`dpg-d481vlkhg0os7380cm8g-a`（沒有域名後綴）
- ✅ 格式正確，可以在 Render 內部使用

### 2. JWT_SECRET 一致性

- **如果兩個服務需要互相驗證**：使用相同的 `JWT_SECRET`
- **如果兩個服務是獨立的**：可以使用不同的值
- **建議**：使用相同的值，以便未來擴展

### 3. 敏感資訊安全

- **不要**將這些值提交到 Git
- **只在 Render Dashboard 中設定**
- **記住** `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`（用於登入管理面板）

## ✅ 設定完成後

### 1. 執行資料庫遷移

服務創建完成後：

1. **進入 mojan-server 服務**：
   - 在 Render Dashboard 中，點擊 `mojan-server-Okuv` 服務

2. **打開 Shell**：
   - 點擊左側選單的 "Shell" 標籤

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
   - 訪問健康檢查端點：`https://mojan-server-okuv.onrender.com/health`

2. **檢查 mojan-admin**：
   - 確認服務狀態為 "Deployed"
   - 訪問管理面板：`https://mojan-admin-okuv.onrender.com/admin/login`

---

最後更新：2024年11月

