# code-spec.schema.md
> STR Code Spec Layer 格式規範 v1.0
> 版本：v1.0 | 建立：2026-05-18
> 修改 authority：人類維護
> 對應文件：constraint-vocab.md | devlog-node.schema.md | AGENTS-protocol.md

---

## 用途

`code-*.md` 是 Code Spec Layer 的實作規格文件，供 Commander session 定位目標節點的
實作約束，以及供 REVERSE 模式自動產生骨架。

每個 `code-*.md` 檔案應對應一個 domain（例如 `code-l3k-logistics.md`）。

---

## 節點區塊格式

每個節點以 `<!-- @node -->` anchor 開頭，格式嚴格如下：

```md
<!-- @node [display_id] [uid] -->
## [title]

**簽名**
[函數或模組簽名，完整型別標注]

**讀取**（對應 reads_from edges，填 display_id）
$note：此欄填 display_id（如 `L3K-A-B1`），與 devlog-node 的 reads（state 名稱字串）語意不同，禁止混用。
- [display_id] [title]

**寫入**（對應 writes_to edges，填 display_id）
$note：此欄填 display_id（如 `L3K-A-B1`），與 devlog-node 的 writes（state 名稱字串）語意不同，禁止混用。
- [display_id] [title]

**禁止**（從 constraint-vocab.md 選取詞彙）
- [forbidden_pattern]

**必須滿足**（從 constraint-vocab.md 選取詞彙）
- [must_satisfy]

---
```

---

## 欄位說明

| 欄位 | 必填 | 說明 |
|------|------|------|
| `<!-- @node [display_id] [uid] -->` | ✓ | Commander session 定位 constraint 的唯一入口，格式必須嚴格 |
| `## [title]` | ✓ | 與 devlog-node 的 title 一致 |
| **簽名** | ✓ | 完整函數或模組簽名，含型別標注 |
| **讀取** | ★ | 節點讀取的依賴，填 display_id，與 devlog-node reads（state 字串）語意不同 |
| **寫入** | ★ | 節點寫入的依賴，填 display_id，與 devlog-node writes（state 字串）語意不同 |
| **禁止** | ✓ | 從 `constraint-vocab.md` 選取 forbidden 詞彙 |
| **必須滿足** | ✓ | 從 `constraint-vocab.md` 選取 must_satisfy 詞彙 |

> ★ 條件必填：節點有讀取/寫入依賴時必填。

---

## 已知設計限制

### 缺口一：reads/writes 語意差異

code-spec MD 的**讀取/寫入**欄填的是依賴節點的 display_id（如 `"L3K-A-B1"`）。
devlog-node（sys-*.json）的 `reads`/`writes` 欄填的是 state 名稱字串（如 `"troopPositions"`）。
兩者命名相近但語意不同，**禁止混用**。
兩份文件各加 `$note` 說明。

### 缺口二：@node anchor 存在性無法自動驗證

compile.js 只驗證 `code_spec` 欄位的格式（`filename#display_id`），
無法確認 MD 中是否真的有對應的 `<!-- @node -->` 行。
**人工維護時須手動確認 anchor 存在性**。
人工修改 display_id 後須同步更新 `<!-- @node -->` 行。

---

## REVERSE 骨架格式

REVERSE 模式自動產生的骨架只含結構，禁止 AI 自行填入 forbidden / must_satisfy 內容：

```md
<!-- @node [display_id] [uid] -->
## [title]

**簽名**
（待填入）

**讀取**
（待填入）

**寫入**
（待填入）

**禁止**
（待人工從 constraint-vocab.md 選取）

**必須滿足**
（待人工從 constraint-vocab.md 選取）

---
```

---

## 版本歷史

| 版本 | 日期 | 說明 |
|------|------|------|
| v1.0 | 2026-05-18 | 初版，含缺口一/二文件化，對應 TODO-05 |
