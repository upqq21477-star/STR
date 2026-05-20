# AGENTS.md
> 版本：v4.5 | 變動頻率：低（導覽文件）| 修改 authority：人類寫
> Authority Level: Entry / Navigation（非權威）
> 此文件為導覽入口，不擁有任何規格定義。
> 所有規格以 AGENTS-protocol.md 為準；操作流程以 AGENTS-workflow.md 為準。

---

## SYSTEM PURPOSE

> → See: **AGENTS-protocol.md § SYSTEM PURPOSE**

---

## 對話前置作業（人類執行）

> → See: **AGENTS-workflow.md § 對話前置作業**

---

## 手機對話模式操作說明

### 上傳包：三種情境

**情境 A：針對單一系統作業（最常見）**
```
compiled_graph.bundle.json  ← 必上傳（compile 產生的 transport format）
AGENTS.md                   ← 必上傳（本協定）
sys-[目標系統].json         ← 必上傳（需輸出新版 L1 時加入）
project-overview.json       ← 需修改 L0 時加入
[當次工作文件]              ← 視需要（MD、文字等）
```

**情境 B：跨系統討論（無需修改 source）**
```
compiled_graph.bundle.json  ← 必上傳（包含所有系統節點）
AGENTS.md                   ← 必上傳
```

**情境 C：建立新專案**
```
project-overview.json       ← 空白模板
AGENTS.md                   ← 必上傳
tags.json                   ← 必上傳
sys-template.json           ← 複製並重命名
```

> 情境 C 不需要 bundle（新專案無節點）。

### 對話中指令

| 指令 | 說明 |
|------|------|
| `COMPILE` | 記錄本次對話，輸出 entries[] + 新版 L1 檔 + 同步 L0 |
| `SUMMARIZE` | 輸出壓縮前情摘要，貼進下次對話開頭 |
| `REVERSE` | 對上傳的 MD 執行分層，輸出 L0~L5 結構 + 新版 L1 檔 + 同步 L0 |
| `DISCUSS` | 多輪問答，結束後切換 COMPILE 輸出 |
| `REGENERATE_INDEX` | 輸出重建後的 id_index.json（從 bundle 的 nodes[] 重建，更新 entry_count 與 generated_at）|
| `刪除 [uid]` | 將節點移入 tombstones，輸出新版 L1 檔 + 同步 L0；不得刪除 uid，只能 tombstone |
| `新增系統 [名稱]` | 輸出新的空白 sys-[名稱].json + 更新 L0 systems 登記 |

### 下載包

```
sys-[作業系統].json         ← 必下載（覆蓋舊版）
project-overview.json       ← 必下載（覆蓋舊版）
session-log-[日期].json     ← 可選（本次 entries 存檔）
```

> ⚠️ 下載後必須重新執行 `node compile.js` 才能進行下一次對話。
> L0 與 L1 需**同時下載**覆蓋，否則 exports[] 與 id_index 會不同步。

---

## MODE DEFINITIONS

> **此段落已移至 canonical source。**
> 完整 Mode 定義（COMPILE / SUMMARIZE / REVERSE / DISCUSS / BUILD / EXECUTE）：
> → See: **AGENTS-protocol.md § MODE DEFINITIONS**

---

## RUNTIME HINTS 使用說明

`tags.json` 的 `runtime_hints` 是獨立命名空間，與 `tags` 分開。

**用法：** 直接將 runtime_hints 的 key 放入 L5 節點的 `tags[]` 陣列。

```json
{
  "uid": "8f2c9e1ab442",
  "display_id": "L3K-A-B2-C5",
  "title": "supplyBuf BFS 波前傳播",
  "tags": ["核心邏輯", "效能", "hot_path", "O(N)-critical", "write_heavy"],
  "effect": [
    { "uid": "3a1b2c4d5e6f", "edge_type": "writes_to" }
  ]
}
```

---

## PROJECT REGISTRY 規格

### L0：project-overview.json

| 欄位 | 說明 |
|------|------|
| `project_name` | 專案識別名稱（英文）|
| `display_name` | 顯示名稱（可含中文）|
| `root_code` | 2~5 字母唯一代碼（全大寫）；建檔時由人類指定，所有節點 display_id 的 ROOT 必須與此一致；建立後不可更改 |
| `l0` | 專案目標、技術棧、約束、跨系統設計記憶 |
| `systems` | 各 L1 系統的索引條目 |
| `cross_system_state` | 跨系統共享可變狀態（produced_by / consumed_by / chain）|
| `write_count` | 整數，初始為 0；每次 COMPILE 自動 +1 |

### L1：sys-[name].json

| 欄位 | 說明 |
|------|------|
| `$system_id` | 系統識別名稱 |
| `$schema_version` | 固定為 `"4.0"` |
| `owns_tags` | 本系統專有語意標籤 |
| `shared_state` | reads / writes，含 `"$source": "derived_from_l0"` 標記 |
| `design_memory` | anti_patterns 與 forbidden_directions |
| `id_index` | 本系統所有 L5 節點（v4.0 格式）|
| `write_count` | 整數，初始為 0；每次 COMPILE +1 |
| `derived_from_l0_write_count` | 最後一次與 L0 同步時 L0 的 write_count |

### id_index 節點欄位（v4.0）

| 欄位 | 必填 | 說明 |
|------|------|------|
| `uid` | ✓ | 12位 hex；不可修改；不可由 AI 自行生成 |
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
| `code_ref` | — | 對應源碼（選填）|
| `supersedes` | — | 被取代的舊節點 display_id（選填）|

> ★ 條件必填：節點 summary 或 code_ref 涉及任何 cross_system_state 登記狀態時必填。

---

## 分檔閾值規範

| 指標 | 軟上限（Claude 主動提示）| 硬上限（強制拆分）|
|------|----------------------|-----------------|
| L5 節點數 | 40 | 60 |
| 檔案行數（JSON 展開）| 500 | 800 |

---

## FORBIDDEN ACTIONS

### 身份不可變性

- **[F-01]** 禁止 AI 自行生成 uid（必須由 generate_uid.js 或人類提供）
- **[F-02]** 禁止使用 display_id 作為 cross_links 參照（必須使用 uid）
- **[F-03]** 禁止修改或刪除 tombstones.entries[] 中任何既有條目（違反觸發 INTEGRITY_VIOLATION）
- **[F-04]** 禁止手動修改 id_index.json 的 entries[] 條目（只能由 compile.js 執行 REGENERATE_INDEX）
- **[F-05]** 禁止靜默修改節點的 uid（uid 不可變；需廢棄時使用 tombstone 機制）

### Graph 完整性

- **[F-06]** 禁止在 INTEGRITY_MISMATCH 時繼續操作（entry_count 與實際節點數不符時停止）
- **[F-07]** 禁止寫入 chain 前未驗證不產生環狀依賴（cycle detection 由 compile.js 執行）
- **[F-08]** 禁止使用未在 edge_registry 登記的 edge_type（見 sys-*-arch.json）
- **[F-09]** 禁止對同一目標 uid 建立多個 owns edge（唯一性由 compile.js 強制驗證）

### 權威來源

- **[F-10]** 禁止將 project-overview.json 以外的來源視為跨系統狀態依據
- **[F-11]** 禁止輸出不完整的 sys-[name].json（必須包含全部 id_index 條目）
- **[F-12]** 禁止輸出不完整的 project-overview.json（必須包含全部 systems 條目）
- **[F-13]** 禁止僅輸出 L1 系統檔而不同步更新 L0 的 exports[]（除非明確說「只更新 L1」）
- **[F-14]** 禁止在 L0 缺失的情況下修改 L1 的 shared_state

### 格式與版本

- **[F-15]** 禁止在 COMPILE 輸出中使用 v3.2 的舊版 id 欄位（必須使用 uid + display_id）
- **[F-16]** 禁止在 COMPILE 輸出中使用 affects[] 欄位（已廢棄，使用 effect[]）
- **[F-17]** 禁止修改 sys-*-arch.json 的任何欄位（人類唯讀）
- **[F-18]** 禁止在 REVERSE 第一階段未經人工確認即輸出第二階段
- **[F-19]** 禁止將 `partial`（DevLog 私有值）寫入 Log JSON 的 decision 欄位

### 信心閾值

- **[F-20]** 禁止在 confidence < 0.85 時自動進入下一個輸出階段
- **[F-21]** 禁止在版本完整性前置檢查判定為「強制停止」的情況下繼續輸出
- **[F-22]** 禁止輸出涉及 cross_system_state 狀態的 L5 節點而不填 cross_state_refs

---

## PRIORITY ORDER

> → See: **AGENTS-protocol.md § PRIORITY ORDER**

---

## CONFIDENCE POLICY

> → See: **AGENTS-protocol.md § CONFIDENCE POLICY**

---

## STATE FILES REFERENCE

| 檔案 | 方向 | 說明 |
|------|------|------|
| `compiled_graph.bundle.json` | 上傳 | compile.js 輸出；Claude 讀取的 transport format |
| `project-overview.json` | 上傳 → 下載 | L0；需修改時加入上傳包 |
| `sys-[name].json` | 上傳 → 下載 | L1；每次對話後下載覆蓋舊版 |
| `id_index.json` | compile.js 維護 | uid 總攬表；不需手動上傳 |
| `AGENTS.md` | 上傳 | 本協定 |
| `tags.json` | 上傳 | 通用語意基底層 |
| `sys-*-arch.json` | 上傳（可選）| 架構宣言；Claude 唯讀 |
| `COMPILE_REPORT.json` | 本機確認 | compile.js 輸出；確認 status=ok 後才上傳 bundle |
| `session-log-[日期].json` | 下載（可選）| COMPILE entries 存檔 |

---

## TOOLCHAIN REFERENCE

| 工具 | 指令 | 說明 |
|------|------|------|
| Compiler | `node compile.js` | 驗證 + 建圖 + 輸出 bundle + 更新 id_index |
| Validate only | `node compile.js --validate-only` | 只驗證，不輸出 bundle |
| Migration | `node migrate_v3_to_v4.js --dry-run` | 預覽遷移（不寫入）|
| Migration exec | `node migrate_v3_to_v4.js` | 執行 v3.2 → v4.0 遷移 |

---

## VERSION

| 項目 | 版本 |
|------|------|
| AGENTS.md | **v4.5** |
| devlog-node.schema.json | v2.0 |
| log-entry.schema.json | SCHEMA v2.3 |
| tags.json | v1.3 |
| sys-*-arch.json | 1.0 |
| compile.js | 1.0 |
| migrate_v3_to_v4.js | 1.0 |
| 最後更新 | 2026-05-19 |

### v4.0 變更紀錄

| 變更項目 | 說明 |
|---------|------|
| compile.js toolchain | 新增 compile.js（驗證 + cycle detection + bundle 輸出 + index 重建）|
| migrate_v3_to_v4.js | 新增遷移工具（id → uid+display_id；affects[] → effect[]）|
| compile workflow | 對話前置作業：compile → 確認 status=ok → 上傳 bundle |
| uid / display_id 分離 | id 欄位廢棄；uid（系統身份）+ display_id（人類拓撲）分離 |
| effect[] 結構化 | affects[]（自由字串）廢棄；改為 effect[]{uid, edge_type} |
| edge_registry | edge_type 改由 sys-*-arch.json edge_registry 管理；AI 唯讀 |
| sys-*-arch.json | 新增架構宣言層（edge_registry、governance、compile_pipeline）|
| FORBIDDEN ACTIONS | 重組為 22 條，分為身份不可變性 / graph 完整性 / 權威來源 / 格式版本 / 信心閾值 |
| bundle confidence check | 新增 bundle status ≠ ok 時強制停止規則 |
| root_code | L0 新增 root_code 欄位（建檔時人類指定，不可更改）|
| 分檔結構 | 從 3 個調整為 7 個（arch / pressure / unit / combat / ui / diplomacy / ref）|
| upload format | 主要上傳 bundle；source files 只在需要輸出新版時加入 |
