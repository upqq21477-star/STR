# AGENTS-axioms.md
> 版本：v4.5 | 變動頻率：極低（版本升級才動）
> 修改 authority：人類唯寫，需明確版本標記
> 對應文件：AGENTS-protocol.md | AGENTS-workflow.md | AGENTS-changelog.md

> **Authority Level: Constitutional**
> 此文件為最高層級。任何文件與 Axioms 衝突時，以 Axioms 為準。不得由 AI 修改。

---

## 核心不變原則

這些原則建立後幾乎不變。修改任一原則必須同時更新版本號，並在 AGENTS-changelog.md 登記原因。

---

### A1. Source of Truth 層次

```
sys-*.json          → L5 節點 source of truth（由人類或 AI COMPILE 輸出後覆蓋）
symbol-table.json   → uid identity + tombstone source of truth（人類唯讀維護）
id_index.json       → generated projection（由 compile.js 維護，禁止手動編輯）
compiled_graph.bundle.json → AI context transport format（由 compile.js 輸出，AI 唯讀）
```

> compile.js 讀取的是 sys-*.json，輸出的是 bundle。Claude 讀取的是 bundle，輸出的是新版 sys-*.json。

---

### A2. uid 不可變性（identity immutability）

- uid 一旦建立，永不修改，即使節點搬移、重組或廢棄
- uid 必須由 `generate_uid.js` 產生，AI 不得自行生成
- uid 格式：v4.3 新建節點為 16位小寫十六進位（64-bit）；v4.0 存量節點 12位（legacy）仍合法
- 廢棄節點：uid 進入 `symbol-table.json` tombstone 後永遠不可重新使用
- 禁止使用 display_id 作為 cross_links 參照，必須使用 uid

---

### A3. Frozen Enum（edge_type）

edge_type 的五種允許值：`writes_to | reads_from | blocks | derives_from | owns`

**rationale**：inferential determinism 優先於 extensibility。LLM 對固定語意 primitive 的推理穩定度遠高於 dynamic ontology。AI 看到 `writes_to` 可以立即推斷影響方向；動態查 registry 多了一個推理步驟，在 hot path 決策時成本累積。

擴充限制：
- 禁止 AI 自行增加 edge_type
- 新增前先問：「現有五種 edge 真的無法表達這個關係嗎？」
- 需要擴充時：由人類修改 `sys-l3k-arch.json` edge_registry，並在 AGENTS-changelog.md 登記理由

---

### A4. Fail-Stop 原則

- 任何 compile.js error 必須阻止 bundle 生成
- INTEGRITY_MISMATCH 時 AI 必須拒絕操作並警告
- bundle status ≠ ok 時禁止開始 Claude 作業
- confidence < 0.60 時停止輸出，說明缺乏足夠資訊

---

### A5. Tombstone 不可刪除

- tombstone 一旦建立，永遠保留於 `symbol-table.json`
- 禁止修改或刪除任何 tombstone 條目
- 違反視為 INTEGRITY_VIOLATION，必須停止操作

---

### A6. Compile-Time Computation 優先

任何 resolver 在 query time 需要知道的資訊，都應在 compile time 預計算並存入 bundle，而不是在 session 中即時估算。

範例：`_token_weight` 在 compile 時預計算，供 Context resolver budget-aware selection 使用。

---

### A7. 靜態規則優先於動態 Resolver

凡是能用靜態規則解決的治理問題（如 authority precedence），不應引入動態解析邏輯。靜態規則可以被 compile.js 驗證；動態邏輯只能在 runtime 觀察。

Tree / Overlay authority precedence（見 `sys-l3k-arch.json` governance.precedence_rules）：
1. **write_permission**：owns edge 永遠優先於 scenario participant roles
2. **execution_blocking**：Overlay blocks edge 優先於 Tree hierarchy 執行順序
3. **semantic_inheritance**：Tree 的 design_memory 繼承優先於 Overlay scenario 語意群聚
4. **conflict_escalation**：無法裁決時 → PRECEDENCE_CONFLICT 警告 + 停止操作

---

### A8. P2 觸發訊號管理（anti over-engineering）

P2 項目必須附帶量化的觸發訊號。沒有觸發訊號的延後項目等同於「永遠不做」或「隨時可能被過早做」。

在觸發訊號出現前不應動工：

| 項目 | 觸發訊號 |
|------|---------|
| uid namespace | 出現第一個真實的 multi-project merge 需求 |
| policy-centric overlay | 現有機制在三個以上具體場景明確失效且無法修補 |
| incremental context cache | 同一 session 內重複 resolve 同一 uid 超過 3 次 |
| semantic query language | resolve_context() 的參數組合超過 5 種常用 pattern |
| AI-assisted graph maintenance | Overlay edges 超過 50 條，人工維護開始出錯 |

---

### A9. BUILD 範圍凍結（scope freeze）

Commander session 與 Worker session 下：

- 每次只處理一個 display_id，不得在同次 session 中處理其他節點
- 發現需要修改其他節點時，必須停止並登記，等待人工開新 session
- 禁止「順手重構」：超出 code_spec 定義範圍的修改，必須先更新 MD，再開新 session
- 禁止在 BUILD/EXECUTE 中討論架構；架構問題切換 DISCUSS，結束後才可再開 BUILD
- 禁止 AI 自行決定下一個實作目標（BUILD/EXECUTE 模式下 next 決策權屬於人類或 @queue）
- A9 適用於 Commander 和 Worker 兩個 session

違反處理：停止操作，列出超出範圍的修改，等待人工裁決。

---

## 版本

| 項目 | 版本 |
|------|------|
| AGENTS-axioms.md | **v4.5** |
| 最後更新 | 2026-05-18 |
