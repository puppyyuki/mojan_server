# DATABASE_URL 錯誤修正指南

## ❌ 錯誤訊息

```
Error validating datasource `db`: the URL must start with the protocol `postgresql://` or `postgres://`.
```

## 🔍 問題原因

這個錯誤表示 `DATABASE_URL` 環境變數：
1. **未設定**：環境變數不存在或為空
2. **格式錯誤**：URL 格式不正確
3. **設定錯誤**：使用了錯誤的值

## ✅ 解決方案

### 方法 1：在 Render Dashboard 中檢查環境變數

1. **進入 mojan-admin 服務設定**：
   - 在 Render Dashboard 中，點擊 `mojan-admin` 服務（或 `mojan-admin-Okuv`）
   - 點擊左側選單的 **"Environment"** 標籤

2. **檢查 DATABASE_URL**：
   - 確認 `DATABASE_URL` 環境變數存在
   - 確認值不為空
   - 確認格式正確

3. **正確的 DATABASE_URL 格式**：
   ```
   postgresql://mojan_user:gB2ggA4wLxP9iq0DIm8ucfvAZOduN1dv@dpg-d481vlkhg0os7380cm8g-a/mojan_db
   ```
   - 必須以 `postgresql://` 或 `postgres://` 開頭
   - 格式：`postgresql://username:password@hostname/database`

4. **如果 DATABASE_URL 不存在或錯誤**：
   - 點擊 **"+ Add Environment Variable"**（如果不存在）
   - 或點擊編輯圖示（如果存在但錯誤）
   - **Key**: `DATABASE_URL`
   - **Value**: 貼上正確的 Internal Database URL
   - 點擊 **"Save Changes"**

5. **重新部署服務**：
   - Render 會自動重新部署
   - 或手動點擊 **"Manual Deploy"**

### 方法 2：在 Shell 中檢查環境變數

1. **進入 mojan-admin 的 Shell**：
   - 在 Render Dashboard 中，點擊 `mojan-admin` 服務
   - 點擊左側選單的 **"Shell"** 標籤

2. **檢查環境變數**：
   ```bash
   echo $DATABASE_URL
   ```

3. **預期結果**：
   - 應該顯示完整的 Internal Database URL
   - 格式：`postgresql://mojan_user:password@dpg-xxxxx-a/mojan_db`

4. **如果結果為空或錯誤**：
   - 回到 "Environment" 標籤
   - 設定正確的 `DATABASE_URL`

### 方法 3：確認 Internal Database URL

1. **進入 mojan-database 服務**：
   - 在 Render Dashboard 中，點擊 `mojan-database` 服務

2. **找到 Internal Database URL**：
   - 在服務頁面中，找到 "Connections" 或 "Database" 區塊
   - 找到 **"Internal Database URL"**
   - **複製完整的 URL**

3. **確認 URL 格式**：
   - ✅ 正確：`postgresql://mojan_user:password@dpg-d481vlkhg0os7380cm8g-a/mojan_db`
   - ❌ 錯誤：`dpg-d481vlkhg0os7380cm8g-a`（只有主機名）
   - ❌ 錯誤：`mojan_db`（只有資料庫名）

4. **更新環境變數**：
   - 在 `mojan-admin` 和 `mojan-server` 的環境變數中
   - 更新 `DATABASE_URL` 為完整的 Internal Database URL

## 🔍 常見錯誤

### 錯誤 1：環境變數未設定

**症狀**：
```bash
echo $DATABASE_URL
# 輸出為空
```

**解決方案**：
- 在 Render Dashboard 中設定 `DATABASE_URL` 環境變數

### 錯誤 2：使用了錯誤的 URL

**症狀**：
- 使用了 External Database URL（包含 `.singapore-postgres.render.com`）
- 或只使用了主機名（沒有協議前綴）

**解決方案**：
- 使用 Internal Database URL
- 確保 URL 以 `postgresql://` 或 `postgres://` 開頭

### 錯誤 3：URL 格式不完整

**症狀**：
- URL 缺少協議前綴
- URL 缺少用戶名或密碼
- URL 缺少資料庫名稱

**解決方案**：
- 使用完整的 Internal Database URL
- 格式：`postgresql://username:password@hostname/database`

## ✅ 驗證步驟

設定完成後，驗證：

1. **檢查環境變數**：
   ```bash
   echo $DATABASE_URL
   ```
   - 確認輸出是完整的 Internal Database URL
   - 確認 URL 以 `postgresql://` 開頭

2. **測試資料庫連線**：
   ```bash
   npx prisma db pull --print
   ```
   - 如果成功，表示連線正常
   - 如果失敗，檢查錯誤訊息

3. **重新部署服務**：
   - 等待服務重新部署完成
   - 再次嘗試登入管理面板

## 📝 檢查清單

- [ ] `DATABASE_URL` 環境變數已設定
- [ ] URL 格式正確（以 `postgresql://` 開頭）
- [ ] 使用的是 Internal Database URL
- [ ] URL 包含完整的連線資訊（用戶名、密碼、主機名、資料庫名）
- [ ] 環境變數已保存並重新部署
- [ ] Shell 中的 `echo $DATABASE_URL` 顯示正確的 URL

---

最後更新：2024年11月

