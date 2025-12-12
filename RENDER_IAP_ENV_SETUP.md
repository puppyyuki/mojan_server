# Render 環境變數設定（IAP）

## 必填（App Store Server API 驗證）

- `APP_STORE_CONNECT_ISSUER_ID`: App Store Connect API Issuer ID
- `APP_STORE_CONNECT_KEY_ID`: App Store Connect API Key ID
- `APP_STORE_CONNECT_PRIVATE_KEY`: App Store Connect API 私鑰內容（PEM，單行環境變數，保留換行符）
- `APP_STORE_CONNECT_BUNDLE_ID`: 應用程式 Bundle ID（例如 `com.example.mojanApp`）

說明：若設定上述三個金鑰與 Bundle ID，後端會使用 App Store Server API，僅需前端提供 `transactionId` 即可完成驗證。

## 選填（舊版 Receipt 驗證備用）

- `APPLE_SHARED_SECRET`: App 專用共享密鑰（僅用於舊版收據驗證）
- `APPLE_SANDBOX`: `true` 或不設定。未設定時，程式會依 21007 自動切到沙盒驗證。

## Google Play 驗證

- `ANDROID_PACKAGE_NAME`: 例如 `com.mojan.app`
- `GOOGLE_SERVICE_ACCOUNT_KEY`: 服務帳號 JSON 全文（單行環境變數）。確保 `private_key` 內容保留換行符。

若不設定 `GOOGLE_SERVICE_ACCOUNT_KEY`，後端會讀取 `google-service-account.json` 檔案。

## 內購測試模式

- `IAP_TEST_MODE`: `false`。若設為 `true`，後端跳過收據驗證僅做流程測試。正式環境請關閉。

## 其他建議

- `NODE_ENV`: `production`

## 前端建置參數（Flutter）

- `--dart-define=API_URL=https://<你的 Render 伺服器域名>`
- `--dart-define=SOCKET_URL=https://<你的 Render 伺服器域名>`

前端會自動在 `API_URL` 後加 `/api`，後端路由如 `/api/iap/verify`。

## 產品 ID 對齊

- App Store/Google Play 的商品 ID 與後端必須一致。後端已支援以下別名：
  - `room_card_20_v2` ↔ `room_card_20`
  - `room_card_50_v2` ↔ `room_card_50`
  - `room_card_200_v2` ↔ `room_card_200`
  - Android 備用：`room-card-20-buy` 等

確保 App Store Connect 商品狀態為「準備提交」或「已核准」，並在真機上測試。

