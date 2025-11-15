# Prisma Client 修復說明

## 問題

生產環境的 `mojan-admin` 服務出現錯誤：
```
Unknown argument `bio`. Did you mean `id`?
```

## 原因

`mojan-admin` 服務在部署時沒有重新生成 Prisma Client，導致它不認識新添加的 `bio` 欄位。

## 解決方案

### 方案 1：更新 render.yaml（推薦）

已更新 `render.yaml`，在 `mojan-admin` 的 `buildCommand` 中添加了 `npx prisma generate`：

```yaml
buildCommand: npm install && npx prisma generate && npm run build
```

**下一步：**
1. 提交並推送更改到 GitHub
2. Render 會自動重新部署 `mojan-admin` 服務
3. 部署完成後，Prisma Client 會包含 `bio` 欄位

### 方案 2：手動執行（臨時解決）

如果急需修復，可以在 Render Dashboard 中手動執行：

1. **進入 mojan-admin 服務**：
   - 在 Render Dashboard 中，點擊 `mojan-admin` 服務

2. **打開 Shell**：
   - 點擊左側選單的 **"Shell"** 標籤

3. **執行命令**：
   ```bash
   npx prisma generate
   ```

4. **重啟服務**：
   - 點擊 **"Manual Deploy"** → **"Deploy latest commit"**

### 方案 3：執行資料庫 Migration

如果資料庫還沒有 `bio` 欄位，需要執行 migration：

1. **進入 mojan-admin 服務的 Shell**

2. **執行 migration**：
   ```bash
   npx prisma migrate deploy
   ```

3. **重新生成 Prisma Client**：
   ```bash
   npx prisma generate
   ```

## 驗證

修復後，可以測試：

1. **訪問後台管理頁面**
2. **嘗試編輯玩家的備註**
3. **應該可以成功更新**

## 注意事項

⚠️ **重要**：
- 確保 `mojan-admin` 和 `mojan-server` 使用相同的 `DATABASE_URL`
- 確保兩個服務都執行過 migration（資料庫結構一致）
- 確保兩個服務都重新生成了 Prisma Client

