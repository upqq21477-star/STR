# execution-contract.schema.md
> execution_contract 格式規範與填寫說明 v1.0
> 版本：v1.0 | 建立：2026-05-18
> 機器規範：execution-contract.schema.json
> 修改 authority：人類維護

---

## 用途

`execution_contract_[display_id].json` 是 Commander session 的輸出，
也是 Worker session 的**唯一輸入**。

Worker AI 只讀 execution_contract，不需要上傳任何其他檔案。
contract 本身包含所有實作與驗收所需資訊。

---

## 設計原則

**forbidden_fields 清單是 authority separation 的實際執行位置。**

JSON schema 的欄位定義決定哪些資訊能進去。
`rationale`、`history`、`alternatives` 等欄位不存在於 schema，
Commander AI 就無法注入這些會觸發 Worker architecture reasoning 的內容。

---

## 必填欄位

| 欄位 | 必填子欄位 | 說明 |
|------|-----------|------|
| `role` | `identity`、`forbidden_authorities` | Worker AI 的身份定義與禁止行為清單 |
| `task` | `node`、`uid`、`type`、`target_file`、`target_symbol` | 本次實作目標 |
| `interfaces` | `signature`、`inputs`、`outputs` | 完整 interface，Worker 禁止修改 |
| `dependencies` | `reads`、`writes` | 依賴節點清單（display_id + title + uid）|
| `constraints` | `forbidden`、`required` | 來自 constraint-vocab.md 的詞彙 |
| `scope` | `allowed_files`、`allowed_symbols`、`forbidden_actions` | Worker 操作邊界 |
| `validation` | `must_pass` | 驗收條件陣列 |

---

## 禁止欄位（forbidden_fields）

以下欄位**不得出現**於 execution_contract：

| 禁止欄位 | 原因 |
|---------|------|
| `rationale` | 觸發 Worker architecture reasoning |
| `history` | 同上 |
| `alternatives` | 同上 |
| `why` | 同上 |
| `external_references` | 超出 contract 範圍 |
| `future_work` | 觸發 scope creep |
| `optimization_notes` | 同上 |
| `architecture_notes` | 觸發 architecture redesign |

`compile.js --validate-contract` 驗證這些欄位不存在，發現則 fail-stop。

---

## 範例

```json
{
  "role": {
    "identity": "Worker AI — implementation executor",
    "forbidden_authorities": [
      "architecture redesign",
      "interface expansion",
      "abstraction synthesis",
      "cross-module refactor",
      "task reprioritization"
    ]
  },
  "task": {
    "node": "L3K-A-B2-C5",
    "uid": "a1b2c3d4e5f60001",
    "type": "function",
    "target_file": "GridEngine.js",
    "target_symbol": "processJunLogistics"
  },
  "interfaces": {
    "signature": "processJunLogistics(factionMap: Uint32Array, tickDelta: number): void",
    "inputs": [
      "factionMap: Uint32Array — 720×490 像素 faction 映射",
      "tickDelta: number — 本次 tick 時間增量（ms）"
    ],
    "outputs": "void（直接修改 factionMap in-place 僅限 allowed_symbols 內）"
  },
  "dependencies": {
    "reads": [
      { "display_id": "L3K-A-B1", "title": "FactionState", "uid": "a1b2c3d4e5f60000" }
    ],
    "writes": [
      { "display_id": "L3K-A-B3", "title": "MovementQueue", "uid": "a1b2c3d4e5f60002" }
    ]
  },
  "constraints": {
    "forbidden": ["no_array_alloc", "no_pixel_read", "no_nested_loop"],
    "required": ["typed_array_reuse", "single_bfs_per_tick"]
  },
  "scope": {
    "allowed_files": ["GridEngine.js"],
    "allowed_symbols": ["processJunLogistics"],
    "forbidden_actions": [
      "修改 processJunLogistics 以外的任何函數",
      "新增函數參數",
      "修改 FactionState interface"
    ]
  },
  "validation": {
    "must_pass": [
      "每個 tick 只呼叫一次 BFS 波前傳播",
      "不建立任何新 Uint32Array 實例",
      "faction 移動速度與 tickDelta 線性相關"
    ]
  }
}
```

---

## Worker session 輸出格式

Worker session 完成後輸出格式（在代碼前後附加）：

```
// @node [display_id] [uid]
// reads:  [讀取節點 display_id 清單]
// writes: [寫入節點 display_id 清單]

[代碼本體]

=== CHECKLIST ===
[逐條確認 constraints.forbidden / constraints.required，每條 ✅ 或 ❌ + 說明]
[逐條確認 validation.must_pass，每條 ✅ 或 ❌ + 說明]
```

---

## VERIFY PASS 後的收尾建議

Worker session VERIFY PASS 後，建議在 sys-*.json 更新對應節點：
- `code_ref`：填入實作的 symbol 路徑
- `validation`：`unverified` → `verified`
- `status`：`wip` → `done`
- `updated_at`：更新為當日時間

---

## 缺口文件化（缺口四）

### log-entry type 使用慣例

log-entry type enum 沒有 `build` 類型。BUILD/EXECUTE 操作統一使用：
- `type: "action"`
- `summary` 格式：`BUILD [display_id]：[PASS/FAIL + 一句描述]`

---

## 版本歷史

| 版本 | 日期 | 說明 |
|------|------|------|
| v1.0 | 2026-05-18 | 初版，含 forbidden_fields 清單、範例、Worker 輸出格式、缺口四文件化 |
