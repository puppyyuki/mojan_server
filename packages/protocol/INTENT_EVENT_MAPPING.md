# Legacy Socket.IO ↔ Intent/Event 對照（初版）

本表以 `mojan_server/server.js` 現行 Socket.IO 事件為基準，對齊 `packages/protocol/messages.js` 的 Intent/Event。

## Client → Server（Legacy event → ClientIntent）

| Legacy event | Legacy payload 重點 | ClientIntent.type | Intent 欄位 |
|---|---|---|---|
| `clientIntent` | `{ tableId, playerId, ...intent }` | (依 intent.type) | `messages.js` schema |
| `joinTable` | `{ tableId, player }` | `JOIN_TABLE` | `{ tableId, token?, clientVersion? }` |
| `toggleReady` | `{ tableId, playerId }` | `READY` | `{}` |
| `discardTile` | `{ tableId, playerId, tile, clientSeq? }` | `DISCARD_INTENT` | `{ tile, clientSeq }` |
| `executeClaim` | `{ tableId, playerId, claimType, tiles, clientSeq? }` | `CLAIM_INTENT` | `{ claim, tiles, clientSeq }` |
| `claimTile` | `{ tableId, playerId, claimType, tiles }` | （legacy fallback） | 當未啟用 protocol engine 時走舊路徑 |
| `passClaim` | `{ tableId, playerId }` | （legacy fallback） | 當未啟用 protocol engine 時走舊路徑 |
| `requestDisband` | `{ tableId, playerId, reason? }` | `DISSOLVE_REQUEST` | `{ reason? }` |

## Server → Client（ServerEvent → Legacy event）

| ServerEvent.type | 目的 | Legacy event（暫定） | 備註 |
|---|---|---|---|
| (all) | 單一事件通道 | `serverEvent` | payload 含 `type` 與 `serverSeq`（若存在） |
| `TABLE_SNAPSHOT` | 斷線重連/回滾一致性 | `tableSnapshot` | 含 public + myPrivate |
| `TURN_START` | 指示回合開始 | `turnStart` | 之後可替代 `turnUpdate`/部分 `gameStateUpdate` |
| `DISCARDED` | 廣播出牌 | `discarded` | 之後可替代 `gameStateUpdate` 的部分欄位 |
| `HAND_SYNC` | 同步自己的手牌/花牌 | `handSync` | private only |
| `CLAIM_WINDOW` | 吃碰槓胡決策窗 | `claimWindow` | private only；搭配 `DISCARDED` |
| `CLAIM_RESOLVED` | 決策結果 | `claimResolved` | broadcast |
| `REJECTED` | 拒絕 clientSeq 行為 | `rejected` | Client 收到需回滾並套用 snapshot |

## Claim 私密性與倒數（現況）

- `claimRequest`（legacy）已改為只對可決策玩家私訊，payload 只包含該玩家 `options`，避免洩漏其他玩家可吃碰槓胡選項。
- `CLAIM_WINDOW`（protocol）為 private event，並可選帶 `deadlineAtMs`；server 不再每秒廣播 `claimTimerUpdate`。

## 驗收指令（回歸/壓測）

在 `mojan_server/` 目錄執行：

- 啟動 protocol engine：`npm run start:protocol`
- 回歸測試（P0 核心）：`npm run test:protocol-engine`
- 引擎壓測（預設 750 桌，可調參數）：`npm run load:engine -- --tables=750 --durationSec=30 --minEps=1 --maxEps=3 --duplicatePct=5`

## 日誌開關

- Server：`QUIET_GAME_LOGS=1` 可降低對局中高頻 console 噪音。
- Client：`--dart-define=MOJAN_DEBUG_LOGS=true` 可開啟多人對戰畫面的 debugPrint（預設關閉）。

