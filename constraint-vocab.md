# constraint-vocab.md
> Constraint 標準詞彙表 v0.1（P0-lite）
> 版本：v0.1 | 建立：2026-05-18
> 使用範圍：code-*.md 的禁止 / 必須滿足欄位 + execution_contract constraints 欄位
> 修改 authority：人類維護；新增詞彙需先在此表登記，再使用

---

## 使用規則

- code-*.md 和 execution_contract 的 constraint 欄位**必須從此表選取詞彙**
- 自定義詞彙需先在此表登記，再於 code-*.md 或 contract 中使用
- compile.js `--validate-contract` 會驗證 constraints 欄位的詞彙是否存在本表

---

## 禁止詞彙（forbidden）

| 詞彙 | 定義 |
|------|------|
| `no_array_alloc` | 不得在函數內建立新陣列（含 `[]`、`new Array()`、`Array.from()`） |
| `no_pixel_read` | 不得直接存取 pixel 層資料，必須透過抽象介面 |
| `no_global_write` | 不得修改函數參數以外的任何狀態 |
| `no_nested_loop` | 不得使用巢狀迴圈（O(N²) 以上） |
| `no_interface_expansion` | 不得在實作中新增函數參數或修改現有 interface |

---

## 必須滿足詞彙（must_satisfy）

| 詞彙 | 定義 |
|------|------|
| `immutable_update` | 輸出必須為新物件，不得 mutate 傳入參數 |
| `single_bfs_per_tick` | BFS 波前傳播每個 tick 只執行一次 |
| `bounded_fanout_8` | 下游影響節點不得超過 8 個 |
| `typed_array_reuse` | 必須重用既有 TypedArray，不得在 hot path 建立新實例 |

---

## 版本歷史

| 版本 | 日期 | 說明 |
|------|------|------|
| v0.1 | 2026-05-18 | 初版（P0-lite）：收錄 Legion3K 已知常見 pattern，5 forbidden + 4 must_satisfy |
