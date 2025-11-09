# 資料庫連線問題解決方案

## ❌ 錯誤訊息

```
Error: P1001: Can't reach database server at `dpg-d481vlkhg0os7380cm8g-a:5432`
```

## 🔍 可能的原因

### 1. 環境變數未設定或設定錯誤

Prisma 無法找到正確的 `DATABASE_URL` 環境變數。

### 2. 使用了錯誤的 URL

可能使用了 External Database URL 而不是 Internal Database URL。

### 3. 資料庫服務還沒完全啟動

資料庫可能還在初始化中。

## ✅ 解決方案

### 方法 1：檢查環境變數（推薦）

1. **確認 DATABASE_URL 已設定**：
   - 在 Render Dashboard 中，進入 `mojan-server` 服務
   - 點擊 "Environment" 標籤
   - 確認 `DATABASE_URL` 已設定
   - 確認使用的是 **Internal Database URL**（不是 External）

2. **Internal Database URL 格式**：
   ```
   postgresql://mojan_user:password@dpg-d481vlkhg0os7380cm8g-a/mojan_db
   ```
   - 注意：主機名是 `dpg-d481vlkhg0os7380cm8g-a`（沒有 `.singapore-postgres.render.com`）

3. **External Database URL 格式**（錯誤）：
   ```
   postgresql://mojan_user:password@dpg-d481vlkhg0os7380cm8g-a.singapore-postgres.render.com/mojan_db
   ```
   - 這個 URL 用於外部連接，在 Render 內部應該使用 Internal URL

### 方法 2：重新設定環境變數

1. **進入 mojan-server 服務設定**：
   - 在 Render Dashboard 中，點擊 `mojan-server` 服務
   - 點擊 "Environment" 標籤

2. **檢查 DATABASE_URL**：
   - 如果 `DATABASE_URL` 不存在，添加它
   - 如果 `DATABASE_URL` 存在，檢查是否正確

3. **取得正確的 Internal Database URL**：
   - 進入 `mojan-database` 服務
   - 找到 "Internal Database URL"
   - 複製完整的 URL

4. **更新 DATABASE_URL**：
   - 在 `mojan-server` 的環境變數中
   - 更新 `DATABASE_URL` 為剛才複製的 Internal Database URL
   - 點擊 "Save Changes"

5. **重新部署服務**：
   - Render 會自動重新部署
   - 或手動點擊 "Manual Deploy"

### 方法 3：等待資料庫啟動

如果資料庫剛創建：

1. **檢查資料庫狀態**：
   - 在 Render Dashboard 中，進入 `mojan-database` 服務
   - 確認狀態為 "Available"（不是 "Creating" 或 "Updating"）

2. **等待資料庫完全啟動**：
   - 資料庫創建可能需要 1-2 分鐘
   - 等待狀態變為 "Available"

3. **再次執行遷移**：
   ```bash
   npx prisma migrate deploy
   ```

### 方法 4：在 Shell 中檢查環境變數

1. **進入 mojan-server 的 Shell**：
   - 在 Render Dashboard 中，點擊 `mojan-server` 服務
   - 點擊 "Shell" 標籤

2. **檢查環境變數**：
   ```bash
   echo $DATABASE_URL
   ```
   - 確認輸出是 Internal Database URL
   - 確認 URL 格式正確

3. **如果環境變數不存在或錯誤**：
   - 回到 "Environment" 標籤
   - 設定正確的 `DATABASE_URL`

## 🔍 驗證 Internal Database URL 格式

正確的 Internal Database URL 應該：
- ✅ 主機名：`dpg-d481vlkhg0os7380cm8g-a`（沒有域名後綴）
- ✅ 端口：`5432`（預設 PostgreSQL 端口）
- ✅ 用戶名：`mojan_user`
- ✅ 資料庫名：`mojan_db`
- ✅ 格式：`postgresql://username:password@hostname/database`

錯誤的 URL（External）：
- ❌ 主機名：`dpg-d481vlkhg0os7380cm8g-a.singapore-postgres.render.com`（有域名後綴）

## 📝 檢查清單

- [ ] 資料庫服務狀態為 "Available"
- [ ] `DATABASE_URL` 環境變數已設定
- [ ] 使用的是 Internal Database URL（不是 External）
- [ ] URL 格式正確（主機名沒有域名後綴）
- [ ] 環境變數已保存並重新部署

## 🚨 如果仍然失敗

1. **檢查資料庫服務日誌**：
   - 進入 `mojan-database` 服務
   - 查看 "Logs" 標籤
   - 確認沒有錯誤訊息

2. **檢查網路連線**：
   - 確認 `mojan-server` 和 `mojan-database` 在同一區域（Singapore）
   - 同一區域的服務可以通過私有網路通訊

3. **重新創建資料庫**（最後手段）：
   - 如果問題持續，可能需要重新創建資料庫
   - 確保使用正確的設定

---

最後更新：2024年11月

