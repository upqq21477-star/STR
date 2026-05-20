# AGENTS-changelog.md
> 變動頻率：每版都動
> 修改 authority：人類寫，Claude 草稿

---

## v4.5（2026-05-19）

> 依據：STR_v4_4_todo_updated.md（Commander/Worker 架構設計 + 五輪討論）
> 第一批（TODO-01、TODO-03、TODO-05、TODO-11、TODO-A）

| 類別 | 項目 | 優先級 | TODO |
|------|------|--------|------|
| 模式 | 廢棄 DEEP / FAST 模式（v4.3 已從 protocol 移除；本版在 changelog 正式登記廢棄）| P0 | TODO-01 |
| 公理 | 新增 A9：BUILD 範圍凍結（scope freeze，適用 Commander 和 Worker；含禁止 AI 自行決定 next）| P0 | TODO-03 |
| 資料層 | 新增 `code-spec.schema.md`（Code Spec Layer 格式規範 v1.0，含缺口一/二文件化）| P0 | TODO-05 |
| 資料層 | 新增 `constraint-vocab.md` 最小版本 v0.1（P0-lite，5 forbidden + 4 must_satisfy）| P0-lite | TODO-11 |
| 工具鏈 | compile.js 移除 id_index tombstone fallback；symbol-table.json 不存在時輸出 `SYMBOL_TABLE_REQUIRED` error | P0 | TODO-A |
| 工具鏈 | id_index.json 輸出格式：移除 tombstones 區塊，保留 `$integrity`、`entries[]`（rename from `index`）| P0 | TODO-A |
| 工具鏈 | COMPILE_REPORT tombstone_source 固定為 `symbol-table.json` | P0 | TODO-A |
| 工具鏈 | compile.js 版本標記更新至 v4.5 | P0 | TODO-B（部分）|
| 公理 | AGENTS-axioms.md 版本更新至 v4.5 | P0 | TODO-B（部分）|

> 第二批（TODO-F、TODO-06）

| 類別 | 項目 | 優先級 | TODO |
|------|------|--------|------|
| 資料層 | 新增 `execution-contract.schema.json`（Commander 輸出 / Worker 唯一輸入格式）| P0 | TODO-F |
| 資料層 | 新增 `execution-contract.schema.md`（人類參考說明，含範例、Worker 輸出格式、缺口四文件化）| P0 | TODO-F |
| 資料模型 | `devlog-node.schema.md` 新增 `code_spec` 選填欄位（格式：`filename#display_id`，含 $note 語意差異說明）| P0 | TODO-06 |
| 資料模型 | `devlog-node.schema.json` 新增 `code_spec` 欄位定義（含 pattern 驗證）| P0 | TODO-06 |

> 第三批（TODO-E、TODO-07、TODO-02、TODO-H）

| 類別 | 項目 | 優先級 | TODO |
|------|------|--------|------|
| 工具鏈 | compile.js 新增 `--extract [display_id]`：Context Sanitizer，產出 `build_slice_[id].json` | P0 | TODO-E |
| 工具鏈 | compile.js 新增 `--validate-contract [file]`：Purity Validator，驗證 execution_contract 純淨性 | P0 | TODO-E |
| 工具鏈 | 新增 error codes：`CONTRACT_FORBIDDEN_FIELD`、`CONTRACT_MISSING_FIELD`、`CONTRACT_UNKNOWN_DEPENDENCY`、`CONTRACT_UNKNOWN_CONSTRAINT` | P0 | TODO-E |
| 工具鏈 | compile.js validate() 新增 code_spec 格式驗證；新增 error codes：`INVALID_CODE_SPEC`、`CODE_SPEC_ID_MISMATCH` | P0 | TODO-07 |
| 模式 | AGENTS-protocol.md 重新定義 BUILD 為指揮官 session（產出 execution_contract）；廢棄 BUILD --fix | P0 | TODO-02 |
| 模式 | AGENTS-protocol.md 新增 EXECUTE 模式（Worker session，唯一輸入 execution_contract）| P0 | TODO-02 |
| 協定 | AGENTS-protocol.md 新增 Commander Operating Boundary 區塊（允許/禁止清單 + coverage_check 格式）| P0 | TODO-H |
| 模式 | AGENTS-protocol.md REVERSE 模式新增：自動產生 code-*.md 骨架（含 @node anchor，禁止 AI 填入 constraint）| P0 | TODO-09 |
| 文件 | AGENTS-protocol.md 版本更新至 v4.5 | P0 | TODO-B（部分）|

> 第四批（TODO-04、TODO-08、TODO-G/D）

| 類別 | 項目 | 優先級 | TODO |
|------|------|--------|------|
| 模式 | AGENTS-protocol.md EXECUTE 模式：NEXT 區塊明確禁止 AI 自行推斷下一個節點，改由 @queue 或人類指定 | P0 | TODO-04 |
| 公理 | AGENTS-axioms.md A9 補充：「禁止 AI 自行決定下一個實作目標（BUILD/EXECUTE 模式下 next 決策屬於人類或 @queue）」| P0 | TODO-04 |
| 工作流 | AGENTS-workflow.md 對話中指令表新增 BUILD / EXECUTE / --verify / --spec 相關指令 | P0 | TODO-08 |
| 工作流 | AGENTS-workflow.md 新增情境 D1（指揮官）/ D2（Worker）/ E（VERIFY）三段式流程 | P0 | TODO-G |
| 工作流 | AGENTS-workflow.md State Files Reference 表格新增 build_slice / execution_contract / code-[domain] / execution-contract.schema / constraint-vocab | P0 | TODO-D |
| 工具鏈 | AGENTS-workflow.md 工具鏈表新增 compile.js --extract / --validate-contract / --dir 選項 | P0 | TODO-08 |
| 工作流 | AGENTS-workflow.md 版本更新至 v4.5 | P0 | TODO-B（部分）|

> 第五批（TODO-B 剩餘、TODO-C）

| 類別 | 項目 | 優先級 | TODO |
|------|------|--------|------|
| 版本管理 | sys-l3k-arch.json governance.schema_version 更新至 "4.4"；migration_log 新增 v4.5 條目 | P0 | TODO-B |
| 資料模型 | devlog-node.schema.json uid description 修正為「v4.3 新建：16位；v4.0 存量：12位（legacy）」| P0 | TODO-B |
| 文件 | README.md 更新至 v4.5（STR v4.5 Quick Start）；新增 D1/D2/E 流程、compile.js 選項表、v4.5 檔案清單 | P0 | TODO-C |

---

## v4.3（2026-05-17）

> 依據：STR_todo_v4_3.md（工程師架構評審兩輪分析）

| 類別 | 項目 | 優先級 |
|------|------|--------|
| 基礎設施 | uid entropy 升級：48-bit（12位）→ 64-bit（16位）。存量 uid 不強制遷移，compile.js 同時接受兩種長度，COMPILE_REPORT 標注 legacy uid 數量 | P0 |
| 基礎設施 | compile.js 新增節點 `_token_weight` 預計算（`JSON.stringify(node).length / 4`），存入 bundle 每個節點，供 Context resolver budget-aware selection 使用 | P0 |
| 資料模型 | tombstone 升級為 identity lineage schema：新增 `lineage.type`（frozen enum：replaced / split / merged / semantic_equivalent）、`replaced_by`、`note` | P0 |
| 資料模型 | symbol-table.json 成為 tombstone source of truth；id_index.json tombstones 區塊標記為 deprecated（目標 v4.5 移除）；compile.js 優先從 symbol-table.json 讀取 tombstone，fallback 至 id_index.json | P0 |
| 資料模型 | symbol-table.json 新增 namespace_reserved: true 欄位（保留 multi-project merge 擴充介面，本版不實作）| P0 |
| 治理 | sys-l3k-arch.json governance 新增 `precedence_rules` 靜態規則（write_permission / execution_blocking / semantic_inheritance / conflict_escalation）；compile.js 新增 PRECEDENCE_CONFLICT 檢查 | P1 |
| 治理 | AGENTS.md 拆分為四份：AGENTS-axioms.md（極低頻）、AGENTS-protocol.md（中頻）、AGENTS-workflow.md（高頻）、AGENTS-changelog.md（每版）；各層定義修改 authority | P1 |
| 治理 | sys-l3k-arch.json migration 新增 `migration_log` 區塊，記錄版本演化 | P1 |
| 治理 | sys-l3k-arch.json schema_version 更新至 "4.3" | P1 |
| 延後 | uid namespace（P2）：等待第一個真實 multi-project merge 需求觸發訊號 | P2 |
| 延後 | policy-centric overlay（P2）：等待現有機制在三個以上具體場景明確失效 | P2 |

---

## v4.0（2026-05-16）

| 變更項目 | 說明 |
|---------|------|
| compile.js toolchain | 新增 compile.js（驗證 + cycle detection + bundle 輸出 + index 重建）|
| migrate_v3_to_v4.js | 新增遷移工具（id → uid+display_id；affects[] → effect[]）|
| compile workflow | 對話前置作業：compile → 確認 status=ok → 上傳 bundle |
| uid / display_id 分離 | id 欄位廢棄；uid（系統身份）+ display_id（人類拓撲）分離 |
| effect[] 結構化 | affects[]（自由字串）廢棄；改為 effect[]{uid, edge_type} |
| edge_registry | edge_type 改由 sys-l3k-arch.json edge_registry 管理；AI 唯讀 |
| sys-l3k-arch.json | 新增架構宣言層（edge_registry、governance、compile_pipeline）|
| FORBIDDEN ACTIONS | 初版 22 條，分為身份不可變性 / graph 完整性 / 權威來源 / 格式版本 / 信心閾值 |
| bundle confidence check | 新增 bundle status ≠ ok 時強制停止規則 |
| root_code | L0 新增 root_code 欄位（建檔時人類指定，不可更改）|
| 分檔結構 | 7 個系統檔（arch / pressure / unit / combat / ui / diplomacy / ref）|
