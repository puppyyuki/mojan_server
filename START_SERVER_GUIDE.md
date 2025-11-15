# 啟動後端服務指南

## 問題說明

如果看到錯誤訊息：`Failed to fetch, uri=http://localhost:3001/api/players/...`

這表示前端無法連接到後端 API 服務。

## 解決方案

### 方法 1：啟動 Next.js Admin Panel（推薦）

Next.js Admin Panel 提供 API 端點，運行在 port 3001：

```bash
cd mojan_server
npm run admin:dev
```

這會啟動開發模式，API 端點會在 `http://localhost:3001/api` 可用。

### 方法 2：同時啟動所有服務

如果需要同時運行 Socket.io 服務器和 Next.js Admin Panel：

```bash
cd mojan_server
npm run dev:all
```

這會同時啟動：
- Socket.io 服務器（port 3000）
- Next.js Admin Panel（port 3001）

### 方法 3：生產模式啟動

```bash
cd mojan_server
npm run admin:start
```

## 驗證服務是否運行

啟動後，訪問以下 URL 確認服務正常：

1. **API 健康檢查**：`http://localhost:3001/api/players`
   - 應該返回玩家列表（JSON 格式）

2. **管理面板**：`http://localhost:3001/admin/login`
   - 應該顯示登入頁面

## 注意事項

- 確保資料庫已正確配置（`.env` 文件中的 `DATABASE_URL`）
- 確保已執行 `npx prisma db push` 或 `npx prisma migrate dev` 來同步資料庫結構
- 如果使用生產環境，確保環境變數已正確設定

