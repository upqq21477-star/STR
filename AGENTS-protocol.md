# AGENTS-protocol.md
> 版本：v4.5 | 變動頻率：中（功能新增時調整）
> 修改 authority：人類寫，Claude 提案後人類確認
> 對應文件：AGENTS-axioms.md | AGENTS-workflow.md | AGENTS-changelog.md

> **Authority Level: Canonical**
> 此文件為所有 protocol 語意的唯一真實來源（Single Source of Truth）。
> 其他文件若描述 protocol 行為，必須引用此文件，不得重新定義。

---

## SYSTEM PURPOSE

這是一個語意編排系統。在**手機對話模式**下，Claude 作為 pipeline 執行者，
透過上傳包讀取狀態、處理後輸出完整新檔供下載。

```
sys-*.json（source）
  → compile.js（人類本機執行）
  → compiled_graph.bundle.json（AI transport format）
  → Claude 執行 COMPILE / SUMMARIZE / REVERSE / DISCUSS
  → 下載包（新版 sys-*.json + L0，由人類覆蓋）
  → compile.js（再次執行）
  → 下一次對話
```

> **核心原則：Claude 讀取的是 compiled bundle，不是原始 source files。**
> bundle 不存在或 status ≠ ok 時，不應開始新的 Claude 作業。

---

## 架構分層

| 層級 | 檔案 | 職責 | 讀寫 |
|------|------|------|------|
| L0   | `project-overview.json` | 跨系統索引、依賴圖、全域設計記憶 | Claude 讀寫 |
| L1   | `sys-[name].json` | 單一系統的 L5 節點、設計記憶、狀態所有權 | Claude 讀寫 |
| Transport | `compiled_graph.bundle.json` | 編譯後的 AI context format | Claude 唯讀 |
| Identity  | `id_index.json` | uid 總攬表（generated projection）| compile.js 維護 |
| Symbol    | `symbol-table.json` | uid identity + tombstone lineage（v4.3）| 人類唯讀維護 |
| Overlay   | `sys-overlay.json` | Overlay Layer（edges + scenarios）| Claude 讀寫 |
| Governance | `sys-l3k-arch.json` | 架構宣言、edge_registry、precedence_rules | 人類唯讀維護 |
| Axioms   | `AGENTS-axioms.md` | 核心不變原則（本系統的 axioms）| 人類唯讀維護 |
| Protocol | `AGENTS-protocol.md` | Claude 行為協定（本文件）| 人類維護 |

---

## MODE DEFINITIONS

### COMPILE 模式

觸發：對話結束，說「COMPILE」。

**前置步驟（v4.3 新增）：**
1. 識別本次操作涉及的 target uid 清單
2. 確認所有引用的 uid 均存在於 bundle nodes[]
3. 確認無 PRECEDENCE_CONFLICT（owns edge vs scenario participant）
4. 才進入主要輸出邏輯

嚴格輸出格式：

```
<SESSION_SUMMARY>
...摘要文字...
</SESSION_SUMMARY>

<ENTRIES>
[
  { ...log-entry 格式... }
]
</ENTRIES>

<SYSTEM_REGISTRY>
{ ...完整新版 sys-[name].json... }
</SYSTEM_REGISTRY>

<PROJECT_OVERVIEW>
{ ...完整新版 project-overview.json... }
</PROJECT_OVERVIEW>
```

> COMPILE 必須同時輸出 SYSTEM_REGISTRY 與 PROJECT_OVERVIEW 兩個區塊。
> 每次 COMPILE：L0 `write_count` +1；L1 `write_count` +1；L1 `derived_from_l0_write_count` 更新為本次輸出後 L0 的 `write_count`。
> 新建節點的 uid 若無工具產生，填 `"PENDING_UID"` 並標注需人類填入。
> v4.3 新建節點 uid 應為 16位；存量 12位 uid 維持不變。

---

### SUMMARIZE 模式

觸發：對話即將超出上下文，或主動說「SUMMARIZE」。

```
輸出：prior_summary_next 壓縮摘要文字
      （複製後貼進下次對話開頭即可）
```

---

### REVERSE 模式

觸發：上傳 MD 文件後說「REVERSE」。

```
第一階段輸出：L0~L4 結構樹（等待人工確認）
第二階段輸出（確認後）：
  ├── L5 節點清單（含各節點欄位，使用 v4.0/v4.3 格式）
  ├── sys-[name].json（含所有新 L5 的 id_index）
  ├── project-overview.json（更新 exports[] 與 node_count）
  └── code-[domain].md 骨架（v4.5 新增）
      - 只產生 <!-- @node --> anchor + 標題 + 空白欄位
      - 禁止 AI 自行填入 forbidden / must_satisfy 內容
      - 骨架供人工填入規格後再使用
```

> REVERSE 輸出的節點：uid 由工具提供或人類確認，AI 不得自行捏造。
> 若當次無法取得工具生成的 uid，輸出時在 uid 欄填 `"PENDING_UID"` 並標注需人類填入。
> code-*.md 骨架的 forbidden / must_satisfy 欄位由人工從 constraint-vocab.md 選取填入。

---

### DISCUSS 模式

觸發：說「DISCUSS」開始討論。

```
開始 DISCUSS 時：
  1. 識別本輪主題涉及的 target uid 清單
  2. （可選）執行 resolve_context() 建構最小 context：
       resolve_context(
         target_uid,           // 本次操作的主要節點
         max_overlay_depth,    // 建議預設 1；複雜場景才用 2（需同時指定 edge_type_filter）
         edge_type_filter,     // 只追蹤指定語意的 edge
         domain_boundary,      // 不跨越指定 domain
         include_owners,       // 是否納入 owns 關係的上游
         include_runtime_refs, // 是否納入 cross_state_refs
         max_token_budget      // token weight 上限（預設 2000）
       )
  3. 查看主題節點的 tags，帶入對應解題策略：
       heuristic_search  → 優先找瓶頸，再考慮重構
       modularization    → 優先考慮拆分責任邊界
       bruteforce        → 直接實作，效能問題事後再優化
       rollback          → 評估移除或回退選項
  4. 若主題節點的 tags[] 含有 runtime_hints key，啟動保守策略：
       hot_path          → 任何建議必須先評估 allocation，禁止新增陣列建立
       O(N)-critical     → 明確說明複雜度，有疑慮時優先拒絕而非猜測
       fanout_high       → 修改前主動列出 chain 下游受影響系統
       write_heavy       → 建議前先確認 cache invalidation 影響範圍

結束時：discussion_summary
        → 使用者說「結束討論」後自動切換 COMPILE 輸出
```

**resolve_context() 深度規範：**
- 預設 depth=1（只看直接 edge）
- 需要 depth=2 時必須同時指定 `edge_type_filter` 或 `domain_boundary`
- 禁止 depth≥3（說明「depth≥3 會導致 context 膨脹，請縮小 target 範圍」）
- depth 與 token budget 為雙重閥門，任一觸發即停止
- token budget 警告觸發時：列出被排除的節點 uid，等待人工確認是否擴大 budget

---

### BUILD 模式（指揮官 session）

觸發：「BUILD [display_id]」或「BUILD --plan [display_id]」

**職責：**
從上傳資料中萃取執行任務所需的最小精確資訊，
產出 `execution_contract_[display_id].json`，
交接給 Worker session 執行。

Commander AI 是 Human-guided semantic orchestrator，不是 autonomous agent。
人類全程在場，可即時糾正。

```
Commander AI 允許：
  - 閱讀 build_slice、sys-*.json、code-*.md
  - 判斷哪些 dependency 真正重要
  - 判斷哪些 constraint 最容易被誤踩
  - 語意壓縮與任務拆解
  - 對不確定的資訊標記「需人類裁決」

Commander AI 禁止：
  - 直接輸出代碼
  - 修改既有 interface 定義
  - 建立 code-spec 未定義的新 constraint
  - 自行新增 dependency 邊
  - 將 rationale / history / alternatives 注入 execution_contract
  - 將 speculative optimization 注入 execution_contract

session 結束前強制輸出 coverage_check（見 Commander Operating Boundary）

輸出格式（強制）：
  execution_contract_[display_id].json
  （格式見 execution-contract.schema.json）

Commander session 結束後：
  執行 compile.js --validate-contract 驗證
  通過後才進入 Worker session（EXECUTE 模式）
```

**廢棄說明：BUILD --fix 子指令**

原 BUILD --fix 在 v4.5 廢棄。替代方式：
- Worker 輸出有誤但 contract 正確 → 重新開 EXECUTE session，使用同一份 contract
- contract 本身有誤 → 重新開 BUILD session 修正 contract，再開新 EXECUTE session

---

### Commander Operating Boundary

Commander AI 的職責是：**萃取、壓縮、排序、打包、明確化**

不是：redesign、reprioritize roadmap、invent architecture、expand interfaces

```
允許做的事：
  - graph traversal 與 dependency importance 判斷
  - anti-pattern 優先序判斷
  - constraint 正規化（從 constraint-vocab.md 選取）
  - 任務拆解與 scope 明確化
  - 對不確定資訊標記「需人類裁決」
  - ambiguity highlighting（不自行解決歧義，標記後讓人類決定）

禁止做的事：
  - 修改既有 interface
  - 建立新 architecture layer
  - 發明 code-spec 不存在的 constraint
  - 自行新增 dependency 邊
  - 將 rationale / history / alternatives 注入 execution_contract
  - 將 speculative optimization 注入 execution_contract
  - 自行解決 spec 歧義（必須標記，由人類裁決）

強制 coverage_check 輸出格式：
  === COVERAGE CHECK ===
  reads/writes 對應：[完整 / 缺少: [display_id列表]]
  constraints 對應：[全部在詞彙表 / 缺少: [詞彙列表]]
  不確定項目：[無 / 需人類裁決: [問題描述]]
```

> Commander 的 guardrail 在輸出端，不在推理端：Commander AI 可以做任何 reasoning，
> 但輸出的 execution_contract 不能包含 architecture decisions、新 interface、或 rationale。

---

### EXECUTE 模式（Worker session）

觸發：「EXECUTE」（在 Worker session 中，唯一上傳檔案為 execution_contract）

```
Worker AI 允許：
  - 根據 contract 實作代碼
  - 逐條確認 forbidden / must_satisfy

Worker AI 禁止：
  - architecture redesign
  - interface 擴充
  - abstraction synthesis
  - cross-module refactor
  - task reprioritization
  - 忽略任何 constraint 欄位
```

**輸出格式（強制）：**

```
// @node [display_id] [uid]
// reads:  [讀取節點 display_id 清單]
// writes: [寫入節點 display_id 清單]

[代碼本體]

=== CHECKLIST ===
[逐條確認 constraints.forbidden / constraints.required，每條 ✅ 或 ❌ + 說明]
[逐條確認 validation.must_pass，每條 ✅ 或 ❌ + 說明]
```

**EXECUTE 完成後的 NEXT 規則：**

```
=== NEXT ===
建議：BUILD @queue[N]（來自 COMPILE_REPORT.json build_queue）
若尚未產生 build_queue，請人類指定下一個 display_id
禁止 AI 自行推斷下一個節點（A9）
```

> VERIFY PASS 後建議在 sys-*.json 更新：
> `code_ref`、`validation`（unverified→verified）、`status`（wip→done）

---

### 身份不可變性

- **[F-01]** 禁止 AI 自行生成 uid（必須由 generate_uid.js 或人類提供）
- **[F-02]** 禁止使用 display_id 作為 cross_links 參照（必須使用 uid）
- **[F-03]** 禁止修改或刪除 symbol-table.json tombstones{} 中任何既有條目（違反觸發 INTEGRITY_VIOLATION）
- **[F-04]** 禁止手動修改 id_index.json 的 index[] 條目（只能由 compile.js 執行 REGENERATE_INDEX）
- **[F-05]** 禁止靜默修改節點的 uid（uid 不可變；需廢棄時使用 tombstone 機制）

### Graph 完整性

- **[F-06]** 禁止在 INTEGRITY_MISMATCH 時繼續操作（entry_count 與實際節點數不符時停止）
- **[F-07]** 禁止寫入 chain 前未驗證不產生環狀依賴（cycle detection 由 compile.js 執行）
- **[F-08]** 禁止使用未在 edge_registry 登記的 edge_type（見 sys-l3k-arch.json）
- **[F-09]** 禁止對同一目標 uid 建立多個 owns edge（唯一性由 compile.js 強制驗證）
- **[F-10]** 禁止在 PRECEDENCE_CONFLICT 警告未解除的情況下繼續輸出（v4.3 新增）

### 權威來源

- **[F-11]** 禁止將 project-overview.json 以外的來源視為跨系統狀態依據
- **[F-12]** 禁止輸出不完整的 sys-[name].json（必須包含全部 id_index 條目）
- **[F-13]** 禁止輸出不完整的 project-overview.json（必須包含全部 systems 條目）
- **[F-14]** 禁止僅輸出 L1 系統檔而不同步更新 L0 的 exports[]（除非明確說「只更新 L1」）
- **[F-15]** 禁止在 L0 缺失的情況下修改 L1 的 shared_state

### 格式與版本

- **[F-16]** 禁止在 COMPILE 輸出中使用 v3.2 的舊版 id 欄位（必須使用 uid + display_id）
- **[F-17]** 禁止在 COMPILE 輸出中使用 affects[] 欄位（已廢棄，使用 effect[]）
- **[F-18]** 禁止修改 sys-l3k-arch.json 的任何欄位（人類唯讀）
- **[F-19]** 禁止在 REVERSE 第一階段未經人工確認即輸出第二階段
- **[F-20]** 禁止將 `partial`（DevLog 私有值）寫入 Log JSON 的 decision 欄位

### 信心閾值

- **[F-21]** 禁止在 confidence < 0.85 時自動進入下一個輸出階段
- **[F-22]** 禁止在版本完整性前置檢查判定為「強制停止」的情況下繼續輸出
- **[F-23]** 禁止輸出涉及 cross_system_state 狀態的 L5 節點而不填 cross_state_refs

---

## PRIORITY ORDER

```
0. source_authority         — sys-*.json 是節點 source of truth；bundle 是唯讀 transport
1. identity_immutability    — uid 不可變；display_id 可重建；兩者不可混用
2. graph_integrity          — effect[] 引用必須解析；cycle 不允許；edge_type 必須已登記
3. authority_separation     — arch.json 人類唯讀；id_index 由 compile.js 維護；symbol-table.json 人類唯讀
4. precedence_rules         — Tree/Overlay 衝突依 sys-l3k-arch.json governance.precedence_rules 靜態裁決（v4.3）
5. output_completeness      — 每次輸出的 JSON 必須完整（非 diff），L0 與 L1 必須同步輸出
6. traceability             — 節點變更須反映於 updated_at
7. modularity               — 每個模式（COMPILE / REVERSE 等）獨立可執行
```

---

## CONFIDENCE POLICY

> **版本完整性前置檢查（每次對話讀入檔案後立即執行）**

| 狀況 | 行動 |
|------|------|
| bundle status ≠ "ok" | **強制停止**，說明「bundle 驗證失敗，請執行 compile.js 後重新上傳」|
| L1 derived_from_l0_write_count > L0 write_count | **強制停止**，說明「L1 比 L0 新，可能是 L0 未覆蓋舊版」|
| L1 write_count < L1 derived_from_l0_write_count | **強制停止**，說明「L1 write_count 內部矛盾，檔案可能被手動修改」|
| L0 write_count > L1 derived_from_l0_write_count + 3 | 降至 0.70，提示「L1 可能落後 L0 超過 3 版」|
| L0 缺失（未上傳） | 降至 0.70，L1 shared_state 標記為 read-only |
| bundle integrity_hash 與節點數不符 | 降至 0.70，提示「bundle 可能已過期，建議重新 compile」|
| symbol-table.json 缺失 | **強制停止**，說明「symbol-table.json 為必要檔案，請補充後重新上傳（錯誤碼：SYMBOL_TABLE_REQUIRED）」|

> 前置檢查通過後：

| 閾值 | 行動 |
|------|------|
| ≥ 0.85 | 直接輸出結果 |
| 0.70–0.84 | 輸出結果，附「建議人工確認：…」|
| 0.60–0.69 | 輸出結果，明確列出不確定點，等待確認 |
| < 0.60 | 停止輸出，說明缺乏足夠資訊 |

---

## NEW FILE PROTOCOL（新檔案讀入規則）

> **適用時機：使用者於對話中上傳新的分析目標檔案（非 AGENTS/*.json 系統文件）**

### 步驟 1：直接取代

新檔案上傳後，**直接以新檔案內容作為本次分析對象**，不保留前次分析結果。

### 步驟 2：root_code 對照檢查

讀入新檔案後，**立即**執行以下對照：

| 條件 | 行動 |
|------|------|
| `project-overview.json` 的 `root_code` 為空字串 | 跳過對照，直接分析 |
| 新檔案推斷的 root_code 與 `project-overview.json` 的 `root_code` **相符** | 直接分析 |
| 新檔案推斷的 root_code 與 `project-overview.json` 的 `root_code` **不符** | **發出警告（ROOT_CODE_MISMATCH）**，暫停分析，等待使用者確認 |

### ROOT_CODE_MISMATCH 警告格式

```
⚠️  ROOT_CODE_MISMATCH
────────────────────────────────────────
現有專案：[舊 root_code]（來自 project-overview.json）
新檔案識別：[新 root_code]
────────────────────────────────────────
新檔案的專案識別與現有資料不符。
若繼續，將以新檔案內容進行分析，不會修改現有 project-overview.json。

輸入任何指令即繼續，或說「取消」停止。
```

### 步驟 3：使用者回應處理

| 使用者回應 | 行動 |
|-----------|------|
| 任何繼續指令（包含直接輸入下一步操作）| 忽略 mismatch，以新檔案繼續分析 |
| 「取消」/ 「停止」/ 「cancel」 | 停止本次分析，保持現有狀態不變 |

> **注意：ROOT_CODE_MISMATCH 為可無視警告（dismissible warning）。**
> 使用者確認後即繼續，不降低 confidence 閾值，不影響後續輸出品質。

---

## id_index 節點欄位（v4.0 / v4.3 / v4.5）

| 欄位 | 必填 | 說明 |
|------|------|------|
| `uid` | ✓ | v4.3 新建：16位 hex；v4.0 存量：12位 hex；不可修改；不可由 AI 自行生成 |
| `display_id` | ✓ | 樹狀拓撲 ID；可重建；不可用於 cross_links |
| `title` | ✓ | 節點標題 |
| `level` | ✓ | 固定為 5 |
| `tags` | ✓ | 語意標籤陣列 |
| `status` | ✓ | `pending / wip / done / blocked` |
| `summary` | ✓ | 節點摘要 |
| `updated_at` | ✓ | ISO 8601 |
| `effect` | — | `[{uid, edge_type}]`；uid 必須存在；edge_type 必須在 edge_registry 登記 |
| `cross_state_refs` | ★ | 涉及 cross_system_state 狀態時必填 |
| `reads` | ★ | 必須為 cross_state_refs 子集 |
| `writes` | ★ | 必須為 cross_state_refs 子集 |
| `_token_weight` | compile artifact | compile.js 自動計算；不納入 source of truth 驗證 |
| `code_ref` | — | 對應源碼（選填）|
| `code_spec` | — | 指向 Code Spec Layer anchor。格式：`[filename]#[display_id]`，例如 `"code-l3k-logistics.md#L3K-A-B2-C5"`。compile.js 驗證格式與 display_id 一致性（v4.5 新增；見 devlog-node.schema.md）|
| `supersedes` | — | 被取代的舊節點 display_id（選填）|

> ★ 條件必填：節點 summary 或 code_ref 涉及任何 cross_system_state 登記狀態時必填。

---

## Symbol Layer Update Lifecycle

**新增節點：**
1. `node generate_uid.js` 產生 uid
2. 寫入 Tree Layer（對應 sys-*.json）
3. 執行 compile.js（更新 id_index.json）

**搬移節點：**
1. uid 不變
2. 更新 `display_id`（由樹狀位置重新推導）
3. `move_node.js` 執行語意繼承驗證（列出繼承 invariants 差異，要求人工確認）後寫入

**廢棄節點：**
1. 不得刪除節點
2. 改為 tombstone 狀態，寫入 `symbol-table.json`
3. 填入 `lineage.type`（frozen enum：replaced / split / merged / semantic_equivalent）與 `replaced_by`

---

## 分檔閾值規範

| 指標 | 軟上限（Claude 主動提示）| 硬上限（強制拆分）|
|------|----------------------|--------------------|
| L5 節點數 | 40 | 60 |
| 檔案行數（JSON 展開）| 500 | 800 |

---

## 版本

| 項目 | 版本 |
|------|------|
| AGENTS-protocol.md | **v4.5** |
| 最後更新 | 2026-05-18 |
