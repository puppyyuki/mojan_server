# GET /api/players/:id 端點修復說明

## 問題描述

在正式伺服器環境中，後台補卡顯示成功，但遊戲端無法顯示補卡數（都顯示為 0）。

## 問題原因

遊戲端在 `auth_service.dart` 中使用 `GET /api/players/:id` 來獲取玩家資料（包括房卡數量），但 `server.js` 中缺少這個端點，導致：

1. 遊戲端無法獲取玩家資料
2. `getPlayerRoomCardBalance` 方法返回 0
3. 補卡數顯示為 0

## 解決方案

在 `server.js` 中添加了 `GET /api/players/:id` 端點：

```javascript
// API: 獲取單個玩家
app.get('/api/players/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const player = await prisma.player.findUnique({
      where: { id },
      include: {
        createdClubs: true,
        clubMembers: {
          include: {
            club: true,
          },
        },
      },
    });

    if (!player) {
      setCorsHeaders(res);
      return res.status(404).json({
        success: false,
        error: '玩家不存在',
      });
    }

    setCorsHeaders(res);
    res.status(200).json({
      success: true,
      data: player,
    });
  } catch (error) {
    console.error('獲取玩家失敗:', error);
    setCorsHeaders(res);
    res.status(500).json({
      success: false,
      error: '獲取玩家失敗',
    });
  }
});
```

## 端點說明

### GET /api/players/:id

**功能**：獲取單個玩家的詳細資料

**請求參數**：
- `id` (路徑參數)：玩家的資料庫 ID

**響應格式**：
```json
{
  "success": true,
  "data": {
    "id": "player-id",
    "userId": "123456",
    "nickname": "玩家暱稱",
    "cardCount": 100,
    "avatarUrl": null,
    "bio": null,
    "lastLoginAt": "2024-01-01T00:00:00.000Z",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "createdClubs": [],
    "clubMembers": []
  }
}
```

**錯誤響應**：
- `404`：玩家不存在
- `500`：伺服器錯誤

## CORS 設定

端點使用 `setCorsHeaders` 函數設定 CORS headers：
- `Access-Control-Allow-Origin`: 從環境變數 `CORS_ORIGIN` 讀取，預設為 `*`
- `Access-Control-Allow-Methods`: `GET, POST, PUT, PATCH, DELETE, OPTIONS`
- `Access-Control-Allow-Headers`: `Content-Type, Authorization`

## 測試方法

### 使用 curl 測試

```bash
# 獲取玩家資料
curl https://mojan-server-0kuv.onrender.com/api/players/[player-id]
```

### 使用瀏覽器測試

在瀏覽器中訪問：
```
https://mojan-server-0kuv.onrender.com/api/players/[player-id]
```

### 預期結果

應該返回包含 `cardCount` 字段的玩家資料，遊戲端可以正確讀取並顯示補卡數。

## 部署步驟

1. 確認 `server.js` 已包含 `GET /api/players/:id` 端點
2. 重新部署 `mojan-server` 服務
3. 測試遊戲端是否能正確獲取玩家資料
4. 驗證補卡數是否正確顯示

## 相關文件

- `mojan_app/lib/services/auth_service.dart`：遊戲端獲取玩家資料的實現
- `mojan_app/lib/config/api_config.dart`：API URL 配置
- `mojan_server/app/api/players/[id]/route.ts`：Next.js API 路由（僅用於管理後台）

## 注意事項

1. 這個端點與 Next.js API 路由 `app/api/players/[id]/route.ts` 功能相同，但用於不同的場景：
   - Express 端點（`server.js`）：用於遊戲端和 Socket.io 服務
   - Next.js 路由：用於管理後台

2. 確保兩個端點的返回格式一致，以便前端可以正確解析數據。

3. 在正式環境中，確保 `CORS_ORIGIN` 環境變數已正確設定。

