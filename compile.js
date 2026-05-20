#!/usr/bin/env node
/**
 * compile.js — STR v4.5 Compiler
 *
 * Usage:
 *   node compile.js                          # 完整編譯
 *   node compile.js --validate-only          # 僅驗證，不寫入任何輸出
 *   node compile.js --bundle-only            # 輸出 bundle，但不更新 id_index.json
 *   node compile.js --dir ./path             # 指定專案目錄（預設：當前目錄）
 *   node compile.js --extract [display_id]   # 產出 build_slice_[id].json 供 Commander session
 *   node compile.js --validate-contract [f]  # 驗證 execution_contract JSON 純淨性
 *
 * Input:  sys-*.json, project-overview.json, id_index.json, sys-*-arch.json（選填）, symbol-table.json
 * Output: compiled_graph.bundle.json, id_index.json（更新版）, COMPILE_REPORT.json
 *         若失敗則輸出 COMPILE_ERROR.json 並以 exit code 1 結束
 *
 * 設計原則：
 *   - bundle 存在 + status=ok → Claude 才可讀取（不直接讀 source files）
 *   - 任何 error 都阻止 bundle 生成（fail-stop）
 *   - 輸出為 deterministic（stable sort + canonical serialization）
 *
 * v4.3 新增：
 *   - uid 格式：同時接受 12位（v4.0 legacy）與 16位（v4.3 新建）
 *   - 節點 _token_weight 預計算（JSON.stringify(node).length / 4）
 *   - PRECEDENCE_CONFLICT 檢查（owns edge vs scenario participant 衝突）
 *   - tombstone source 從 id_index.json 改為 symbol-table.json
 *   - COMPILE_REPORT 新增 legacy_uid_count
 *
 * v4.5 新增：
 *   - SYMBOL_TABLE_REQUIRED：symbol-table.json 不存在時 fail-stop（移除 id_index fallback）
 *   - id_index.json 輸出移除 tombstones 區塊（純 generated projection）
 *   - INVALID_CODE_SPEC / CODE_SPEC_ID_MISMATCH：code_spec 欄位格式驗證
 *   - --extract [display_id]：Context Sanitizer，產出 build_slice_[id].json
 *   - --validate-contract [file]：Purity Validator，驗證 execution_contract 純淨性
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────

const DEFAULT_EDGE_TYPES = ['writes_to', 'reads_from', 'blocks', 'derives_from', 'owns'];
const SOFT_DEPTH_WARNING = 8;
const HARD_DEPTH_LIMIT   = 32;

// ─────────────────────────────────────────────────────────────
// CLI ARGS
// ─────────────────────────────────────────────────────────────

const args              = process.argv.slice(2);
const VALIDATE_ONLY     = args.includes('--validate-only');
const BUNDLE_ONLY       = args.includes('--bundle-only');
const dirIdx            = args.indexOf('--dir');
const PROJECT_DIR       = dirIdx >= 0 ? path.resolve(args[dirIdx + 1]) : process.cwd();
const extractIdx        = args.indexOf('--extract');
const EXTRACT_ID        = extractIdx >= 0 ? args[extractIdx + 1] : null;
const validateCtractIdx = args.indexOf('--validate-contract');
const VALIDATE_CONTRACT = validateCtractIdx >= 0 ? args[validateCtractIdx + 1] : null;

// ─────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────

function readJson(fp) {
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch (_) {
    return null;
  }
}

function writeJson(fp, data) {
  // Deterministic: sorted keys at top level, 2-space indent, trailing newline
  fs.writeFileSync(fp, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/** Stable sort — does not mutate input array */
function stableSort(arr, keyFn) {
  return [...arr].sort((a, b) => {
    const ka = keyFn(a), kb = keyFn(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

/** 16-char hash of a JSON-serializable object */
function hashOf(obj) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(obj))
    .digest('hex')
    .slice(0, 16);
}

function ts() {
  return new Date().toISOString();
}

// ─────────────────────────────────────────────────────────────
// STEP 1: LOAD SOURCE FILES
// ─────────────────────────────────────────────────────────────

function loadSources(dir) {
  const allFiles = fs.readdirSync(dir);

  // sys-*.json — 收集所有 L1 系統檔（排除 arch 本身以免重複計入節點）
  const sysFiles = {};
  for (const f of allFiles.filter(f => f.match(/^sys-.+\.json$/) && !f.includes('-arch'))) {
    const data = readJson(path.join(dir, f));
    if (data) sysFiles[f] = data;
  }

  const overview = readJson(path.join(dir, 'project-overview.json'));
  const idIndex  = readJson(path.join(dir, 'id_index.json'));

  // arch.json — 任意 sys-*-arch.json 或 arch.json
  const archFile = allFiles.find(f => f.match(/arch\.json$/));
  const arch     = archFile ? readJson(path.join(dir, archFile)) : null;

  // symbol-table.json — tombstone source of truth（v4.3）
  const symbolTable = readJson(path.join(dir, 'symbol-table.json'));

  return { sysFiles, overview, idIndex, arch, symbolTable };
}

// ─────────────────────────────────────────────────────────────
// STEP 2: VALIDATE
// ─────────────────────────────────────────────────────────────

function validate(sources) {
  const errors   = [];
  const warnings = [];
  const allNodes = []; // 展平後的所有節點

  // edge_type 白名單：優先從 arch.json edge_registry 取得
  const allowedEdgeTypes = sources.arch?.edge_registry
    ? Object.keys(sources.arch.edge_registry)
    : DEFAULT_EDGE_TYPES;

  // tombstone uid 集合（v4.5：symbol-table.json 為唯一來源；不存在時 fail-stop）
  let tombUids;
  if (sources.symbolTable?.tombstones) {
    tombUids = new Set(Object.keys(sources.symbolTable.tombstones).filter(k => !k.startsWith('_example')));
  } else {
    // v4.5：移除 id_index.json fallback，symbol-table.json 不存在時強制報錯
    errors.push({ code: 'SYMBOL_TABLE_REQUIRED', msg: 'symbol-table.json 未找到。v4.5 起不再從 id_index.json fallback 讀取 tombstone，請確認 symbol-table.json 存在並格式正確。' });
    tombUids = new Set(); // 以空集合繼續收集節點，但 error 已記錄，bundle 不會生成
  }

  // uid → source_file（跨檔唯一性檢查）
  const uidSeen = new Map();

  // ── 收集節點 ──
  for (const [file, sys] of Object.entries(sources.sysFiles)) {
    const nodes = sys.id_index || [];

    for (const node of nodes) {
      // v3.2 舊格式偵測（只有 id，沒有 uid）
      if (!node.uid && node.id) {
        warnings.push({
          code: 'V32_FORMAT',
          file,
          ref: node.id,
          msg: `節點 "${node.id}" 使用舊版 id 欄位（v3.2 格式）。請執行 migrate_v3_to_v4.js 後再編譯。`,
        });
        // 相容模式：暫以 id 作為 uid 繼續，標記為 legacy
        allNodes.push({ ...node, uid: node.id, display_id: node.id, _source_file: file, _legacy: true });
        uidSeen.set(node.id, file);
        continue;
      }

      if (!node.uid) {
        errors.push({ code: 'MISSING_UID', file, ref: node.title || '?', msg: '節點缺少 uid 欄位' });
        continue;
      }

      // BUG-02 修正（v4.5）：PENDING_UID 佔位符處理
      // AGENTS-protocol.md 允許新建節點填 "PENDING_UID" 等待人類填入正式 uid
      if (node.uid === 'PENDING_UID') {
        warnings.push({
          code: 'PENDING_UID',
          file,
          ref: node.display_id || node.title || '?',
          msg: '節點包含 PENDING_UID 佔位符，需人類填入正式 uid 後重新 compile',
        });
        continue; // 跳過，不納入 allNodes，不阻止 bundle
      }

      // uid 格式驗證（v4.3：同時接受 12位 legacy 與 16位新格式）
      const UID_V43 = /^[0-9a-f]{16}$/;
      const UID_V40 = /^[0-9a-f]{12}$/;
      if (!UID_V43.test(node.uid) && !UID_V40.test(node.uid)) {
        errors.push({
          code: 'INVALID_UID_FORMAT',
          file,
          uid: node.uid,
          msg: `uid="${node.uid}" 格式不合法（需為 12位或 16位小寫十六進位）`,
        });
      }

      // uid 唯一性
      if (uidSeen.has(node.uid)) {
        errors.push({
          code: 'UID_COLLISION',
          file,
          uid: node.uid,
          msg: `uid 衝突：${uidSeen.get(node.uid)} 與 ${file} 同時宣告 uid="${node.uid}"`,
        });
      } else {
        uidSeen.set(node.uid, file);
      }

      // tombstone 重生檢查
      if (tombUids.has(node.uid)) {
        errors.push({
          code: 'GHOST_UID',
          file,
          uid: node.uid,
          msg: `uid="${node.uid}" 已存在於 tombstones，不可重新使用`,
        });
      }

      allNodes.push({ ...node, _source_file: file });
    }
  }

  const uidSet = new Set(allNodes.map(n => n.uid));

  // ── 驗證 effect[] ──
  for (const node of allNodes) {
    for (const edge of (node.effect || [])) {
      if (!edge.uid) {
        errors.push({ code: 'EFFECT_MISSING_UID', uid: node.uid, msg: 'effect 條目缺少 uid 欄位' });
        continue;
      }
      if (!uidSet.has(edge.uid)) {
        errors.push({
          code: 'DANGLING_REF',
          uid: node.uid,
          target: edge.uid,
          msg: `effect 引用的 uid="${edge.uid}" 在任何 sys-*.json 中均不存在`,
        });
      }
      if (!edge.edge_type) {
        errors.push({ code: 'MISSING_EDGE_TYPE', uid: node.uid, msg: 'effect 條目缺少 edge_type 欄位' });
      } else if (!allowedEdgeTypes.includes(edge.edge_type)) {
        errors.push({
          code: 'UNKNOWN_EDGE_TYPE',
          uid: node.uid,
          edge_type: edge.edge_type,
          msg: `edge_type="${edge.edge_type}" 未在 edge_registry 中登記。允許值：${allowedEdgeTypes.join(', ')}`,
        });
      }
    }
  }

  // ── owns 唯一性：每個 uid 只能被一個 owns 指向 ──
  const ownedBy = new Map(); // target_uid → owner_uid
  for (const node of allNodes) {
    for (const edge of (node.effect || [])) {
      if (edge.edge_type === 'owns') {
        if (ownedBy.has(edge.uid)) {
          errors.push({
            code: 'DUPLICATE_OWNS',
            uid: node.uid,
            target: edge.uid,
            msg: `uid="${edge.uid}" 已被 "${ownedBy.get(edge.uid)}" owns，不能再被 "${node.uid}" owns`,
          });
        } else {
          ownedBy.set(edge.uid, node.uid);
        }
      }
    }
  }

  // ── PRECEDENCE_CONFLICT：owns edge vs Overlay scenario participant 衝突（v4.3）──
  // 讀取 sys-overlay.json 的 scenarios（若存在）
  const overlayFile = Object.entries(sources.sysFiles).find(([f]) => f.includes('overlay'));
  if (overlayFile) {
    const overlayData = overlayFile[1];
    const scenarios = overlayData?.scenarios || overlayData?.id_index || [];
    for (const scenario of scenarios) {
      const participants = scenario?.participants || [];
      for (const participant of participants) {
        const pUid = participant?.uid;
        if (pUid && ownedBy.has(pUid)) {
          const ownerUid = ownedBy.get(pUid);
          if (participant.role && participant.role.includes('write')) {
            warnings.push({
              code: 'PRECEDENCE_CONFLICT',
              scenario: scenario.uid || scenario.label || '?',
              participant_uid: pUid,
              owner_uid: ownerUid,
              msg: `PRECEDENCE_CONFLICT: uid="${pUid}" 已被 "${ownerUid}" owns，但 scenario "${scenario.label || scenario.uid}" 中 role="${participant.role}" 暗示寫入權限。依 governance.precedence_rules.write_permission：owns edge 永遠優先。人工確認是否移除 scenario role。`,
            });
          }
        }
      }
    }
  }

  // ── entry_count 一致性 ──
  if (sources.idIndex) {
    const recorded = sources.idIndex.$integrity?.entry_count ?? -1;
    if (recorded !== -1 && recorded !== allNodes.length) {
      warnings.push({
        code: 'INTEGRITY_MISMATCH',
        msg: `id_index.$integrity.entry_count=${recorded} 與實際節點數 ${allNodes.length} 不符（將於本次 compile 後自動修正）`,
      });
    }
  }

  // ── display_id grammar 檢查（已有 uid 的節點）──
  const segmentRe = /^[A-Z][0-9]*$/;
  const rootRe    = /^[A-Z]{2,5}$/;
  for (const node of allNodes.filter(n => !n._legacy && n.display_id)) {
    const parts = node.display_id.split('-');
    if (parts.length < 2) {
      warnings.push({ code: 'DISPLAY_ID_FORMAT', uid: node.uid, msg: `display_id="${node.display_id}" 缺少 segment（格式應為 ROOT-SEG...）` });
      continue;
    }
    if (!rootRe.test(parts[0])) {
      warnings.push({ code: 'DISPLAY_ID_ROOT', uid: node.uid, msg: `display_id root "${parts[0]}" 不符合 [A-Z]{2,5} 規則` });
    }
    for (const seg of parts.slice(1)) {
      if (!segmentRe.test(seg)) {
        warnings.push({ code: 'DISPLAY_ID_SEG', uid: node.uid, msg: `display_id segment "${seg}" 不符合 [A-Z][0-9]* 規則` });
      }
    }
  }

  // ── code_spec 格式驗證（v4.5 新增）──
  const CODE_SPEC_PATTERN = /^code-[a-z0-9-]+\.md#[A-Z]{2,5}(-[A-Z][0-9]*)+$/;
  for (const node of allNodes.filter(n => !n._legacy && n.code_spec)) {
    if (!CODE_SPEC_PATTERN.test(node.code_spec)) {
      errors.push({
        code: 'INVALID_CODE_SPEC',
        uid: node.uid,
        display_id: node.display_id,
        value: node.code_spec,
        msg: `code_spec="${node.code_spec}" 格式不合法（需為 code-[name].md#[DISPLAY_ID]，例如 "code-l3k-logistics.md#L3K-A-B2-C5"）`,
      });
    } else {
      const anchor = node.code_spec.split('#')[1];
      if (anchor !== node.display_id) {
        errors.push({
          code: 'CODE_SPEC_ID_MISMATCH',
          uid: node.uid,
          display_id: node.display_id,
          anchor,
          msg: `code_spec anchor "${anchor}" 與節點 display_id "${node.display_id}" 不一致`,
        });
      }
    }
  }

  return { errors, warnings, allNodes, uidSet };
}

// ─────────────────────────────────────────────────────────────
// STEP 3: BUILD GRAPH + CYCLE DETECTION
// ─────────────────────────────────────────────────────────────

function buildGraph(allNodes) {
  const nodeMap    = {};
  const adjacency  = {}; // uid → uid[]
  const reverseAdj = {}; // uid → uid[]

  for (const n of allNodes) {
    nodeMap[n.uid]    = n;
    adjacency[n.uid]  = [];
    reverseAdj[n.uid] = [];
  }

  for (const n of allNodes) {
    for (const edge of (n.effect || [])) {
      if (edge.uid && adjacency[n.uid] !== undefined) {
        adjacency[n.uid].push(edge.uid);
        if (!reverseAdj[edge.uid]) reverseAdj[edge.uid] = [];
        reverseAdj[edge.uid].push(n.uid);
      }
    }
  }

  // DFS cycle detection（三色標記：0=未訪問 1=stack中 2=完成）
  const color    = {};   // uid → 0|1|2
  const cycles   = [];
  const maxDepth = {};   // uid → 最大到達深度

  function dfs(uid, depth, stack) {
    if (depth > HARD_DEPTH_LIMIT) {
      cycles.push({ type: 'DEPTH_EXCEEDED', uid, depth, stack: [...stack] });
      return;
    }
    color[uid] = 1;
    maxDepth[uid] = Math.max(maxDepth[uid] ?? 0, depth);

    for (const neighbor of (adjacency[uid] || [])) {
      if (color[neighbor] === 1) {
        const cycleStart = stack.lastIndexOf(neighbor);
        cycles.push({ type: 'CYCLE', path: [...stack.slice(cycleStart), neighbor] });
      } else if (color[neighbor] !== 2) {
        dfs(neighbor, depth + 1, [...stack, uid]);
      }
    }
    color[uid] = 2;
  }

  for (const uid of Object.keys(adjacency)) {
    if (!color[uid]) dfs(uid, 0, [uid]);
  }

  const depthWarnings = Object.entries(maxDepth)
    .filter(([, d]) => d >= SOFT_DEPTH_WARNING)
    .map(([uid, depth]) => ({ uid, depth }));

  return { adjacency, reverseAdj, nodeMap, cycles, depthWarnings };
}

// ─────────────────────────────────────────────────────────────
// STEP 4: EMIT BUNDLE
// ─────────────────────────────────────────────────────────────

function emitBundle(sources, allNodes, graph, validation) {
  const { nodeMap } = graph;

  // Resolve effect[] references
  const resolvedNodes = stableSort(allNodes, n => n.uid).map(node => {
    const resolvedEffect = (node.effect || []).map(edge => ({
      uid:               edge.uid,
      edge_type:         edge.edge_type || '',
      resolved_title:    nodeMap[edge.uid]?.title      || '[unknown]',
      resolved_display_id: nodeMap[edge.uid]?.display_id || edge.uid,
    }));

    // _token_weight: compile-time 預計算，供 Context resolver budget-aware selection 使用（v4.3）
    // 計算方式: JSON.stringify(node).length / 4（粗估，4 bytes ≈ 1 token）
    // 底線開頭：標記為 compile artifact，不納入 source of truth 驗證範圍
    const nodeForWeight = {
      uid: node.uid, display_id: node.display_id || '', title: node.title || '',
      tags: node.tags || [], status: node.status || 'pending', summary: node.summary || '',
      effect: resolvedEffect, cross_state_refs: node.cross_state_refs || [],
    };
    const tokenWeight = Math.ceil(JSON.stringify(nodeForWeight).length / 4);

    return {
      uid:              node.uid,
      display_id:       node.display_id || node.id || '',
      title:            node.title      || '',
      source_file:      node._source_file,
      tags:             node.tags     || [],
      status:           node.status   || 'pending',
      summary:          node.summary  || '',
      effect:           resolvedEffect,
      cross_state_refs: node.cross_state_refs || [],
      reads:            node.reads  || [],
      writes:           node.writes || [],
      _token_weight:    tokenWeight,
      ...(node._legacy ? { _legacy_v32: true } : {}),
    };
  });

  // Sparse adjacency（只含有 edge 的節點）
  const sparseAdj = {};
  for (const [uid, neighbors] of Object.entries(graph.adjacency)) {
    if (neighbors.length > 0) sparseAdj[uid] = neighbors;
  }

  const bundle = {
    bundle_version: '4.5',
    compiled_at:    ts(),
    project_name:   sources.overview?.project_name  || '',
    display_name:   sources.overview?.display_name  || '',
    integrity_hash: hashOf(resolvedNodes),
    validation: {
      status:         validation.errors.length > 0 ? 'error' : 'ok',
      error_count:    validation.errors.length,
      warning_count:  validation.warnings.length,
      cycle_detected: graph.cycles.some(c => c.type === 'CYCLE'),
      node_count:     resolvedNodes.length,
      edge_count:     resolvedNodes.reduce((s, n) => s + n.effect.length, 0),
    },
    nodes:               resolvedNodes,
    graph:               { adjacency: sparseAdj },
    cross_system_state:  sources.overview?.cross_system_state || {},
  };

  return bundle;
}

// ─────────────────────────────────────────────────────────────
// STEP 5a: EXTRACT BUILD SLICE（v4.5 新增：Context Sanitizer）
// ─────────────────────────────────────────────────────────────

/**
 * --extract [display_id]
 * 輸出 build_slice_[display_id].json 給 Commander session 使用。
 * 內容：目標節點完整欄位 + depth=1 依賴摘要（display_id/title/uid）。
 * 不含：其他節點、rationale、歷史討論、無關 domain。
 */
function extractBuildSlice(allNodes, graph, displayId, outputDir) {
  const target = allNodes.find(n => n.display_id === displayId);
  if (!target) {
    console.error(`\n✗ --extract: display_id="${displayId}" 不存在於 graph\n`);
    process.exit(1);
  }

  // depth=1 直接依賴（effect[] 中的直接邊）
  const directDeps = (target.effect || []).map(edge => {
    const dep = allNodes.find(n => n.uid === edge.uid);
    if (!dep) return { uid: edge.uid, display_id: '(unresolved)', title: '(unresolved)', edge_type: edge.edge_type };
    return {
      display_id: dep.display_id,
      title:      dep.title,
      uid:        dep.uid,
      edge_type:  edge.edge_type,
    };
  });

  // 輸出欄位：目標節點去除 compile artifacts（_token_weight、_source_file、_legacy）
  const { _token_weight, _source_file, _legacy, ...targetClean } = target;

  const slice = {
    $schema:       'build_slice/v1.0',
    generated_at:  ts(),
    generated_by:  'compile.js --extract',
    target:        targetClean,
    direct_deps:   directDeps,
    note:          '此檔案為 Commander session 唯一上傳源。不含 rationale / history / 無關 domain。',
  };

  const outFile = path.join(outputDir, `build_slice_${displayId}.json`);
  writeJson(outFile, slice);
  console.log(`\n✓ build_slice_${displayId}.json 已輸出（${directDeps.length} 個直接依賴）\n`);
}

// ─────────────────────────────────────────────────────────────
// STEP 5b: VALIDATE CONTRACT（v4.5 新增：Purity Validator）
// ─────────────────────────────────────────────────────────────

/**
 * --validate-contract [execution_contract.json]
 * 驗證 execution_contract 的純淨性。
 * 錯誤碼：CONTRACT_FORBIDDEN_FIELD / CONTRACT_MISSING_FIELD /
 *         CONTRACT_UNKNOWN_DEPENDENCY / CONTRACT_UNKNOWN_CONSTRAINT
 */
function validateContract(contractPath, allNodes, vocabPath) {
  console.log('\n╔═══════════════════════════════╗');
  console.log('║  Contract Purity Validator    ║');
  console.log('╚═══════════════════════════════╝');

  const contract = readJson(contractPath);
  if (!contract) {
    console.error(`\n✗ 無法讀取 contract 檔案：${contractPath}\n`);
    process.exit(1);
  }

  const errors   = [];
  const warnings = [];

  // 1. forbidden_fields 檢查
  const FORBIDDEN_FIELDS = [
    'rationale', 'history', 'alternatives', 'why',
    'external_references', 'future_work', 'optimization_notes', 'architecture_notes',
  ];
  for (const field of FORBIDDEN_FIELDS) {
    if (field in contract) {
      errors.push({ code: 'CONTRACT_FORBIDDEN_FIELD', field, msg: `contract 包含禁止欄位 "${field}"` });
    }
  }

  // 2. 必填欄位檢查
  const REQUIRED_FIELDS = ['role', 'task', 'interfaces', 'dependencies', 'constraints', 'scope', 'validation'];
  for (const field of REQUIRED_FIELDS) {
    if (!(field in contract)) {
      errors.push({ code: 'CONTRACT_MISSING_FIELD', field, msg: `contract 缺少必填欄位 "${field}"` });
    }
  }

  // 3. reads/writes display_id 存在性驗證
  const knownDisplayIds = new Set(allNodes.map(n => n.display_id).filter(Boolean));
  for (const dir of ['reads', 'writes']) {
    for (const dep of (contract.dependencies?.[dir] || [])) {
      if (dep.display_id && !knownDisplayIds.has(dep.display_id)) {
        errors.push({
          code: 'CONTRACT_UNKNOWN_DEPENDENCY',
          direction: dir,
          display_id: dep.display_id,
          msg: `dependencies.${dir} 引用的 display_id "${dep.display_id}" 不存在於 graph`,
        });
      }
    }
  }

  // 4. constraints 詞彙表驗證
  // BUG-01 修正（v4.5）：改用獨立 Set，避免 'forbidden'/'must_satisfy' key 名稱污染詞彙表
  const validTerms = new Set();
  if (vocabPath && fs.existsSync(vocabPath)) {
    const vocabText = fs.readFileSync(vocabPath, 'utf8');
    const rows = vocabText.match(/^\| `([^`]+)` \|/gm) || [];
    rows.map(r => r.match(/`([^`]+)`/)[1]).forEach(t => validTerms.add(t));
  } else {
    // CODE-02 修正（v4.5）：vocab 缺失時明確警告，不再靜默跳過
    warnings.push({
      code: 'VOCAB_FILE_MISSING',
      msg: 'constraint-vocab.md 不存在，已跳過 constraint 詞彙驗證',
    });
  }

  const allVocabTerms = validTerms;
  for (const dir of ['forbidden', 'required']) {
    for (const term of (contract.constraints?.[dir] || [])) {
      if (allVocabTerms.size > 0 && !allVocabTerms.has(term)) {
        errors.push({
          code: 'CONTRACT_UNKNOWN_CONSTRAINT',
          direction: dir,
          term,
          msg: `constraints.${dir} 的詞彙 "${term}" 不在 constraint-vocab.md 中`,
        });
      }
    }
  }

  // 輸出結果
  if (errors.length > 0) {
    console.error(`\n✗ Contract 驗證失敗（${errors.length} error(s)）：`);
    for (const e of errors) console.error(`   [${e.code}] ${e.msg}`);
    if (warnings.length > 0) {
      console.log(`\n⚠ Warnings（${warnings.length}）：`);
      for (const w of warnings) console.log(`   [${w.code}] ${w.msg}`);
    }
    process.exit(1);
  }

  console.log(`\n✓ Contract 驗證通過（${REQUIRED_FIELDS.length} 必填欄位 OK，無禁止欄位）`);
  if (warnings.length > 0) {
    console.log(`  ⚠ Warnings：${warnings.length}`);
    for (const w of warnings) console.log(`   [${w.code}] ${w.msg}`);
  }
  console.log('');
}

// ─────────────────────────────────────────────────────────────
// STEP 5: UPDATE id_index.json
// ─────────────────────────────────────────────────────────────

function updateIndex(sources, allNodes) {
  const base = sources.idIndex || {};

  // Only v4.0 nodes (non-legacy) go into the index
  const v4Nodes = allNodes.filter(n => !n._legacy);
  const indexEntries = stableSort(v4Nodes, n => n.uid).map(n => ({
    uid:         n.uid,
    display_id:  n.display_id || '',
    source_file: n._source_file,
  }));

  // v4.5：id_index.json 不再包含 tombstones 區塊（移至 symbol-table.json）
  return {
    $integrity: {
      ...(base.$integrity || {}),
      entry_count:  indexEntries.length,
      generated_at: ts(),
      generated_by: 'compile.js',
    },
    entries: indexEntries,
  };
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────

function main() {
  // ── 特殊模式：--extract ──
  if (EXTRACT_ID) {
    console.log('\n╔═══════════════════════════════╗');
    console.log('║  STR Compiler  v4.5 [EXTRACT] ║');
    console.log('╚═══════════════════════════════╝');
    console.log(`  Dir: ${PROJECT_DIR}  target: ${EXTRACT_ID}\n`);
    process.stdout.write('① Loading...');
    const sources = loadSources(PROJECT_DIR);
    console.log(` ${Object.keys(sources.sysFiles).length} sys-*.json file(s) found`);
    process.stdout.write('② Validating...');
    const validation = validate(sources);
    console.log(` ${validation.allNodes.length} nodes, ${validation.errors.length} error(s)`);
    if (validation.errors.length > 0) {
      for (const e of validation.errors) console.error(`   ✗  [${e.code}] ${e.msg}`);
      console.error('\n✗ --extract 中止：請先修正 compile errors\n');
      process.exit(1);
    }
    process.stdout.write('③ Building graph...');
    const graph = buildGraph(validation.allNodes);
    console.log(` ${Object.values(graph.adjacency).flat().length} edges`);
    extractBuildSlice(validation.allNodes, graph, EXTRACT_ID, PROJECT_DIR);
    return;
  }

  // ── 特殊模式：--validate-contract ──
  if (VALIDATE_CONTRACT) {
    process.stdout.write('① Loading sources for graph validation...');
    const sources = loadSources(PROJECT_DIR);
    const validation = validate(sources);
    console.log(` ${validation.allNodes.length} nodes`);
    const vocabPath = path.join(PROJECT_DIR, 'constraint-vocab.md');
    validateContract(
      path.resolve(VALIDATE_CONTRACT),
      validation.allNodes,
      vocabPath,
    );
    return;
  }

  console.log('\n╔═══════════════════════════════╗');
  console.log('║  STR Compiler  v4.5           ║');
  console.log('╚═══════════════════════════════╝');
  console.log(`  Dir: ${PROJECT_DIR}\n`);

  // ── Load ──
  process.stdout.write('① Loading...');
  const sources   = loadSources(PROJECT_DIR);
  const sysCount  = Object.keys(sources.sysFiles).length;
  console.log(` ${sysCount} sys-*.json file(s) found`);

  if (!sources.overview) {
    console.error('\n✗ project-overview.json not found. Aborting.\n');
    process.exit(1);
  }

  // ── Validate ──
  process.stdout.write('② Validating...');
  const validation = validate(sources);

  console.log(` ${validation.allNodes.length} nodes, ` +
    `${validation.errors.length} error(s), ` +
    `${validation.warnings.length} warning(s)`);

  for (const w of validation.warnings) {
    console.log(`   ⚠  [${w.code}] ${w.msg}`);
  }
  for (const e of validation.errors) {
    console.error(`   ✗  [${e.code}] ${e.msg}`);
  }

  if (validation.errors.length > 0) {
    const errOut = path.join(PROJECT_DIR, 'COMPILE_ERROR.json');
    writeJson(errOut, {
      status:    'failed',
      timestamp: ts(),
      errors:    validation.errors,
      warnings:  validation.warnings,
    });
    console.error(`\n✗ Compile failed. See COMPILE_ERROR.json\n`);
    process.exit(1);
  }

  if (VALIDATE_ONLY) {
    console.log('\n✓ Validation passed (--validate-only)\n');
    process.exit(0);
  }

  // ── Build Graph ──
  process.stdout.write('③ Building graph...');
  const graph = buildGraph(validation.allNodes);

  const realCycles = graph.cycles.filter(c => c.type === 'CYCLE');
  console.log(` ${Object.values(graph.adjacency).flat().length} edges, ${realCycles.length} cycle(s)`);

  if (realCycles.length > 0) {
    console.error('\n✗ Cycle detected:');
    for (const c of realCycles) {
      console.error(`   ${c.path.join(' → ')}`);
    }
    writeJson(path.join(PROJECT_DIR, 'COMPILE_ERROR.json'), {
      status: 'failed', timestamp: ts(),
      errors: [{ code: 'CYCLE_DETECTED', cycles: realCycles }],
      warnings: validation.warnings,
    });
    process.exit(1);
  }

  for (const w of graph.depthWarnings) {
    console.log(`   ⚠  depth warning: uid=${w.uid} depth=${w.depth} (≥${SOFT_DEPTH_WARNING})`);
  }

  // ── Emit Bundle ──
  process.stdout.write('④ Emitting bundle...');
  const bundle     = emitBundle(sources, validation.allNodes, graph, validation);
  const bundlePath = path.join(PROJECT_DIR, 'compiled_graph.bundle.json');
  writeJson(bundlePath, bundle);
  console.log(` hash=${bundle.integrity_hash}`);

  // ── Update Index ──
  if (!BUNDLE_ONLY) {
    process.stdout.write('⑤ Updating id_index.json...');
    const newIndex = updateIndex(sources, validation.allNodes);
    writeJson(path.join(PROJECT_DIR, 'id_index.json'), newIndex);
    console.log(` ${newIndex.$integrity.entry_count} entries`);
  }

  // ── Report ──
  const legacyUidCount = validation.allNodes.filter(n => /^[0-9a-f]{12}$/.test(n.uid)).length;
  // v4.5：tombstone source 固定為 symbol-table.json（已移除 id_index fallback）
  const tombstoneSource = 'symbol-table.json';

  const report = {
    status:             'ok',
    timestamp:          ts(),
    project:            sources.overview.project_name || '',
    node_count:         validation.allNodes.length,
    edge_count:         bundle.validation.edge_count,
    integrity_hash:     bundle.integrity_hash,
    legacy_uid_count:   legacyUidCount,
    tombstone_source:   tombstoneSource,
    warnings:           validation.warnings,
  };
  writeJson(path.join(PROJECT_DIR, 'COMPILE_REPORT.json'), report);

  console.log('\n╔═══════════════════════════════╗');
  console.log('║  ✓ Compile complete           ║');
  console.log('╚═══════════════════════════════╝');
  console.log(`  Nodes : ${report.node_count}`);
  console.log(`  Edges : ${report.edge_count}`);
  console.log(`  Hash  : ${report.integrity_hash}`);
  if (report.legacy_uid_count > 0) {
    console.log(`  Legacy uid (12-char): ${report.legacy_uid_count} node(s) — consider upgrading to v4.3 format`);
  }
  if (validation.warnings.length > 0) {
    console.log(`  Warns : ${validation.warnings.length}`);
  }
  console.log(`  Tombstone source: ${report.tombstone_source}`);
  console.log('');
}

main();
