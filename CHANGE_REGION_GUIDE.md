# 更改 Render 服務區域指南

## 📋 更改服務區域的步驟

### 方法 1：在服務設定中更改（現有服務）

#### 對於 mojan-server 和 mojan-admin：

1. **進入服務設定**：
   - 在 Render Dashboard 中，點擊要更改的服務（例如：`mojan-server`）
   - 點擊左側選單的 **"Settings"** 標籤

2. **找到 Region 設定**：
   - 在設定頁面中，找到 **"Region"** 區塊
   - 點擊 **"Change Region"** 或編輯按鈕

3. **選擇新區域**：
   - 選擇您想要的區域（例如：`Singapore` 或 `Oregon`）
   - 確認變更

4. **保存設定**：
   - 點擊 **"Save Changes"**
   - Render 會自動重新部署服務到新區域

#### 對於 mojan-database（資料庫）：

⚠️ **注意**：資料庫區域更改可能需要：
- 刪除現有資料庫並重新創建
- 或聯繫 Render 支援協助遷移

1. **進入資料庫設定**：
   - 在 Render Dashboard 中，點擊 `mojan-database` 服務
   - 點擊 **"Settings"** 標籤

2. **檢查區域選項**：
   - 查看是否有 "Change Region" 選項
   - 如果沒有，可能需要重新創建資料庫

### 方法 2：使用 Blueprint 重新部署（推薦）

如果使用 Blueprint，可以更新 `render.yaml`：

1. **編輯 render.yaml**：
   - 在 `mojan_server/render.yaml` 中，為每個服務添加 `region` 屬性

2. **更新設定**：
   ```yaml
   services:
     - type: web
       name: mojan-server
       runtime: node
       plan: starter
       region: singapore  # 添加這行
       # ... 其他設定
   ```

3. **提交變更**：
   ```bash
   git add render.yaml
   git commit -m "更改服務區域為 Singapore"
   git push origin main
   ```

4. **在 Render 中重新載入 Blueprint**：
   - Render 會自動偵測變更
   - 或手動重新載入 Blueprint

### 方法 3：重新創建服務（最後手段）

如果無法更改現有服務的區域：

1. **刪除現有服務**：
   - 在 Render Dashboard 中，刪除需要更改區域的服務
   - ⚠️ **注意**：這會刪除所有資料，請先備份

2. **重新創建服務**：
   - 使用 Blueprint 或手動創建
   - 選擇正確的區域（例如：Singapore）

## 🎯 建議的區域設定

### 所有服務在同一區域（推薦）

為了確保服務之間可以通過私有網路通訊，建議：

1. **mojan-database**: `Singapore`
2. **mojan-server**: `Singapore`
3. **mojan-admin**: `Singapore`
4. **mojan-app**: `Singapore`（或 Global，因為是 Static Site）

### 為什麼要在同一區域？

- ✅ **更快的連線速度**：同一區域的服務可以通過私有網路通訊
- ✅ **更低的延遲**：減少網路延遲
- ✅ **更低的成本**：同一區域內的流量通常免費

## 📝 檢查當前區域

### 在 Render Dashboard 中：

1. **查看服務列表**：
   - 在 Dashboard 中，每個服務都會顯示區域
   - 例如：`Singapore (Southeast Asia)` 或 `Oregon (US West)`

2. **查看服務詳情**：
   - 點擊服務進入詳情頁
   - 在 "Settings" 標籤中查看區域設定

## ⚠️ 重要提醒

### 1. 資料庫區域更改

- 資料庫區域更改可能需要重新創建
- 如果資料庫中有資料，請先備份
- 考慮使用 `pg_dump` 備份資料

### 2. 環境變數更新

- 更改區域後，可能需要更新 `DATABASE_URL`
- Internal Database URL 會根據區域改變
- 確保使用新區域的 Internal Database URL

### 3. 服務重新部署

- 更改區域後，服務會自動重新部署
- 可能需要幾分鐘時間
- 等待所有服務狀態變為 "Deployed"

## ✅ 檢查清單

更改區域後，確認：

- [ ] 所有服務都在同一區域（例如：Singapore）
- [ ] 服務狀態為 "Deployed"
- [ ] `DATABASE_URL` 已更新為新區域的 Internal URL
- [ ] 資料庫遷移已執行
- [ ] 所有服務都能正常連線

---

最後更新：2024年11月

