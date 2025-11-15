# 後台備註功能修復說明

## 問題

1. 遊戲端可以更新備註，但後台沒有顯示
2. 後台手動更新備註時顯示失敗

## 可能的原因

1. **資料庫同步問題**：兩個服務（mojan-server 和 mojan-admin）可能連接到不同的資料庫實例
2. **API 端點問題**：後台調用的 Next.js API 路由可能有問題
3. **資料獲取問題**：後台獲取資料時可能沒有正確返回 bio 欄位

## 已完成的修復

1. ✅ 更新了 CORS headers，添加了 PATCH 方法
2. ✅ 改進了錯誤處理，提供更詳細的錯誤訊息
3. ✅ 確認了 Next.js API 路由正確處理 bio 欄位

## 檢查步驟

### 1. 確認資料庫連接

確保 `mojan-admin` 和 `mojan-server` 使用相同的 `DATABASE_URL`：

1. 進入 Render Dashboard
2. 檢查兩個服務的環境變數
3. 確認 `DATABASE_URL` 相同

### 2. 檢查後台 API 端點

在瀏覽器控制台中檢查：

1. 打開後台管理頁面
2. 打開瀏覽器開發者工具（F12）
3. 嘗試更新備註
4. 查看 Network 標籤中的請求
5. 檢查請求 URL、狀態碼和響應內容

### 3. 測試 API 端點

可以直接測試 API 端點：

```bash
# 測試獲取玩家列表（應該包含 bio）
curl https://mojan-admin-0kuv.onrender.com/api/players

# 測試更新備註
curl -X PATCH https://mojan-admin-0kuv.onrender.com/api/players/[player-id] \
  -H "Content-Type: application/json" \
  -d '{"bio":"測試備註"}'
```

## 下一步

如果問題仍然存在，請：

1. 檢查瀏覽器控制台的錯誤訊息
2. 檢查 Render 服務的日誌
3. 確認資料庫 migration 已執行（bio 欄位已添加）

