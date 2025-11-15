# PATCH /api/players/:id 端點修復說明

## 問題

在生產環境中，Flutter App 嘗試更新玩家備註時出現連接錯誤。這是因為 `mojan-server` 缺少 PATCH `/api/players/:id` 端點。

## 修復內容

已在 `mojan-server` 的 `server.js` 中添加：

1. **PATCH `/api/players/:id` 端點**：支援更新玩家的 nickname、cardCount 和 bio
2. **更新 CORS headers**：在 `Access-Control-Allow-Methods` 中添加了 `PATCH`

## 部署步驟

### 1. 提交並推送更改

```bash
cd mojan_server
git add .
git commit -m "添加 PATCH /api/players/:id 端點到 mojan-server"
git push origin main
```

### 2. 等待 Render 重新部署

1. 前往 Render Dashboard
2. 進入 `mojan-server` 服務
3. 等待自動部署完成（或手動觸發部署）
4. 確認部署成功

### 3. 驗證端點

部署完成後，可以測試端點：

```bash
# 測試 PATCH 端點（更新備註）
curl -X PATCH https://mojan-server-0kuv.onrender.com/api/players/[player-id] \
  -H "Content-Type: application/json" \
  -d '{"bio":"這是我的備註"}'
```

### 4. 驗證 Flutter 應用

1. 訪問生產環境的 Flutter App
2. 進入個人資料頁面
3. 編輯備註並點擊「更新」
4. 應該可以成功保存

## 技術細節

### 端點功能

- **PATCH `/api/players/:id`**：更新玩家資訊
  - 支援更新 `nickname`、`cardCount`、`bio`
  - 如果更新暱稱，會檢查是否重複
  - 返回更新後的玩家資料

### CORS 設定

端點使用 `CORS_ORIGIN` 環境變數來設定允許的來源。如果未設定，則允許所有來源（`*`）。

### 資料庫

使用 Prisma Client 來更新玩家資料。

## 注意事項

⚠️ **重要**：
- 確保 `mojan-server` 的 `DATABASE_URL` 環境變數已正確設定
- 確保 `mojan-server` 的 `CORS_ORIGIN` 環境變數已設定為 `https://mojan-app.onrender.com`
- 確保資料庫 migration 已執行（bio 欄位已添加）

