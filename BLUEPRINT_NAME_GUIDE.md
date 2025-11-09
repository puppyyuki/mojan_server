# Blueprint Name 設定指南

## 📋 Blueprint Name 說明

### 什麼是 Blueprint Name？

Blueprint Name 是您 Blueprint 實例的唯一名稱，用於：
- 識別和管理您的 Blueprint 部署
- 在 Render Dashboard 中顯示
- 追蹤 Blueprint 的變更和更新

### 建議的命名方式

#### 選項 1：使用專案名稱（推薦）

```
mojan-server
```

或

```
mojan-server-blueprint
```

**優點**：
- 簡潔明瞭
- 與專案名稱一致
- 容易識別

#### 選項 2：使用描述性名稱

```
mojan-server-production
```

或

```
mojan-server-singapore
```

**優點**：
- 更具描述性
- 可以區分不同環境（production、staging 等）
- 可以區分不同區域

#### 選項 3：使用預設值

如果留空，Render 可能會自動使用 repository 名稱：
```
mojan_server
```

## ✅ 建議設定

### 最簡單的方式

**直接使用**：`mojan-server`

**原因**：
- 簡潔明瞭
- 與專案名稱一致
- 容易識別和管理

### 如果需要區分環境

如果未來需要多個環境（production、staging 等），可以使用：
- `mojan-server-production`
- `mojan-server-staging`

## 📝 注意事項

1. **唯一性**：
   - Blueprint Name 在您的 Render 帳號中必須是唯一的
   - 如果名稱已存在，Render 可能會提示您更改

2. **命名規則**：
   - 只能使用小寫字母、數字和連字號（-）
   - 不能使用空格或特殊字元
   - 建議使用小寫字母和連字號

3. **可以更改**：
   - Blueprint Name 可以在稍後更改
   - 但建議一開始就使用合適的名稱

## 🎯 快速建議

**直接填入**：`mojan-server`

然後繼續設定其他選項和環境變數。

---

最後更新：2024年11月

