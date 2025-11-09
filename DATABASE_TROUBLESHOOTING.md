# 資料庫連線問題詳細診斷

## 🔍 診斷步驟

### 步驟 1：檢查環境變數

在 Shell 中執行以下命令：

```bash
echo $DATABASE_URL
```

**預期結果**：
- 應該顯示完整的 Internal Database URL
- 格式：`postgresql://mojan_user:password@dpg-d481vlkhg0os7380cm8g-a/mojan_db`

**如果結果為空**：
- 環境變數未設定
- 需要回到 Render Dashboard 設定 `DATABASE_URL`

**如果結果顯示 External URL**：
- 使用了錯誤的 URL
- 需要改用 Internal Database URL

### 步驟 2：檢查資料庫服務狀態

1. **進入 Render Dashboard**：
   - 找到 `mojan-database` 服務
   - 確認狀態為 "Available"（綠色）

2. **檢查服務區域**：
   - 確認 `mojan-database` 在 Singapore
   - 確認 `mojan-server` 也在 Singapore
   - 同一區域的服務才能通過私有網路通訊

### 步驟 3：檢查 Internal Database URL

1. **進入 mojan-database 服務**：
   - 在 Render Dashboard 中，點擊 `mojan-database` 服務

2. **找到 "Internal Database URL"**：
   - 在 "Connections" 或 "Database" 區塊中
   - 複製完整的 URL

3. **確認 URL 格式**：
   - ✅ 正確：`postgresql://mojan_user:password@dpg-d481vlkhg0os7380cm8g-a/mojan_db`
   - ❌ 錯誤：`postgresql://mojan_user:password@dpg-d481vlkhg0os7380cm8g-a.singapore-postgres.render.com/mojan_db`

### 步驟 4：重新設定環境變數

如果環境變數未設定或錯誤：

1. **進入 mojan-server 服務設定**：
   - 在 Render Dashboard 中，點擊 `mojan-server` 服務
   - 點擊 "Environment" 標籤

2. **檢查 DATABASE_URL**：
   - 如果不存在，點擊 "+ Add Environment Variable"
   - 如果存在，點擊編輯圖示

3. **設定正確的值**：
   - **Key**: `DATABASE_URL`
   - **Value**: 貼上剛才複製的 Internal Database URL
   - 確認使用的是 Internal URL（主機名沒有域名後綴）

4. **保存設定**：
   - 點擊 "Save Changes"
   - Render 會自動重新部署服務

5. **等待重新部署完成**：
   - 等待服務狀態變為 "Deployed"
   - 通常需要 1-2 分鐘

### 步驟 5：再次執行遷移

重新部署完成後：

1. **進入 mojan-server 的 Shell**：
   - 在 Render Dashboard 中，點擊 `mojan-server` 服務
   - 點擊 "Shell" 標籤

2. **確認環境變數**：
   ```bash
   echo $DATABASE_URL
   ```
   - 確認輸出是 Internal Database URL

3. **執行遷移**：
   ```bash
   npx prisma migrate deploy
   ```

## 🚨 常見問題

### 問題 1：環境變數未設定

**症狀**：
```bash
echo $DATABASE_URL
# 輸出為空
```

**解決方案**：
- 在 Render Dashboard 中設定 `DATABASE_URL` 環境變數

### 問題 2：使用了 External URL

**症狀**：
```bash
echo $DATABASE_URL
# 輸出包含 .singapore-postgres.render.com
```

**解決方案**：
- 改用 Internal Database URL
- Internal URL 的主機名沒有域名後綴

### 問題 3：資料庫服務未啟動

**症狀**：
- 資料庫服務狀態為 "Creating" 或 "Updating"

**解決方案**：
- 等待資料庫服務完全啟動
- 確認狀態為 "Available"

### 問題 4：服務不在同一區域

**症狀**：
- `mojan-server` 在 Oregon
- `mojan-database` 在 Singapore

**解決方案**：
- 確保所有服務在同一區域
- 建議都使用 Singapore

## ✅ 驗證步驟

執行以下命令驗證連線：

```bash
# 1. 檢查環境變數
echo $DATABASE_URL

# 2. 測試資料庫連線
npx prisma db pull --print

# 3. 執行遷移
npx prisma migrate deploy
```

## 📝 檢查清單

- [ ] 資料庫服務狀態為 "Available"
- [ ] `DATABASE_URL` 環境變數已設定
- [ ] 使用的是 Internal Database URL
- [ ] URL 格式正確（主機名沒有域名後綴）
- [ ] 服務在同一區域（Singapore）
- [ ] 環境變數已保存並重新部署
- [ ] Shell 中的 `echo $DATABASE_URL` 顯示正確的 URL

---

最後更新：2024年11月

