# AGENTS-workflow.md
> 版本：v4.5 | 變動頻率：高（工具升級時調整）
> 修改 authority：人類寫
> 注意：Claude session 上傳包不需要此文件

> **Authority Level: Operational**
> 此文件描述操作流程，不定義 protocol 語意。
> Protocol 定義以 AGENTS-protocol.md 為準。

---

## 對話前置作業（人類執行）

每次開始新對話**之前**，在本機執行：

```bash
node compile.js
```

確認 `COMPILE_REPORT.json` 的 `status: "ok"` 後才上傳 bundle。
若 compile 失敗（輸出 `COMPILE_ERROR.json`），必須先修正 source files，不得繼續上傳。

---

## 上傳包：三種情境

**情境 A：針對單一系統作業（最常見）**
```
compiled_graph.bundle.json  ← 必上傳
AGENTS-axioms.md            ← 必上傳
AGENTS-protocol.md          ← 必上傳
sys-[目標系統].json         ← 必上傳（需輸出新版 L1 時加入）
project-overview.json       ← 需修改 L0 時加入
[當次工作文件]              ← 視需要（MD、文字等）
```

**情境 B：跨系統討論（無需修改 source）**
```
compiled_graph.bundle.json  ← 必上傳
AGENTS-axioms.md            ← 必上傳
AGENTS-protocol.md          ← 必上傳
```

**情境 C：建立新專案**
```
project-overview.json       ← 空白模板
AGENTS-axioms.md            ← 必上傳
AGENTS-protocol.md          ← 必上傳
tags.json                   ← 必上傳
sys-template.json           ← 複製並重命名
symbol-table.json           ← 空白模板（v4.3 新增）
```

> 情境 C 不需要 bundle（新專案無節點）。

**情境 D1：指揮官 session（BUILD）**
```
build_slice_[display_id].json   ← compile.js --extract 產出（必上傳）
AGENTS-axioms.md                ← 必上傳
AGENTS-protocol.md              ← 必上傳
code-[目標 domain].md           ← 只上傳本次 domain（必上傳）
COMPILE_REPORT.json             ← 建議上傳（供 Commander 確認節點狀態；P1 後含 build_queue）
```
> 不上傳完整 bundle；不上傳無關 domain 的 code-*.md。
> 輸出：`execution_contract_[display_id].json`
> Commander session 結束後執行 `compile.js --validate-contract` 驗證，通過後才進情境 D2。

**情境 D2：Worker session（EXECUTE）**
```
execution_contract_[display_id].json   ← 唯一上傳檔案
```
> 不上傳任何其他檔案。
> 輸出：代碼檔案（含 @node 標頭 + CHECKLIST）。

**情境 E：驗收代碼（BUILD --verify）**
```
execution_contract_[display_id].json   ← 必上傳
[待驗收的代碼檔案]                     ← 必上傳
```
> 不需要上傳 bundle 或 AGENTS 文件；contract 本身包含所有驗收所需約束。

---

## 對話中指令

| 指令 | 說明 |
|------|------|
| `COMPILE` | 記錄本次對話，輸出 entries[] + 新版 L1 檔 + 同步 L0 |
| `SUMMARIZE` | 輸出壓縮前情摘要，貼進下次對話開頭 |
| `REVERSE` | 對上傳的 MD 執行分層，輸出 L0~L5 結構 + 新版 L1 檔 + 同步 L0 + code-*.md 骨架 |
| `DISCUSS` | 多輪問答，結束後切換 COMPILE 輸出 |
| `BUILD [display_id]` | 開啟指揮官 session，整理任務並產出 `execution_contract_[id].json` |
| `BUILD --plan [display_id]` | 同上，加強任務規劃輸出（適用複雜節點）|
| `BUILD [display_id] --verify` | 驗收 Worker session 產出的代碼（上傳 contract + 代碼後執行）|
| `BUILD [display_id] --spec` | 只輸出規格摘要，不產出 contract |
| `EXECUTE` | 開啟 Worker session，讀取 execution_contract 產出代碼（唯一上傳為 contract）|
| `REGENERATE_INDEX` | 輸出重建後的 id_index.json（從 bundle 的 nodes[] 重建，更新 entry_count 與 generated_at）|
| `刪除 [uid]` | 將節點移入 symbol-table.json tombstones，輸出新版 L1 檔 + 同步 L0；不得刪除 uid，只能 tombstone |
| `新增系統 [名稱]` | 輸出新的空白 sys-[名稱].json + 更新 L0 systems 登記 |

---

## 下載包

```
sys-[作業系統].json         ← 必下載（覆蓋舊版）
project-overview.json       ← 必下載（覆蓋舊版）
symbol-table.json           ← 有新 tombstone 時下載（覆蓋舊版）
session-log-[日期].json     ← 可選（本次 entries 存檔）
```

> ⚠️ 下載後必須重新執行 `node compile.js` 才能進行下一次對話。
> L0 與 L1 需**同時下載**覆蓋，否則 exports[] 與 id_index 會不同步。

---

## 工具鏈指令（依優先順序）

| 優先 | 工具 | 指令 | 說明 | 版本 |
|------|------|------|------|------|
| 1 | generate_uid.js | `node generate_uid.js` | 產生新 uid（64-bit，16位 hex）| v4.3 |
| 1 | generate_uid.js | `node generate_uid.js 5` | 批次產生 5 個 uid | v4.3 |
| 1 | generate_uid.js | `node generate_uid.js --check <uid>` | 驗證 uid 格式（接受 12或16位）| v4.3 |
| 2 | validate_integrity.js | `node validate_integrity.js` | COMPILE 前執行；驗證 entry_count、tombstone、uid 格式 | v4.2 |
| 3 | regenerate_index.js | `node regenerate_index.js` | 從 sys-*.json 重建 id_index.json | v4.2 |
| 4 | compile.js | `node compile.js` | 完整編譯（含 token weight 預計算）| v4.3 |
| 4 | compile.js | `node compile.js --validate-only` | 僅驗證，不寫入 | v4.3 |
| 4 | compile.js | `node compile.js --bundle-only` | 輸出 bundle，不更新 id_index | v4.3 |
| 4 | compile.js | `node compile.js --extract [display_id]` | Context Sanitizer：產出 `build_slice_[id].json` 供 D1 session | v4.5 |
| 4 | compile.js | `node compile.js --dir [path]` | 指定專案目錄執行（預設當前目錄）| v4.5 |
| 4 | compile.js | `node compile.js --validate-contract [file]` | Purity Validator：驗證 execution_contract 純淨性 | v4.5 |
| 5 | move_node.js | `node move_node.js <uid> <target_path>` | 含語意繼承驗證的節點搬移 | v4.2 |
| 6 | check_uid_collision.js | `node check_uid_collision.js` | merge 前執行 | v4.2 |
| 7 | validate_overlay.js | `node validate_overlay.js` | 檢查 Overlay 准入規則 | v4.2 |
| 8 | resolve_context.js | `node resolve_context.js <uid>` | Context Layer resolver | v4.3 |
| 9 | migrate_v3_to_v4.js | `node migrate_v3_to_v4.js --dry-run` | 預覽 v3.2 → v4.0 遷移 | v1.0 |

---

## State Files Reference

| 檔案 | 方向 | 說明 |
|------|------|------|
| `compiled_graph.bundle.json` | 上傳（A/B/C 情境）| compile.js 輸出；Claude 讀取的 transport format |
| `project-overview.json` | 上傳 → 下載 | L0；需修改時加入上傳包 |
| `sys-[name].json` | 上傳 → 下載 | L1；每次對話後下載覆蓋舊版 |
| `symbol-table.json` | 上傳（選）→ 下載（有新 tombstone 時）| uid identity + tombstone lineage source of truth（v4.5：唯一 tombstone 來源）|
| `id_index.json` | compile.js 維護 | uid 總攬表（純 generated projection）；不含 tombstones 區塊（v4.5 移除）；不需手動上傳 |
| `AGENTS-axioms.md` | 上傳（A/B/C/D1）| 核心不變原則 |
| `AGENTS-protocol.md` | 上傳（A/B/C/D1）| Claude 行為協定 |
| `AGENTS-workflow.md` | 不上傳 | 本文件；Claude session 不需要 |
| `AGENTS-changelog.md` | 不上傳 | 版本記錄；Claude session 不需要 |
| `tags.json` | 上傳（A/B/C）| 通用語意基底層（按需裁剪：單系統 session 只上傳該系統 owns_tags 對應子集）|
| `sys-l3k-arch.json` | 上傳（可選）| 架構宣言；Claude 唯讀 |
| `COMPILE_REPORT.json` | 本機確認；建議上傳（D1）| compile.js 輸出；確認 status=ok 後才上傳 bundle；D1 用於確認節點狀態（P1 後含 build_queue）|
| `session-log-[日期].json` | 下載（可選）| COMPILE entries 存檔 |
| `build_slice_[id].json` | compile.js --extract 產出 → 上傳（D1）| Commander session 的最小合法上下文；不下載 |
| `execution_contract_[id].json` | D1 輸出 → 上傳（D2/E）| Worker session 唯一輸入 + 驗收基準；不下載 |
| `code-[domain].md` | 上傳（D1，視需要）| 本次 domain 的 Code Spec；不下載 |
| `execution-contract.schema.json` | 不上傳 | 格式規範，人類參考用 |
| `constraint-vocab.md` | 不上傳 | Constraint 詞彙表，人類維護 |

---

## 版本

| 項目 | 版本 |
|------|------|
| AGENTS-workflow.md | **v4.5** |
| 最後更新 | 2026-05-18 |
