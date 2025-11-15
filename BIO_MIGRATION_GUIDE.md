# 備註欄位 Migration 指南

## 步驟 1: 創建 Migration

在 `mojan_server` 目錄下運行：

```bash
npx prisma migrate dev --name add_bio_to_player
```

這會：
1. 創建 migration 文件
2. 更新資料庫結構
3. 重新生成 Prisma Client

## 步驟 2: 驗證 Migration

檢查 `prisma/migrations` 目錄下是否有新的 migration 文件，應該包含類似：

```sql
ALTER TABLE "players" ADD COLUMN "bio" TEXT;
```

## 步驟 3: 重新生成 Prisma Client

如果 migration 成功，Prisma Client 會自動重新生成。如果需要手動重新生成：

```bash
npx prisma generate
```

## 完成

完成後，備註功能就可以正常使用了！

