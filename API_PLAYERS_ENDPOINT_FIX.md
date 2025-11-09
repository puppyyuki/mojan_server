# API /api/players 端點修正說明

## 問題

Flutter 應用嘗試連接到 `https://mojan-server.onrender.com/api/players`，但 `mojan-server`（Socket.io 伺服器）沒有這個端點。這個端點原本只在 `mojan-admin`（Next.js 管理後台）中。

## 修正內容

已在 `mojan-server` 的 `server.js` 中添加 `/api/players` 端點：

1. **添加 `generateUniqueId` 函數**：生成唯一的6位數字ID
2. **添加 CORS headers helper**：設定 CORS 標頭
3. **添加 OPTIONS 處理**：處理 CORS preflight 請求
4. **添加 GET /api/players 端點**：獲取所有玩家
5. **添加 POST /api/players 端點**：創建玩家（通過暱稱）

## 部署步驟

### 1. 提交並推送更改

```bash
cd mojan_server
git add .
git commit -m "添加 /api/players 端點到 mojan-server"
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
curl https://mojan-server.onrender.com/api/players

# 測試 POST 端點
curl -X POST https://mojan-server.onrender.com/api/players \
  -H "Content-Type: application/json" \
  -d '{"nickname":"測試玩家"}'
```

### 4. 驗證 Flutter 應用

1. 訪問 `https://mojan-app.onrender.com/`
2. 輸入暱稱
3. 點擊「進入遊戲」
4. 應該可以正常登入

## 技術細節

### 端點實作

- **GET /api/players**：返回所有玩家列表
- **POST /api/players**：創建新玩家或返回現有玩家（如果暱稱已存在）

### CORS 設定

端點使用 `CORS_ORIGIN` 環境變數來設定允許的來源。如果未設定，則允許所有來源（`*`）。

### 資料庫

使用 Prisma Client 來查詢和創建玩家資料。

## 注意事項

⚠️ **重要**：
- 確保 `mojan-server` 的 `DATABASE_URL` 環境變數已正確設定
- 確保 `mojan-server` 的 `CORS_ORIGIN` 環境變數已設定為 `https://mojan-app.onrender.com`
- 確保資料庫連接正常

