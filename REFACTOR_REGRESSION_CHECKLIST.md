# 回歸測試清單（Refactor Gate）

## 最小可跑路徑（必跑）
- 建房 → 入桌 → 發牌 → 出牌 → Claim → 結算

## 桌內規則
- 胡 / 吃 / 碰 / 槓 合法性
- 非自己回合出牌必須被拒絕（REJECTED）
- 手牌不存在的牌出牌必須被拒絕（REJECTED）

## clientSeq / serverSeq
- clientSeq 亂序送出時，伺服器仍以權威狀態回覆並可用 snapshot 修正
- serverSeq 單調遞增，client 端忽略過期 event

## Snapshot / Reconnect
- 斷線重連後可取得 TABLE_SNAPSHOT，恢復回合、河牌、明牌與自己手牌

## Optimistic UI / Rollback
- 出牌 optimistic 後若收到 REJECTED：必須回滾並套用 TABLE_SNAPSHOT

## 安全性（不可外洩）
- 不得傳送未揭露牌序或整副牌山到 client（不得包含 deck/wall order）

