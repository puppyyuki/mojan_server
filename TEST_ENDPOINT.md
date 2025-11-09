# 測試 /api/players 端點

## 問題

Flutter 應用嘗試連接到 `https://mojan-server.onrender.com/api/players`，但請求失敗。

## 可能的原因

1. **`mojan-server` 還沒有部署包含 `/api/players` 端點的版本**
2. **`mojan-server` 服務沒有運行或無法訪問**
3. **資料庫連接問題**
4. **CORS 設定問題**

## 檢查步驟

### 1. 確認更改已推送到 GitHub

```bash
cd mojan_server
git log origin/main..HEAD --oneline
```

如果沒有輸出，表示所有更改都已推送到遠端。

如果有輸出，請推送：

```bash
git push origin main
```

### 2. 確認 Render 已重新部署

1. **前往 Render Dashboard**：
   - 進入 `mojan-server` 服務
   - 查看 **"Events"** 或 **"Logs"** 標籤

2. **檢查部署狀態**：
   - 確認最後一次部署是否成功
   - 確認部署時間是否在提交之後

3. **手動觸發重新部署**（如果需要）：
   - 點擊 **"Manual Deploy"** → **"Deploy latest commit"**
   - 等待部署完成

### 3. 測試端點

部署完成後，可以測試端點：

#### 方法 1：使用 curl（命令列）

```bash
# 測試 GET 端點
curl https://mojan-server.onrender.com/api/players

# 測試 POST 端點
curl -X POST https://mojan-server.onrender.com/api/players \
  -H "Content-Type: application/json" \
  -d "{\"nickname\":\"測試玩家\"}"
```

#### 方法 2：使用瀏覽器

1. **測試 GET 端點**：
   - 在瀏覽器中訪問：`https://mojan-server.onrender.com/api/players`
   - 應該返回 JSON 格式的玩家列表

2. **測試 POST 端點**：
   - 使用瀏覽器開發者工具（F12）
   - 在 Console 中執行：
     ```javascript
     fetch('https://mojan-server.onrender.com/api/players', {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
       },
       body: JSON.stringify({ nickname: '測試玩家' })
     })
     .then(response => response.json())
     .then(data => console.log(data))
     .catch(error => console.error('Error:', error));
     ```

#### 方法 3：使用 Postman 或類似工具

1. **GET 請求**：
   - URL: `https://mojan-server.onrender.com/api/players`
   - Method: GET

2. **POST 請求**：
   - URL: `https://mojan-server.onrender.com/api/players`
   - Method: POST
   - Headers: `Content-Type: application/json`
   - Body (JSON):
     ```json
     {
       "nickname": "測試玩家"
     }
     ```

### 4. 檢查 Render 日誌

如果端點測試失敗，請檢查 Render 日誌：

1. **前往 Render Dashboard**：
   - 進入 `mojan-server` 服務
   - 點擊 **"Logs"** 標籤

2. **查看錯誤訊息**：
   - 查找與 `/api/players` 相關的錯誤
   - 查找資料庫連接錯誤
   - 查找 Prisma 相關錯誤

### 5. 檢查環境變數

確認 `mojan-server` 的環境變數已正確設定：

1. **前往 Render Dashboard**：
   - 進入 `mojan-server` 服務
   - 點擊 **"Environment"** 標籤

2. **確認以下環境變數**：
   - `DATABASE_URL`：必須設定為資料庫的 Internal URL
   - `CORS_ORIGIN`：應該設定為 `https://mojan-app.onrender.com`
   - `NODE_ENV`：應該設定為 `production`
   - `PORT`：Render 會自動設定

## 常見錯誤

### 錯誤 1：404 Not Found

**原因**：端點不存在或路由設定錯誤

**解決方案**：
- 確認 `server.js` 中包含 `/api/players` 端點
- 確認端點已正確部署

### 錯誤 2：500 Internal Server Error

**原因**：伺服器內部錯誤（通常是資料庫連接問題）

**解決方案**：
- 檢查 `DATABASE_URL` 是否正確設定
- 檢查資料庫是否可訪問
- 查看 Render 日誌以獲取詳細錯誤訊息

### 錯誤 3：CORS 錯誤

**原因**：CORS 設定不正確

**解決方案**：
- 確認 `CORS_ORIGIN` 環境變數已設定
- 確認 `setCorsHeaders` 函數正確設定標頭

### 錯誤 4：Failed to fetch

**原因**：網路連接問題或伺服器無法訪問

**解決方案**：
- 確認 `mojan-server` 服務正在運行
- 確認服務 URL 正確
- 檢查 Render 服務狀態

## 驗證清單

- [ ] 更改已推送到 GitHub
- [ ] Render 已重新部署
- [ ] 端點測試成功（GET 和 POST）
- [ ] 環境變數已正確設定
- [ ] 資料庫連接正常
- [ ] CORS 設定正確

## 下一步

如果所有檢查都通過，但 Flutter 應用仍然無法連接：

1. **清除瀏覽器快取**：
   - 按 Ctrl+Shift+Delete
   - 清除快取和 Cookie

2. **重新載入應用**：
   - 按 Ctrl+F5 強制重新載入

3. **檢查瀏覽器控制台**：
   - 按 F12 打開開發者工具
   - 查看 Console 和 Network 標籤
   - 查找詳細錯誤訊息

