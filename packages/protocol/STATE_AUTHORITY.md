# 狀態權威與同步原則（即時對戰）

## 權威來源

- 自己的手牌：只以 `myHand` / `HAND_SYNC` / `TABLE_SNAPSHOT.myPrivate.myHand` 覆蓋為準
- 其他玩家手牌張數：只以 `handCountsUpdate` / `TABLE_SNAPSHOT.publicState.handCounts` 為準（顯示牌背數量）
- 出牌/吃碰槓/胡：只以伺服器事件（含 `serverSeq`）推進狀態；Client 的本地預測僅用於動畫與按鈕回饋

## 禁止推導

- 不用「摸牌區是否有牌」去推導某玩家手牌應該 +1 / -1
- 不用 `handCountsUpdate` 去裁切或補齊自己的手牌

## 拒絕與校正

- 收到 `REJECTED`：立刻 `requestTableSnapshot`，並用快照覆蓋自己私有狀態，避免累積漂移
- 任何 pending 閘門（出牌/決策）都應在收到伺服器確認事件時立即解鎖；時間閘門只作為保險

## Debug Overlay（Client）

- 啟用：`--dart-define=MOJAN_DEBUG_OVERLAY=true`
- 會顯示：phase/turn、serverSeq/clientSeq、pending 狀態、自己的手牌張數與摸牌區狀態

