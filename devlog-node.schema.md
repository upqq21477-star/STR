# DevLog Node Schema v2.0（v4.3 MD 版）
> Source: devlog-node.schema.json v2.0
> 轉換日期：2026-05-17
> 同步規則：JSON 為 source of truth，此 MD 從 JSON 手動同步。同步時機：schema 有欄位新增／刪除／說明變更時。

---

## 版本說明

v2.0 主要變更（from v1.x）：
- `id`（必填）→ 拆分為 `uid`（必填）+ `display_id`（必填）
- `affects[]`（自由字串）→ `effect[]{uid, edge_type}`（結構化）
- `cross_links` 禁止使用 display_id，必須使用 uid

---

## 必填欄位

| 欄位 | 型別 | 說明 |
|------|------|------|
| `uid` | string | 節點唯一識別碼。v4.3：16位小寫十六進位（64-bit）；v4.0 存量：12位（legacy）。由 `generate_uid.js` 產生，建立後不可修改。**禁止 AI 自行生成。** |
| `display_id` | string | 人類閱讀用拓撲 ID。格式：`ROOT-SEG(-SEG)*`，例如 `L3K-A-B2-C5`。由樹狀位置決定性推導，搬移後可重建（uid 不變）。**禁止用於 cross_links。** |
| `title` | string | 節點標題 |
| `level` | integer（固定為 5） | L5 節點固定值 |
| `status` | enum | `pending` / `wip` / `done` / `blocked` |

---

## 選填欄位

| 欄位 | 型別 | 說明 |
|------|------|------|
| `parent_id` | string \| null | 父節點 display_id（樹狀結構顯示用，不作 cross_links 參照）|
| `tags` | string[] | 語意標籤。可引用 tags.json 的 tags key 或 runtime_hints key |
| `summary` | string | 節點內容摘要 |
| `objective` | string | 此節點目標 |
| `context` | string | 背景脈絡 |
| `action` | string | 執行動作 |
| `result` | string | 執行結果 |
| `rootCause` | string | 問題根因（FIX 節點使用）|
| `handoff` | string | 交接資訊 |
| `humanNote` | string | 人工附注 |
| `code_ref` | string | 對應源碼函數或檔案 |
| `code_spec` | string | 指向 Code Spec Layer 的對應節點 anchor。格式：`[filename]#[display_id]`，例如 `"code-l3k-logistics.md#L3K-A-B2-C5"`。filename 必須符合 `code-*.md` 命名；display_id 必須與本節點一致。$note：此欄為 display_id 指標，與 `reads`/`writes`（state 名稱字串）語意不同，禁止混用。 |
| `supersedes` | string | 被此節點取代的舊節點 display_id |
| `invalidates` | string[] | 此節點使哪些節點結論失效（display_id 陣列）|
| `change_type` | enum | `feature` / `fix` / `refactor` / `config` / `doc` / `test` / `remove` / `none` |
| `decision` | enum | `adopted` / `partial` / `rejected` / `pending`。**注意：`partial` 為 DevLog 私有值，對外輸出前必須轉換為 `pending`** |
| `validation` | enum | `unverified` / `verified` / `failed` |
| `open_questions` | string[] | 未解決問題清單 |
| `fails` | object[] | 失敗記錄。各條目含 `reason`、`condition`、`resolved` |
| `updated_at` | string | ISO 8601 最後更新時間 |

---

## 條件必填欄位（★）

節點 summary 或 code_ref 涉及任何 cross_system_state 登記狀態時必填：

| 欄位 | 說明 |
|------|------|
| `cross_state_refs` | 涉及的共享可變狀態名稱陣列。reads ∪ writes 必須為本欄位子集 |
| `reads` | 此節點讀取的共享可變狀態（必須為 cross_state_refs 子集）|
| `writes` | 此節點寫入的共享可變狀態（必須為 cross_state_refs 子集）|

---

## effect[] 欄位（有向邊）

```
effect: [
  {
    uid:       "目標節點 uid（16位或12位 hex）",
    edge_type: "writes_to | reads_from | blocks | derives_from | owns"
  }
]
```

規則：
- 禁止使用 display_id，必須使用 uid
- edge_type 必須已在 sys-l3k-arch.json edge_registry 中登記（frozen enum）
- `owns` 類型：每個目標 uid 只能被一個 owns 指向（compile.js 強制驗證）

遷移輔助欄位（確認完畢後可刪除）：
- `_review_required: true` — 遷移工具自動產生的 edge，需人工確認 edge_type
- `_unresolved: true` — 遷移工具無法解析的目標 uid，需人工處理

---

## _token_weight（compile artifact）

compile.js v4.3 自動計算，存入 bundle：

```
_token_weight: Math.ceil(JSON.stringify(node).length / 4)
```

- 供 Context resolver budget-aware selection 使用
- 底線開頭：不納入 source of truth 驗證範圍
- 不應手動填寫

---

## 廢棄欄位

| 欄位 | 廢棄版本 | 替代 |
|------|---------|------|
| `id` | v2.0 | `uid` + `display_id` |
| `affects[]` | v2.0 | `effect[]` |

遷移工具：`node migrate_v3_to_v4.js`

---

## branch_schema（附錄）

DevLog branch（`makeBranch()`）與 node 並列存放於 `_db.branches`，v2.0 無變更。

| 欄位 | 必填 | 型別 |
|------|------|------|
| `id` | ✓ | string |
| `pid` | ✓ | string \| null |
| `name` | ✓ | string |
| `color` | ✓ | string |
| `level` | ✓ | integer（1~4）|
| `children` | ✓ | string[] |
| `mission` | — | string |
| `namespace` | — | string（預設 "shared"）|
| `updated_at` | — | string（ISO 8601）|
