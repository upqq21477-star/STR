# STR — Structured Token Runtime

> 不需要從零開始。上傳你既有的文件，STR 自動逆向生成完整框架。

> ⚙️ **前置設定：請至 Claude.ai 設定開啟「Code Execution」功能，才能讀取 zip 檔案。**

---

## 這是什麼

**STR（Structured Token Runtime）** 是一套為 Claude 設計的多代理工作流框架，解決 LLM 開發中最根本的三個問題：

- 跨 session 失憶——每次對話都要重新解釋背景
- 輸出不穩定——相同指令在不同 session 結果差異大
- 難以疊代——缺乏可驗證、可追溯的輸出格式

STR 的核心設計理念：**不需要從零建構框架，而是從你已有的知識逆向生成。**

---

## 快速開始：REVERSE 逆向工程

這是 STR 最快的入門方式。你只需要手上已有的文件——設計稿、規格書、筆記、任何格式都行。

**第一步：下載 zip**

```
str_v4_5.zip
```

**第二步：上傳給 Claude**

將 `str_v4_5.zip` 直接上傳到 Claude.ai 對話（需開啟 Code Execution）。

**第三步：上傳你的文件 + 輸入指令**

```
REVERSE
```

Claude 會自動：
1. 解析你上傳的文件內容
2. 將知識分層為 L0（專案總覽）→ L5（最小執行單元）
3. 輸出完整的 STR 框架骨架，包含 `project-overview.json`、`sys-*.json`、`code-*.md`

---

## REVERSE 能做什麼

| 輸入 | 輸出 |
|------|------|
| 任意規格文件、設計稿、筆記 | L0 專案總覽 + L1 系統結構 |
| 既有程式碼或架構說明 | 節點依賴圖（dependency graph） |
| 零散的想法文件 | 可編譯的 STR 框架骨架 |

逆向完成後，你得到的是一個**可以直接進入 compile → 對話循環的完整專案結構**，不需要手動填寫任何模板。

---

## 逆向之後：持續疊代

REVERSE 只需要做一次。之後每次對話走標準流程：

```
node compile.js
↓
上傳 compiled_graph.bundle.json 給 Claude
↓
對話、開發、輸出新版 sys-*.json
↓
node compile.js（重新編譯，進入下一次對話）
```

Claude 不需要記憶——每次 compile 都把完整狀態打包進 bundle，帶進下一個 session。

---

## 為什麼用 zip

**單一上傳點**
所有協定層、schema、工具鏈打包在一起。上傳一個檔案就把完整環境帶進 Claude 的 context，不需要分次上傳、不會漏傳依賴文件。

**版本一致性**
zip 本身是版本快照。`str_v4_5.zip` 保證所有檔案是同一版本的組合，不會出現協定是 v4.5 但 schema 還是 v4.4 的混版問題。

**結構完整性**
Claude 解壓縮後看到完整目錄結構，理解各檔案之間的層級關係。有結構的輸入讓 REVERSE 分層更準確，比平鋪的多個 MD 檔案效果更好。

**降低認知負擔**
使用者不需要知道 STR 由哪些檔案組成。zip 是一個黑盒子，上傳就對了。這和 REVERSE 的設計哲學完全一致——帶著你的知識來，不需要先學框架。

**可攜帶的環境**
不同專案可以維護不同版本的 zip，在不同 Claude session 之間切換專案環境，像切換工作目錄一樣自然。版本升級時換一個 zip，不需要逐一比對哪些檔案有改動。

---

## 對話指令

| 指令 | 說明 |
|------|------|
| `REVERSE` | 逆向分析上傳文件，生成完整框架骨架 |
| `COMPILE` | 記錄本次對話，輸出新版 L1 + 同步 L0 |
| `SUMMARIZE` | 輸出壓縮前情摘要 |
| `DISCUSS` | 多輪問答模式 |
| `BUILD [id]` | 開啟 Commander session，產出 execution_contract |
| `BUILD [id] --verify` | 驗收 Worker 輸出 |
| `EXECUTE` | 開啟 Worker session，讀取 contract 產出代碼 |

---

## 架構說明（選讀）

STR 使用 L0–L5 分層知識圖譜管理專案狀態：

| 層級 | 說明 |
|------|------|
| L0 `project-overview.json` | 跨系統索引、全域設計記憶 |
| L1 `sys-*.json` | 各子系統節點、dependency graph |
| L2–L4 | 模組、功能、實作細節 |
| L5 | 最小可執行單元（devlog node） |

多代理協定：

| 模式 | 角色 |
|------|------|
| Commander | 接收 build_slice，產出 execution_contract |
| Worker | 讀取 contract，產出代碼 + checklist |
| Verifier | 驗收輸出，更新節點狀態 |

---

## 版本

**STR v4.5** — 最後更新 2026-05-18  
完整變動記錄見 `AGENTS-changelog.md`
