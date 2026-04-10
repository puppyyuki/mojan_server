# Client assets（Flutter 遠端下載）

為了讓 **Google Play base 模組** 壓在 200MB 內，將 `mojan_app/assets/batch_50ms_apng/` 內檔案放到 **`v1/batch_50ms_apng/`**（與 `v1/manifest.json` 的 `files` 路徑一致）。

## 部署步驟

1. 從專案根目錄執行（需已安裝 Node）：

   ```bash
   node mojan_server/scripts/sync-batch-apng-to-client-assets.js
   ```

2. 將 `mojan_server/public/client-assets/` 一併部署到與 API 相同主機（例如 Render），確保可存取：

   `https://<你的主機>/client-assets/v1/manifest.json`

3. 發布 Flutter **Release** 時**不要**把 `assets/batch_50ms_apng/` 列在 `pubspec.yaml`（已由 App 改為啟動時下載）。

## 更新動畫

替換 `mojan_app/assets/batch_50ms_apng/` 內檔案後，重新執行 sync，並將 `v1/manifest.json` 裡的 **`version`** 整數加 1，以強制客戶端重新下載。
