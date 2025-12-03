# App Store Connect API 設定指南

## 📋 概述

您的 iOS 內購系統已升級支援 **App Store Server API**（使用 App Store Connect API 金鑰）。這是 Apple 推薦的新驗證方式，舊的 Receipt Validation API 將於 2025 年 11 月 20 日停止支援。

## ✅ 升級優勢

1. **更安全**：使用 JWT 認證，無需共享密鑰
2. **更快速**：直接查詢交易，無需驗證整個收據
3. **更可靠**：Apple 官方推薦的新 API
4. **向後兼容**：如果未設定新 API，會自動降級使用舊 API

## 🔑 兩種金鑰的差異

App Store Server API 可以使用兩種金鑰：

### 1. App Store Connect API 金鑰（通用）
- **用途**：用於所有 App Store Connect API 操作
- **位置**：使用者與存取權限 → 整合 → App Store Connect API
- **適用場景**：需要多種 API 操作（如管理應用程式、查詢訂閱等）

### 2. App 內購買項目金鑰（專用）⭐ 推薦
- **用途**：專門用於 App Store Server API 的內購相關操作
- **位置**：使用者與存取權限 → 整合 → App 內購買項目
- **適用場景**：只用於驗證內購交易（我們的使用場景）

**建議**：如果您的應用程式只有內購功能，建議使用 **App 內購買項目金鑰**（更專用、更安全）

## 🔑 獲取金鑰

### 選項 A: 使用 App 內購買項目金鑰（推薦）⭐

1. 登入 [App Store Connect](https://appstoreconnect.apple.com)
2. 前往「使用者與存取權限」→「整合」→「App 內購買項目」
3. 點擊「產生 App 內購買項目金鑰」
4. 輸入金鑰名稱（例如：`Mojan IAP Key`）
5. 點擊「產生」
6. **重要**：下載 .p8 檔案（只能下載一次，請妥善保管）
7. 記錄 **Key ID**（會顯示在頁面上）

### 選項 B: 使用 App Store Connect API 金鑰

根據您提供的截圖，您已經有 App Store Connect API 金鑰：

- **Issuer ID**: `2a767e1c-6381-42cb-9a68-3c6b57da58bb`
- **Key ID**: 從您的金鑰列表中選擇一個（例如：`22J82XK7QS` 或 `PSPX6DRLFC`）

1. 登入 [App Store Connect](https://appstoreconnect.apple.com)
2. 前往「使用者與存取權限」→「整合」→「App Store Connect API」
3. 選擇您要使用的金鑰（建議使用「Mojan App Build」）
4. 點擊「下載 API 金鑰」（.p8 檔案）
5. **重要**：此檔案只能下載一次，請妥善保管

### 步驟 2: 獲取私鑰內容

打開下載的 .p8 檔案，複製整個私鑰內容，包括：
```
-----BEGIN PRIVATE KEY-----
[私鑰內容]
-----END PRIVATE KEY-----
```

## 🔧 環境變數設定

在您的伺服器環境變數中設定以下值：

### 必要環境變數

```bash
# App Store Connect API 設定（新的 App Store Server API）
APP_STORE_CONNECT_ISSUER_ID=2a767e1c-6381-42cb-9a68-3c6b57da58bb
APP_STORE_CONNECT_KEY_ID=PSPX6DRLFC  # 或您選擇的金鑰 ID
APP_STORE_CONNECT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n[您的私鑰內容]\n-----END PRIVATE KEY-----"
APP_STORE_CONNECT_BUNDLE_ID=com.example.mojanApp
```

### 可選環境變數（向後兼容）

如果您暫時不想升級，可以繼續使用舊的 API：

```bash
# 舊的 Receipt Validation API（將於 2025 年 11 月停止支援）
APPLE_SHARED_SECRET=your_shared_secret_here
APPLE_SANDBOX=false  # true 為沙盒環境，false 為正式環境
```

## 📝 設定說明

### APP_STORE_CONNECT_ISSUER_ID
- **值**: `2a767e1c-6381-42cb-9a68-3c6b57da58bb`
- **說明**: 從 App Store Connect 頁面複製的 Issuer ID

### APP_STORE_CONNECT_KEY_ID
- **值**: 您的金鑰 ID
  - 如果使用 App 內購買項目金鑰：從「App 內購買項目」頁面複製 Key ID
  - 如果使用 App Store Connect API 金鑰：例如 `PSPX6DRLFC`
- **說明**: 金鑰的唯一識別碼
- **建議**: 
  - 優先使用 App 內購買項目金鑰（更專用）
  - 或使用「Mojan App Build」金鑰（Key ID: `PSPX6DRLFC`）

### APP_STORE_CONNECT_PRIVATE_KEY
- **值**: 完整的私鑰內容（包括 `-----BEGIN PRIVATE KEY-----` 和 `-----END PRIVATE KEY-----`）
- **格式**: 
  ```
  -----BEGIN PRIVATE KEY-----
  MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg...
  [更多私鑰內容]
  -----END PRIVATE KEY-----
  ```
- **重要**: 
  - 如果使用環境變數，需要將換行符轉換為 `\n`
  - 例如：`-----BEGIN PRIVATE KEY-----\nMIGTAgEAM...\n-----END PRIVATE KEY-----`
  - 程式會自動處理 `\\n` 轉義

### APP_STORE_CONNECT_BUNDLE_ID
- **值**: `com.example.mojanApp`
- **說明**: 您的應用程式 Bundle ID（必須與 App Store Connect 中的一致）

## 🚀 使用方式

### 自動選擇 API

系統會自動判斷使用哪個 API：

1. **如果設定了新的 App Store Connect API 金鑰**：
   - 優先使用 **App Store Server API**（新 API）
   - 使用 `transactionId` 驗證交易

2. **如果未設定新的 API 金鑰**：
   - 自動降級使用 **Receipt Validation API**（舊 API）
   - 使用 `receiptData` 驗證收據
   - 會顯示警告訊息

### 驗證流程

新的 API 驗證流程：

1. 客戶端發送 `transactionId` 到後端
2. 後端使用 App Store Connect API 金鑰生成 JWT Token
3. 後端呼叫 App Store Server API 查詢交易
4. 驗證交易狀態和 Bundle ID
5. 返回驗證結果

## 🔍 測試

### 檢查設定是否正確

啟動伺服器後，查看日誌：

- ✅ **成功使用新 API**：
  ```
  📱 使用 App Store Server API 驗證...
  📡 使用 App Store Server API 驗證交易...
  ✅ App Store Server API 驗證成功
  ```

- ⚠️ **降級使用舊 API**：
  ```
  📱 使用舊的 Receipt Validation API 驗證...
  ⚠️ 建議升級到 App Store Server API（舊 API 將於 2025 年 11 月停止支援）
  ```

### 常見錯誤

#### 錯誤 1: JWT 生成失敗
```
缺少 App Store Connect API 設定
```
**解決方案**: 確認所有必要的環境變數都已設定

#### 錯誤 2: 401 Unauthorized
```
回應狀態: 401
```
**解決方案**: 
- 檢查 Key ID 是否正確
- 檢查私鑰格式是否正確
- 確認私鑰與 Key ID 匹配

#### 錯誤 3: 404 Not Found
```
回應狀態: 404
```
**解決方案**: 
- 確認 transactionId 正確
- 系統會自動嘗試沙盒環境

## 📚 參考資料

- [App Store Server API 文檔](https://developer.apple.com/documentation/appstoreserverapi)
- [App Store Connect API 文檔](https://developer.apple.com/documentation/appstoreconnectapi)
- [生成 App Store Connect API 金鑰](https://developer.apple.com/help/app-store-connect/api-keys)

## ⚠️ 重要提醒

1. **私鑰安全**：私鑰檔案只能下載一次，請妥善保管
2. **金鑰權限**：確保金鑰有「管理」權限（從您的截圖看，兩個金鑰都有管理權限 ✅）
3. **Bundle ID 匹配**：確保 `APP_STORE_CONNECT_BUNDLE_ID` 與 App Store Connect 中的 Bundle ID 完全一致
4. **遷移時間**：舊的 Receipt Validation API 將於 **2025 年 11 月 20 日**停止支援，建議盡快升級

## 🎯 下一步

1. ✅ 設定環境變數
2. ✅ 安裝依賴：`npm install jsonwebtoken`
3. ✅ 重啟伺服器
4. ✅ 測試購買驗證
5. ✅ 確認日誌顯示使用新 API

