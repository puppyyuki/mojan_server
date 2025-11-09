# mojan_server GitHub 設定指南

## ✅ 是的，mojan_server 也需要上 GitHub

因為 Render 需要從 GitHub 部署，所以 `mojan_server` 也必須推送到 GitHub。

## 📋 設定步驟

### 第一步：初始化 Git Repository

在 `mojan_server` 目錄中執行：

```bash
cd mojan_server
git init
git add .
git commit -m "Initial commit: 麻將遊戲伺服器"
```

### 第二步：創建 GitHub Repository

1. **前往 GitHub**：
   - 登入 [GitHub](https://github.com)
   - 點擊右上角 "+" → "New repository"

2. **建立新 Repository**：
   - **Repository name**: `mojan_server`
   - **Description**: `麻將遊戲伺服器`
   - **Visibility**: Public 或 Private（根據您的需求）
   - **不要**勾選 "Initialize this repository with a README"（因為本地已有檔案）
   - **不要**勾選 "Add .gitignore"（因為本地已有）
   - **不要**勾選 "Choose a license"（可選）

3. **點擊 "Create repository"**

### 第三步：連接並推送到 GitHub

在 `mojan_server` 目錄中執行：

```bash
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/mojan_server.git
git push -u origin main
```

**注意**：將 `YOUR_USERNAME` 替換為您的 GitHub 用戶名。

### 第四步：驗證

1. **檢查 GitHub Repository**：
   - 前往 `https://github.com/YOUR_USERNAME/mojan_server`
   - 確認所有檔案都已上傳

2. **檢查 Git 狀態**：
   ```bash
   git remote -v
   ```
   - 應該顯示您的 GitHub repository URL

## 🔧 在 Render 中部署

### 使用 Blueprint (render.yaml)

1. **在 Render Dashboard 中**：
   - 點擊 "New +" → "Blueprint"
   - 選擇 `mojan_server` repository
   - Render 會自動讀取 `render.yaml` 設定

2. **設定環境變數**：
   - 在 Render Dashboard 中設定：
     - `DATABASE_URL`（從 PostgreSQL service 複製）
     - `JWT_SECRET`（使用 Generate 按鈕生成）
     - `CORS_ORIGIN`（等 mojan_app 部署後再設定）

### 手動設定

如果不想使用 Blueprint，可以手動創建：

1. **創建 PostgreSQL Database**：
   - 點擊 "New +" → "PostgreSQL"
   - 名稱：`mojan-database`
   - 複製 "Internal Database URL"

2. **創建 Web Service**：
   - 點擊 "New +" → "Web Service"
   - 選擇 `mojan_server` repository
   - 設定：
     - **Build Command**: `npm install && npx prisma generate`
     - **Start Command**: `npm start`
     - **Environment**: `Node`

3. **設定環境變數**：
   - `NODE_ENV`: `production`
   - `DATABASE_URL`: （從 PostgreSQL 複製）
   - `JWT_SECRET`: （使用 Generate 按鈕生成）
   - `CORS_ORIGIN`: `https://mojan-app.onrender.com`（等 app 部署後再設定）

4. **執行資料庫遷移**：
   - 在 Render 的 Shell 中執行：
   ```bash
   npx prisma migrate deploy
   ```

## 📝 重要提醒

1. **敏感資訊**：
   - `DATABASE_URL` 和 `JWT_SECRET` 是敏感資訊
   - 在 `render.yaml` 中已設定為 `sync: false`
   - **必須**在 Render Dashboard 中手動設定
   - **不要**將這些值提交到 Git

2. **.gitignore**：
   - 確認 `.gitignore` 已正確設定
   - 應該排除 `node_modules/`、`.env` 等

3. **Prisma**：
   - 確認 `prisma/schema.prisma` 已提交
   - 確認 `prisma/migrations/` 已提交

## ✅ 檢查清單

- [ ] Git repository 已初始化
- [ ] GitHub repository 已創建
- [ ] 所有檔案已推送到 GitHub
- [ ] `.gitignore` 正確設定
- [ ] `render.yaml` 已提交
- [ ] 敏感資訊（`.env`）已排除

---

最後更新：2024年11月

