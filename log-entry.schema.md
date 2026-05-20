# Log Entry Schema（v4.3 MD 版）
> 版本：SCHEMA v2.3
> 轉換日期：2026-05-17
> 注意：log-entry.schema.json 不在 v4.0 zip 包內，此 MD 依 AGENTS.md 描述建立。
> 同步規則：若日後補充 log-entry.schema.json，以 JSON 為 source of truth，此 MD 手動同步。

---

## 用途

session log 的單筆條目格式。每次 COMPILE 模式輸出 `<ENTRIES>` 區塊時使用此格式。

---

## 欄位規格

| 欄位 | 必填 | 型別 | 說明 |
|------|------|------|------|
| `uid` | ✓ | string | 條目唯一識別碼（16位 hex v4.3，12位 hex v4.0 legacy）|
| `session_id` | ✓ | string | 所屬 session 識別碼 |
| `created_at` | ✓ | string | ISO 8601 建立時間 |
| `type` | ✓ | enum | `decision` / `finding` / `action` / `question` / `milestone` |
| `summary` | ✓ | string | 條目摘要 |
| `related_nodes` | — | string[] | 相關節點 uid 陣列 |
| `decision` | — | enum | `adopted` / `rejected` / `pending`。**注意：`partial` 為 DevLog 私有值，此欄不得使用 `partial`（見 devlog-node.schema.md）** |
| `author` | — | string | `human` / `ai` / `mixed` |
| `tags` | — | string[] | 語意標籤 |
| `follow_up` | — | string[] | 後續待辦事項 |

---

## 輸出格式（COMPILE 模式）

```json
[
  {
    "uid": "PENDING_UID",
    "session_id": "session-2026-05-17",
    "created_at": "2026-05-17T12:00:00.000Z",
    "type": "decision",
    "summary": "決定將 uid entropy 升級至 64-bit",
    "related_nodes": [],
    "decision": "adopted",
    "author": "mixed"
  }
]
```

---

## 規則

- `decision` 欄位禁止使用 `partial`（F-20）
- `uid` 欄位若無工具生成，填 `"PENDING_UID"` 並標注需人類填入
- 條目一旦寫入 session-log 不應刪除，只能新增後續條目說明修正
