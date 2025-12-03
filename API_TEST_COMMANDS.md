# API 測試指令（伺服器端 Shell）

## 📋 基本查詢指令

### 1. 查詢房卡商品列表 API（主要）

```bash
# 基本查詢
curl http://localhost:3000/api/room-cards/products

# 如果有自訂 port，替換 3000
curl http://localhost:YOUR_PORT/api/room-cards/products

# 如果是生產環境，替換為實際網址
curl https://your-domain.com/api/room-cards/products
```

### 2. 格式化輸出（使用 jq，如果已安裝）

```bash
# 美化 JSON 輸出
curl http://localhost:3000/api/room-cards/products | jq .

# 只查看商品列表
curl http://localhost:3000/api/room-cards/products | jq '.data.products'

# 只查看第一個商品的 iOS Product ID
curl http://localhost:3000/api/room-cards/products | jq '.data.products[0].iosProductId'
```

### 3. 檢查關鍵欄位

```bash
# 檢查所有商品是否有 iosProductId
curl -s http://localhost:3000/api/room-cards/products | jq '.data.products[] | {cardAmount, iosProductId, productId}'

# 檢查商品數量
curl -s http://localhost:3000/api/room-cards/products | jq '.data.products | length'

# 檢查是否有啟用的商品
curl -s http://localhost:3000/api/room-cards/products | jq '.data.products[] | select(.isActive == true)'
```

### 4. 詳細檢查（一行命令）

```bash
# 檢查所有商品的 iOS Product ID（格式化）
curl -s http://localhost:3000/api/room-cards/products | jq -r '.data.products[] | "\(.cardAmount)張房卡: iOS=\(.iosProductId // "❌ 缺少"), Android=\(.productId)"'
```

---

## 🔍 診斷指令

### 檢查 API 是否返回 iosProductId

```bash
# 方法 1: 使用 grep
curl -s http://localhost:3000/api/room-cards/products | grep -o '"iosProductId":"[^"]*"'

# 方法 2: 使用 jq（更精確）
curl -s http://localhost:3000/api/room-cards/products | jq '.data.products[] | has("iosProductId")'

# 方法 3: 檢查所有欄位
curl -s http://localhost:3000/api/room-cards/products | jq '.data.products[0] | keys'
```

### 檢查商品狀態

```bash
# 檢查所有商品的啟用狀態
curl -s http://localhost:3000/api/room-cards/products | jq '.data.products[] | {cardAmount, isActive, iosProductId}'
```

---

## 📊 完整測試腳本

### 創建測試腳本

```bash
# 創建測試腳本
cat > test_room_cards_api.sh << 'EOF'
#!/bin/bash

API_URL="http://localhost:3000/api/room-cards/products"

echo "🔍 測試房卡商品 API"
echo "API URL: $API_URL"
echo ""

# 1. 基本查詢
echo "📋 1. 基本查詢結果："
curl -s "$API_URL" | jq '.'
echo ""

# 2. 檢查商品數量
echo "📊 2. 商品數量："
curl -s "$API_URL" | jq '.data.products | length'
echo ""

# 3. 檢查 iOS Product ID
echo "🍎 3. iOS Product ID 檢查："
curl -s "$API_URL" | jq -r '.data.products[] | "\(.cardAmount)張房卡: \(.iosProductId // "❌ 缺少")"'
echo ""

# 4. 檢查所有關鍵欄位
echo "🔑 4. 所有關鍵欄位："
curl -s "$API_URL" | jq '.data.products[] | {cardAmount, price, isActive, productId, iosProductId, productCode}'
echo ""

# 5. 檢查是否有缺少 iosProductId 的商品
echo "⚠️ 5. 缺少 iosProductId 的商品："
curl -s "$API_URL" | jq '.data.products[] | select(.iosProductId == null or .iosProductId == "")'
echo ""

echo "✅ 測試完成"
EOF

# 賦予執行權限
chmod +x test_room_cards_api.sh

# 執行測試
./test_room_cards_api.sh
```

---

## 🚀 快速檢查命令（一行）

```bash
# 快速檢查：是否有 iosProductId
curl -s http://localhost:3000/api/room-cards/products | jq '.data.products[] | select(.iosProductId != null) | .iosProductId'

# 快速檢查：商品列表摘要
curl -s http://localhost:3000/api/room-cards/products | jq '.data.products[] | {cardAmount, iosProductId, productId}'

# 快速檢查：API 是否正常
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/room-cards/products
```

---

## 📝 使用範例

### 範例 1: 基本查詢

```bash
$ curl http://localhost:3000/api/room-cards/products
```

**預期輸出**:
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "...",
        "cardAmount": 20,
        "price": 100,
        "isActive": true,
        "productId": "room_card_20_v2",
        "productCode": "room-card-20-buy",
        "iosProductId": "room_card_20_v2"
      },
      ...
    ]
  }
}
```

### 範例 2: 檢查 iOS Product ID

```bash
$ curl -s http://localhost:3000/api/room-cards/products | jq '.data.products[] | .iosProductId'
```

**預期輸出**:
```
"room_card_20_v2"
"room_card_50_v2"
"room_card_200_v2"
```

### 範例 3: 完整商品資訊

```bash
$ curl -s http://localhost:3000/api/room-cards/products | jq '.data.products[] | {cardAmount, iosProductId, productId, isActive}'
```

**預期輸出**:
```json
{
  "cardAmount": 20,
  "iosProductId": "room_card_20_v2",
  "productId": "room_card_20_v2",
  "isActive": true
}
{
  "cardAmount": 50,
  "iosProductId": "room_card_50_v2",
  "productId": "room_card_50_v2",
  "isActive": true
}
{
  "cardAmount": 200,
  "iosProductId": "room_card_200_v2",
  "productId": "room_card_200_v2",
  "isActive": true
}
```

---

## ⚠️ 常見問題排查

### 問題 1: 連接被拒絕

```bash
# 檢查伺服器是否運行
ps aux | grep node

# 檢查 port 是否正確
netstat -tuln | grep 3000
```

### 問題 2: 返回空列表

```bash
# 檢查資料庫是否有商品
# 在 Node.js 環境中執行：
node -e "const {PrismaClient} = require('@prisma/client'); const prisma = new PrismaClient(); prisma.roomCardProduct.findMany().then(console.log).finally(() => prisma.\$disconnect())"
```

### 問題 3: 沒有 iosProductId

```bash
# 檢查後端代碼邏輯
# 確認 roomCards.js 中是否有正確設定 iosProductId
```

---

## 🔧 進階：使用環境變數

```bash
# 設定 API URL
export API_BASE_URL="http://localhost:3000"

# 使用環境變數
curl "$API_BASE_URL/api/room-cards/products" | jq .
```

---

## 📌 注意事項

1. **替換 localhost:3000**：根據您的實際伺服器設定替換
2. **安裝 jq**：如果沒有 jq，可以使用 `apt-get install jq` 或 `brew install jq`
3. **CORS**：如果從不同網域查詢，可能需要處理 CORS
4. **認證**：如果 API 需要認證，添加 `-H "Authorization: Bearer TOKEN"`

---

**最後更新**: 2025-01-26

