# App Store Server API 詳細調用邏輯指南

## 📋 概述

本文檔詳細說明 App Store Server API 的完整調用流程，包括 JWT 生成、交易驗證、錯誤處理等。

## 🔑 1. JWT Token 生成

### 1.1 必要環境變數

```bash
APP_STORE_CONNECT_ISSUER_ID=2a767e1c-6381-42cb-9a68-3c6b57da58bb
APP_STORE_CONNECT_KEY_ID=PSPX6DRLFC
APP_STORE_CONNECT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
APP_STORE_CONNECT_BUNDLE_ID=com.example.mojanApp
```

### 1.2 JWT Payload 結構

```javascript
const payload = {
    iss: this.appStoreConnectIssuerId,  // Issuer ID（從 App Store Connect 獲取）
    iat: now,                            // 發行時間（Unix 時間戳）
    exp: now + 1200,                     // 過期時間（20 分鐘後）
    aud: 'appstoreconnect-v1',           // Audience（固定值）
};
```

### 1.3 JWT 簽名參數

```javascript
const token = jwt.sign(payload, privateKey, {
    algorithm: 'ES256',                  // 使用 ES256 算法（ECDSA P-256）
    keyid: this.appStoreConnectKeyId,    // Key ID（從 App Store Connect 獲取）
});
```

### 1.4 私鑰格式處理

```javascript
// 1. 處理環境變數中的轉義字符
let privateKey = this.appStoreConnectPrivateKey.replace(/\\n/g, '\n');

// 2. 確保包含 BEGIN 和 END 標記
if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
}
```

## 📡 2. 交易驗證 API 調用

### 2.1 API 端點

**正式環境：**
```
GET https://api.storekit.itunes.apple.com/inApps/v1/transactions/{transactionId}
```

**沙盒環境：**
```
GET https://api.storekit-sandbox.itunes.apple.com/inApps/v1/transactions/{transactionId}
```

### 2.2 HTTP 請求標頭

```javascript
headers: {
    'Authorization': `Bearer ${jwtToken}`,  // JWT Token
    'Content-Type': 'application/json',
}
```

### 2.3 請求範例

```javascript
// 先嘗試正式環境
const productionUrl = `https://api.storekit.itunes.apple.com/inApps/v1/transactions/${transactionId}`;

let response = await axios.get(productionUrl, {
    headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    },
});

// 如果 404，可能是沙盒交易，嘗試沙盒環境
if (error.response && error.response.status === 404) {
    const sandboxUrl = `https://api.storekit-sandbox.itunes.apple.com/inApps/v1/transactions/${transactionId}`;
    response = await axios.get(sandboxUrl, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    });
}
```

## 🔍 3. 交易資料解析

### 3.1 API 回應結構

```json
{
    "signedTransactionInfo": "eyJraWQiOiJ...",  // JWT 格式的交易資訊
    "signedRenewalInfo": "eyJraWQiOiJ..."       // 訂閱續訂資訊（如果是訂閱）
}
```

### 3.2 解析 signedTransactionInfo

```javascript
// 解析 JWT 交易資訊（不需要驗證，因為已經從 Apple 伺服器獲取）
const transactionInfo = jwt.decode(transaction.signedTransactionInfo);
```

### 3.3 transactionInfo 結構

```javascript
{
    bundleId: "com.example.mojanApp",           // Bundle ID
    productId: "room_card_20_v2",               // 商品 ID
    transactionId: "1000000123456789",          // 交易 ID
    originalTransactionId: "1000000123456789",  // 原始交易 ID
    purchaseDate: 1699123456789,                // 購買時間（Unix 時間戳，毫秒）
    environment: "Production",                   // 環境：Production 或 Sandbox
    type: "Consumable",                          // 交易類型
    revocationDate: null,                        // 撤銷時間（如果已撤銷）
    // ... 其他欄位
}
```

## ✅ 4. 驗證邏輯

### 4.1 基本驗證

```javascript
// 1. 檢查交易資料格式
if (!transaction.signedTransactionInfo) {
    return {
        valid: false,
        error: '交易資料格式錯誤',
    };
}

// 2. 檢查能否解析交易資訊
if (!transactionInfo) {
    return {
        valid: false,
        error: '無法解析交易資訊',
    };
}
```

### 4.2 Bundle ID 驗證

```javascript
if (transactionInfo.bundleId !== this.appStoreConnectBundleId) {
    return {
        valid: false,
        error: `Bundle ID 不匹配: 期望 ${this.appStoreConnectBundleId}, 實際 ${transactionInfo.bundleId}`,
    };
}
```

### 4.3 交易類型驗證

```javascript
// 支援的交易類型
const validTypes = [
    'Auto-Renewable Subscription',  // 自動續訂訂閱
    'Non-Consumable',               // 非消耗性項目
    'Consumable',                   // 消耗性項目
];

if (!validTypes.includes(transactionInfo.type)) {
    console.warn(`⚠️ 未知的交易類型: ${transactionInfo.type}`);
}
```

### 4.4 撤銷檢查

```javascript
if (transactionInfo.revocationDate) {
    return {
        valid: false,
        error: '交易已被撤銷',
        revoked: true,
        revocationDate: transactionInfo.revocationDate,
    };
}
```

## 🔄 5. 完整驗證流程

### 5.1 流程圖

```
1. 接收 transactionId
   ↓
2. 檢查環境變數是否設定
   ↓
3. 生成 JWT Token
   ↓
4. 調用正式環境 API
   ↓
5. 如果 404，嘗試沙盒環境
   ↓
6. 解析 signedTransactionInfo
   ↓
7. 驗證 Bundle ID
   ↓
8. 檢查交易類型
   ↓
9. 檢查是否撤銷
   ↓
10. 返回驗證結果
```

### 5.2 完整代碼範例

```javascript
async verifyAppStoreTransaction(transactionId) {
    try {
        // 1. 檢查參數
        if (!transactionId) {
            return {
                valid: false,
                error: '缺少交易 ID',
            };
        }

        // 2. 生成 JWT Token
        const token = this._generateAppStoreConnectJWT();

        // 3. 先嘗試正式環境
        const productionUrl = `https://api.storekit.itunes.apple.com/inApps/v1/transactions/${transactionId}`;
        
        let response;
        try {
            response = await axios.get(productionUrl, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
        } catch (error) {
            // 4. 如果是 404，嘗試沙盒環境
            if (error.response && error.response.status === 404) {
                const sandboxUrl = `https://api.storekit-sandbox.itunes.apple.com/inApps/v1/transactions/${transactionId}`;
                response = await axios.get(sandboxUrl, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                });
            } else {
                throw error;
            }
        }

        // 5. 解析交易資訊
        const transaction = response.data;
        if (!transaction.signedTransactionInfo) {
            return {
                valid: false,
                error: '交易資料格式錯誤',
            };
        }

        const transactionInfo = jwt.decode(transaction.signedTransactionInfo);
        if (!transactionInfo) {
            return {
                valid: false,
                error: '無法解析交易資訊',
            };
        }

        // 6. 驗證 Bundle ID
        if (transactionInfo.bundleId !== this.appStoreConnectBundleId) {
            return {
                valid: false,
                error: `Bundle ID 不匹配: 期望 ${this.appStoreConnectBundleId}, 實際 ${transactionInfo.bundleId}`,
            };
        }

        // 7. 檢查是否撤銷
        if (transactionInfo.revocationDate) {
            return {
                valid: false,
                error: '交易已被撤銷',
                revoked: true,
                revocationDate: transactionInfo.revocationDate,
            };
        }

        // 8. 返回成功結果
        return {
            valid: true,
            productId: transactionInfo.productId,
            transactionId: transactionInfo.transactionId,
            originalTransactionId: transactionInfo.originalTransactionId,
            purchaseDate: transactionInfo.purchaseDate,
            environment: transactionInfo.environment,
        };
    } catch (error) {
        console.error('❌ App Store Server API 驗證異常:', error.message);
        if (error.response) {
            console.error('   回應狀態:', error.response.status);
            console.error('   回應資料:', error.response.data);
        }
        return {
            valid: false,
            error: error.message || '驗證失敗',
        };
    }
}
```

## ⚠️ 6. 錯誤處理

### 6.1 常見錯誤碼

| HTTP 狀態碼 | 說明 | 處理方式 |
|------------|------|---------|
| 200 | 成功 | 繼續處理 |
| 401 | 未授權 | 檢查 JWT Token 是否正確 |
| 404 | 找不到交易 | 嘗試沙盒環境 |
| 500 | 伺服器錯誤 | 重試或記錄錯誤 |

### 6.2 錯誤處理範例

```javascript
catch (error) {
    if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        
        switch (status) {
            case 401:
                return {
                    valid: false,
                    error: 'JWT Token 無效，請檢查 Key ID 和私鑰',
                };
            case 404:
                // 嘗試沙盒環境
                return await this._trySandboxEnvironment(transactionId, token);
            case 500:
                return {
                    valid: false,
                    error: 'Apple 伺服器錯誤，請稍後重試',
                };
            default:
                return {
                    valid: false,
                    error: `未知錯誤: ${status}`,
                };
        }
    }
    
    return {
        valid: false,
        error: error.message || '驗證失敗',
    };
}
```

## 🔐 7. 安全性考量

### 7.1 JWT Token 有效期

- **有效期**：20 分鐘（1200 秒）
- **建議**：每次請求都生成新的 Token，不要快取

### 7.2 私鑰安全

- **不要**將私鑰提交到 Git
- **使用**環境變數存儲私鑰
- **確保**私鑰格式正確（包含 BEGIN 和 END 標記）

### 7.3 Bundle ID 驗證

- **必須**驗證 Bundle ID 是否匹配
- **防止**其他應用的交易被誤用

## 📚 8. 參考資源

- [App Store Server API 官方文檔](https://developer.apple.com/documentation/appstoreserverapi)
- [App Store Connect API 文檔](https://developer.apple.com/documentation/appstoreconnectapi)
- [JWT.io - JWT 解碼工具](https://jwt.io/)

## 🎯 9. 最佳實踐

1. **自動切換環境**：先嘗試正式環境，404 時自動切換到沙盒
2. **詳細日誌**：記錄所有驗證步驟，方便除錯
3. **錯誤處理**：妥善處理各種錯誤情況
4. **Bundle ID 驗證**：確保交易屬於正確的應用
5. **撤銷檢查**：檢查交易是否已被撤銷

## ✅ 10. 驗證結果結構

### 10.1 成功回應

```javascript
{
    valid: true,
    productId: "room_card_20_v2",
    transactionId: "1000000123456789",
    originalTransactionId: "1000000123456789",
    purchaseDate: 1699123456789,
    environment: "Production",  // 或 "Sandbox"
}
```

### 10.2 失敗回應

```javascript
{
    valid: false,
    error: "錯誤訊息",
    // 可選欄位
    revoked: true,
    revocationDate: 1699123456789,
}
```

