# API /api/clubs 端點修正說明

## 問題

Flutter 應用嘗試連接到 `https://mojan-server-0kuv.onrender.com/api/clubs`，但 `mojan-server`（Socket.io 伺服器）沒有這個端點。這個端點原本只在 `mojan-admin`（Next.js 管理後台）中。

## 修正內容

已在 `mojan-server` 的 `server.js` 中添加 `/api/clubs` 端點：

1. **GET /api/clubs**：獲取所有俱樂部列表
2. **POST /api/clubs**：創建俱樂部

## 還需要添加的端點

Flutter 應用還需要以下端點（將在後續添加）：

1. **GET /api/clubs/:clubId/rooms**：獲取俱樂部房間列表
2. **POST /api/clubs/:clubId/rooms**：創建房間
3. **GET /api/players/:playerId/clubs**：獲取玩家加入的俱樂部列表
4. **POST /api/clubs/:clubId/members**：加入俱樂部
5. **DELETE /api/clubs/:clubId/members**：退出俱樂部

## 部署步驟

### 1. 提交並推送更改

```bash
cd mojan_server
git add .
git commit -m "添加 /api/clubs 端點到 mojan-server"
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
# 測試 GET 端點
curl https://mojan-server-0kuv.onrender.com/api/clubs

# 測試 POST 端點
curl -X POST https://mojan-server-0kuv.onrender.com/api/clubs \
  -H "Content-Type: application/json" \
  -d '{"name":"測試俱樂部","creatorId":"玩家ID"}'
```

### 4. 驗證 Flutter 應用

1. 訪問 `https://mojan-app.onrender.com/`
2. 登入後，進入俱樂部頁面
3. 嘗試創建俱樂部
4. 應該可以正常創建

## 技術細節

### 端點實作

- **GET /api/clubs**：返回所有俱樂部列表（包含創建者和成員資訊）
- **POST /api/clubs**：創建新俱樂部並將創建者添加為成員

### CORS 設定

端點使用 `CORS_ORIGIN` 環境變數來設定允許的來源。如果未設定，則允許所有來源（`*`）。

### 資料庫

使用 Prisma Client 來查詢和創建俱樂部資料。

## 注意事項

⚠️ **重要**：
- 確保 `mojan-server` 的 `DATABASE_URL` 環境變數已正確設定
- 確保 `mojan-server` 的 `CORS_ORIGIN` 環境變數已設定為 `https://mojan-app.onrender.com`
- 確保資料庫連接正常

