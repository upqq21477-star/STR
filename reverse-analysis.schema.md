# Reverse Analysis Schema（v4.3 MD 版）
> 版本：v1.0
> 建立日期：2026-05-17
> 注意：reverse-analysis.schema.json 不在 v4.0 zip 包內，此 MD 依 AGENTS.md REVERSE 模式描述建立。

---

## 用途

REVERSE 模式輸出的 L0~L5 結構分析格式。從 MD 文件逆向分析後，產出結構化的層次資料。

---

## 輸出結構

### 第一階段（等待人工確認）

```
L0  專案目標：[說明]
L1  系統清單：
    ├── [系統A]
    └── [系統B]
L2  功能域：
    ├── [系統A] → [域1], [域2]
    └── [系統B] → [域3]
L3  模組：
    └── [域1] → [模組1], [模組2]
L4  子模組：
    └── [模組1] → [子模組1]
L5  節點預覽（待確認後展開）：
    └── [子模組1] → [節點1], [節點2]
```

### 第二階段（人工確認後輸出）

| 欄位 | 說明 |
|------|------|
| `uid` | `"PENDING_UID"`（無工具生成時）或由 generate_uid.js 提供的 16位 hex |
| `display_id` | 由樹狀位置決定性推導，格式 `ROOT-SEG(-SEG)*` |
| `title` | 節點標題 |
| `level` | 固定為 5 |
| `status` | 初始為 `pending` |
| `summary` | 從原始 MD 萃取的節點說明 |
| `tags` | 依節點性質推導的語意標籤 |
| `effect` | 依 MD 中描述的依賴關係建立（edge_type 需人工確認）|

---

## 規則

- REVERSE 第一階段未經人工確認，**禁止**輸出第二階段（F-19）
- uid 不得由 AI 自行捏造，填 `"PENDING_UID"` 並標注
- effect[] 中的 edge_type 預設 `derives_from`，需人工審查後確認
- 輸出完整 sys-[name].json + 更新 project-overview.json 的 exports[]
