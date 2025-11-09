# 創建管理員帳號指南

## ❌ 問題

登入時顯示「帳號密碼錯誤」，這表示資料庫中沒有管理員帳號。

## 🔍 原因

登入邏輯是從資料庫查找用戶，而不是使用環境變數。環境變數 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 目前沒有被使用。

## ✅ 解決方案

### 方法 1：執行 Seed 腳本（推薦）

如果 `seed.ts` 中有預設帳號設定：

1. **進入 mojan-server 的 Shell**：
   - 在 Render Dashboard 中，點擊 `mojan-server` 服務
   - 點擊左側選單的 **"Shell"** 標籤

2. **執行 Seed 腳本**：
   ```bash
   npm run db:seed
   ```

3. **預設帳號**（根據 seed.ts）：
   - **用戶名**：`admin001`
   - **密碼**：`123456`

4. **使用預設帳號登入**：
   - 訪問管理後台登入頁面
   - 用戶名：`admin001`
   - 密碼：`123456`

### 方法 2：手動創建管理員帳號

如果 Seed 腳本沒有執行或沒有預設帳號：

1. **進入 mojan-server 的 Shell**：
   - 在 Render Dashboard 中，點擊 `mojan-server` 服務
   - 點擊左側選單的 **"Shell"** 標籤

2. **執行 Node.js 腳本創建帳號**：
   ```bash
   node -e "
   const { PrismaClient } = require('@prisma/client');
   const bcrypt = require('bcryptjs');
   const prisma = new PrismaClient();
   
   (async () => {
     const username = process.env.ADMIN_USERNAME || 'admin';
     const password = process.env.ADMIN_PASSWORD || 'admin123';
     const hashedPassword = await bcrypt.hash(password, 10);
     
     try {
       const user = await prisma.user.create({
         data: {
           username: username,
           password: hashedPassword,
           role: 'ADMIN'
         }
       });
       console.log('管理員帳號創建成功！');
       console.log('用戶名：', username);
       console.log('密碼：', password);
     } catch (error) {
       if (error.code === 'P2002') {
         console.log('帳號已存在，請使用現有帳號登入');
       } else {
         console.error('創建帳號失敗：', error);
       }
     } finally {
       await prisma.$disconnect();
     }
   })();
   "
   ```

3. **使用環境變數創建帳號**：
   - 腳本會自動使用 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 環境變數
   - 如果環境變數未設定，會使用預設值（`admin` / `admin123`）

4. **使用創建的帳號登入**：
   - 用戶名：使用 `ADMIN_USERNAME` 環境變數的值（或 `admin`）
   - 密碼：使用 `ADMIN_PASSWORD` 環境變數的值（或 `admin123`）

### 方法 3：使用 Prisma Studio 創建帳號

1. **進入 mojan-server 的 Shell**：
   - 在 Render Dashboard 中，點擊 `mojan-server` 服務
   - 點擊左側選單的 **"Shell"** 標籤

2. **啟動 Prisma Studio**：
   ```bash
   npx prisma studio
   ```
   - ⚠️ **注意**：Prisma Studio 需要端口轉發，在 Render Shell 中可能無法直接使用

3. **或使用 SQL 直接插入**：
   ```bash
   PGPASSWORD=your_password psql -h dpg-d481vlkhg0os7380cm8g-a -U mojan_user -d mojan_db -c "INSERT INTO users (id, username, password, role, \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid()::text, 'admin', '\$2a\$10\$encrypted_password_here', 'ADMIN', NOW(), NOW());"
   ```
   - ⚠️ **注意**：需要先加密密碼，這個方法較複雜

## 🔧 創建管理員帳號腳本

我建議創建一個簡單的腳本來創建管理員帳號：

### 步驟 1：創建腳本檔案

創建 `create-admin.js` 檔案：

```javascript
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

(async () => {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  
  console.log('正在創建管理員帳號...');
  console.log('用戶名：', username);
  
  const hashedPassword = await bcrypt.hash(password, 10);
  
  try {
    const user = await prisma.user.create({
      data: {
        username: username,
        password: hashedPassword,
        role: 'ADMIN'
      }
    });
    console.log('✅ 管理員帳號創建成功！');
    console.log('用戶名：', username);
    console.log('密碼：', password);
  } catch (error) {
    if (error.code === 'P2002') {
      console.log('⚠️ 帳號已存在，請使用現有帳號登入');
      console.log('用戶名：', username);
    } else {
      console.error('❌ 創建帳號失敗：', error);
    }
  } finally {
    await prisma.$disconnect();
  }
})();
```

### 步驟 2：執行腳本

在 Shell 中執行：

```bash
node create-admin.js
```

## 📝 檢查清單

創建帳號後，確認：

- [ ] 資料庫遷移已執行（`npx prisma migrate deploy`）
- [ ] 管理員帳號已創建
- [ ] 知道用戶名和密碼
- [ ] 可以成功登入管理面板

## ⚠️ 重要提醒

1. **密碼加密**：
   - 密碼必須使用 bcrypt 加密後存入資料庫
   - 不能直接存儲明文密碼

2. **環境變數**：
   - `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 環境變數目前沒有被登入邏輯使用
   - 這些環境變數可以用於創建帳號，但登入時需要資料庫中有對應的用戶

3. **預設帳號**：
   - 根據 `seed.ts`，預設帳號是 `admin001` / `123456`
   - 如果執行過 seed，可以使用這個帳號登入

---

最後更新：2024年11月

