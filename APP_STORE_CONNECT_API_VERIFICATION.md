# App Store Connect API 設定驗證清單

## ✅ 環境變數設定檢查

### 後端伺服器環境變數（必須使用這些名稱）

```bash
APP_STORE_CONNECT_ISSUER_ID=2a767e1c-6381-42cb-9a68-3c6b57da58bb
APP_STORE_CONNECT_KEY_ID=PSPX6DRLFC
APP_STORE_CONNECT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n[您的私鑰內容]\n-----END PRIVATE KEY-----"
APP_STORE_CONNECT_BUNDLE_ID=com.example.mojanApp
```

### ⚠️ 重要：環境變數名稱區別

- **後端伺服器**：使用 `APP_STORE_CONNECT_KEY_ID` ✅
- **Codemagic CI/CD**：使用 `APP_STORE_CONNECT_KEY_IDENTIFIER`（這是 Codemagic 特定的，不影響後端）

## ✅ 代碼實作檢查

### 1. 環境變數讀取（`mojan_server/lib/iap_verification.js`）

```javascript
// ✅ 正確
this.appStoreConnectIssuerId = process.env.APP_STORE_CONNECT_ISSUER_ID;
this.appStoreConnectKeyId = process.env.APP_STORE_CONNECT_KEY_ID;
this.appStoreConnectPrivateKey = process.env.APP_STORE_CONNECT_PRIVATE_KEY;
this.appStoreConnectBundleId = process.env.APP_STORE_CONNECT_BUNDLE_ID || 'com.example.mojanApp';
```

### 2. JWT 生成邏輯

```javascript
// ✅ 正確的 JWT Payload
const payload = {
    iss: this.appStoreConnectIssuerId,  // Issuer ID
    iat: now,                            // 發行時間
    exp: now + 1200,                     // 20 分鐘有效期
    aud: 'appstoreconnect-v1',           // Audience
};

// ✅ 正確的 JWT 簽名
const token = jwt.sign(payload, privateKey, {
    algorithm: 'ES256',                  // 正確的算法
    keyid: this.appStoreConnectKeyId,    // Key ID
});
```

### 3. API 端點

```javascript
// ✅ 正式環境端點
const productionUrl = `https://api.storekit.itunes.apple.com/inApps/v1/transactions/${transactionId}`;

// ✅ 沙盒環境端點
const sandboxUrl = `https://api.storekit-sandbox.itunes.apple.com/inApps/v1/transactions/${transactionId}`;
```

### 4. HTTP 請求標頭

```javascript
// ✅ 正確的請求標頭
headers: {
    'Authorization': `Bearer ${token}`,  // JWT Token
    'Content-Type': 'application/json',
}
```

### 5. 自動切換邏輯

```javascript
// ✅ 正確的 API 選擇邏輯
if (this.useAppStoreServerAPI && transactionId) {
    // 使用新的 App Store Server API
    return await this.verifyAppStoreTransaction(transactionId);
} else if (receiptData) {
    // 降級使用舊的 Receipt Validation API
    return await this.verifyAppStorePurchaseLegacy(receiptData);
}
```

## ✅ 驗證流程檢查

### 1. 交易驗證流程

```
1. Flutter App 發送 transactionId 到後端 ✅
2. 後端檢查環境變數是否設定 ✅
3. 如果設定 → 生成 JWT Token ✅
4. 呼叫 App Store Server API ✅
5. 驗證交易狀態和 Bundle ID ✅
6. 返回驗證結果 ✅
```

### 2. 錯誤處理

- ✅ 404 錯誤 → 自動嘗試沙盒環境
- ✅ 401 錯誤 → 檢查 Key ID 和私鑰
- ✅ 缺少環境變數 → 降級使用舊 API

## ✅ 文檔一致性檢查

### 後端文檔（`mojan_server/APP_STORE_CONNECT_API_SETUP.md`）

- ✅ 環境變數名稱：`APP_STORE_CONNECT_KEY_ID`
- ✅ Issuer ID：`2a767e1c-6381-42cb-9a68-3c6b57da58bb`
- ✅ Bundle ID：`com.example.mojanApp`
- ✅ 設定步驟完整

### Flutter 文檔（`mojan_app/IOS_IAP_API_KEY_GUIDE.md`）

- ✅ 環境變數名稱：`APP_STORE_CONNECT_KEY_ID`
- ✅ 設定步驟完整
- ✅ 測試說明清楚

### Codemagic 文檔（`mojan_app/CODEMAGIC_SETUP_GUIDE.md`）

- ⚠️ 使用 `APP_STORE_CONNECT_KEY_IDENTIFIER`（這是 Codemagic 特定的，不影響後端）
- ✅ 這是 CI/CD 設定，與後端伺服器無關

## ✅ 依賴套件檢查

### package.json

```json
{
  "dependencies": {
    "jsonwebtoken": "^9.0.2",  // ✅ 已安裝
    "axios": "^1.13.2"         // ✅ 已安裝
  }
}
```

## ✅ 測試檢查清單

### 1. 環境變數設定

- [ ] `APP_STORE_CONNECT_ISSUER_ID` 已設定
- [ ] `APP_STORE_CONNECT_KEY_ID` 已設定
- [ ] `APP_STORE_CONNECT_PRIVATE_KEY` 已設定（包含 BEGIN 和 END）
- [ ] `APP_STORE_CONNECT_BUNDLE_ID` 已設定（或使用預設值）

### 2. 私鑰格式

- [ ] 私鑰包含 `-----BEGIN PRIVATE KEY-----`
- [ ] 私鑰包含 `-----END PRIVATE KEY-----`
- [ ] 如果使用環境變數，換行符已轉換為 `\n`

### 3. 伺服器日誌

啟動伺服器後，應該看到：

```
✅ 成功使用新 API：
📱 使用 App Store Server API 驗證...
📡 使用 App Store Server API 驗證交易...
✅ App Store Server API 驗證成功
```

### 4. 購買測試

- [ ] 在真機上測試（模擬器不支持）
- [ ] 登入 Apple ID 或沙盒測試帳號
- [ ] 嘗試購買房卡
- [ ] 查看伺服器日誌確認使用新 API

## 🔧 常見問題修正

### 問題 1: 環境變數名稱不一致

**錯誤**：使用 `APP_STORE_CONNECT_KEY_IDENTIFIER`（這是 Codemagic 的）

**正確**：使用 `APP_STORE_CONNECT_KEY_ID`

### 問題 2: 私鑰格式錯誤

**錯誤**：私鑰沒有包含 `-----BEGIN PRIVATE KEY-----` 和 `-----END PRIVATE KEY-----`

**正確**：必須包含完整的私鑰格式

### 問題 3: Bundle ID 不匹配

**檢查**：`APP_STORE_CONNECT_BUNDLE_ID` 必須與 App Store Connect 中的 Bundle ID 完全一致

## 📝 總結

### ✅ 已確認正確的部分

1. **環境變數名稱**：後端使用 `APP_STORE_CONNECT_KEY_ID` ✅
2. **API 端點**：使用正確的 App Store Server API 端點 ✅
3. **JWT 生成**：使用正確的算法和參數 ✅
4. **錯誤處理**：自動切換沙盒環境 ✅
5. **向後兼容**：自動降級使用舊 API ✅

### ⚠️ 注意事項

1. **Codemagic 文檔**：使用 `APP_STORE_CONNECT_KEY_IDENTIFIER` 是 Codemagic 特定的，不影響後端伺服器
2. **私鑰格式**：必須包含完整的 BEGIN 和 END 標記
3. **Bundle ID**：必須與 App Store Connect 中的完全一致

### 🎯 驗證步驟

1. 確認所有環境變數已設定
2. 重啟伺服器
3. 查看日誌確認使用新 API
4. 測試購買功能

