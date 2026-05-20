#!/usr/bin/env node
/**
 * migrate_v3_to_v4.js — STR v3.2 → v4.0 Migration Tool
 *
 * Usage:
 *   node migrate_v3_to_v4.js --dry-run        # 預覽，不寫入任何檔案
 *   node migrate_v3_to_v4.js                  # 執行遷移（備份原檔 → 寫入新版）
 *   node migrate_v3_to_v4.js --dir ./path     # 指定專案目錄
 *
 * 做了什麼：
 *   1. 為每個缺少 uid 的節點生成 16 位 hex uid（v4.3 標準）
 *   2. 將 id 欄位保留為 display_id
 *   3. 將 affects[] 轉換為 effect[]{uid, edge_type: "derives_from"}
 *   4. 解析所有跨節點 uid 引用（兩階段掃描）
 *   5. 輸出 migration_log.json（old_id → new_uid 對照表）
 *
 * 不做什麼：
 *   - 不自動判斷 edge_type（一律使用 derives_from，需人工審查）
 *   - 不刪除任何原始欄位（保留為備用，帶有 _v32_ 前綴）
 *   - 不修改 project-overview.json 或 id_index.json（請在 compile 後重建）
 *
 * 建議工作流程：
 *   1. node migrate_v3_to_v4.js --dry-run      ← 確認 uid mapping
 *   2. node migrate_v3_to_v4.js                ← 執行遷移
 *   3. 人工審查 effect[] 的 edge_type           ← 關鍵步驟
 *   4. node compile.js --validate-only          ← 驗證完整性
 *   5. node compile.js                          ← 完整編譯
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ─────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────

function generateUid() {
  return crypto.randomBytes(8).toString('hex'); // 16 位（v4.3 標準，對齊 generate_uid.js）
}

function readJson(fp) {
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

function writeJson(fp, data) {
  fs.writeFileSync(fp, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// ─────────────────────────────────────────────────────────────
// CLI ARGS
// ─────────────────────────────────────────────────────────────

const args      = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const dirIdx    = args.indexOf('--dir');
const PROJECT_DIR = dirIdx >= 0 ? path.resolve(args[dirIdx + 1]) : process.cwd();

// ─────────────────────────────────────────────────────────────
// MIGRATE NODE
// ─────────────────────────────────────────────────────────────

/**
 * Pass 1: assign uid to node if missing.
 * uidMap: old_id → new_uid (mutated in place)
 */
function assignUid(node, uidMap) {
  if (node.uid) {
    // Already v4.0 — just register in map
    if (node.id && !uidMap.has(node.id)) uidMap.set(node.id, node.uid);
    return node;
  }

  const uid = generateUid();
  uidMap.set(node.id, uid);

  return {
    // v4.0 identity fields
    uid,
    display_id: node.id || '',

    // Preserve all original fields
    title:       node.title,
    level:       node.level  ?? 5,
    parent_id:   node.parent_id ?? null,
    tags:        node.tags   || [],
    status:      node.status || 'pending',
    summary:     node.summary || '',
    updated_at:  node.updated_at || new Date().toISOString(),

    // Conditional fields
    ...(node.cross_state_refs && { cross_state_refs: node.cross_state_refs }),
    ...(node.reads             && { reads:  node.reads  }),
    ...(node.writes            && { writes: node.writes }),
    ...(node.code_ref          && { code_ref: node.code_ref }),
    ...(node.supersedes        && { supersedes: node.supersedes }),
    ...(node.invalidates       && { invalidates: node.invalidates }),

    // effect[] — populated in pass 2
    effect: [],

    // Migration provenance
    _migrated_from_id: node.id,

    // Stash old fields for human review
    ...(node.affects?.length ? { _v32_affects: node.affects } : {}),
  };
}

/**
 * Pass 2: resolve effect[] references.
 * Uses globalUidMap to translate old id → new uid.
 * Also converts old affects[] to effect[].
 */
function resolveEffects(node, globalUidMap, stats) {
  // Case A: node already had effect[] in v3.2 (uid-style entries)
  if (node.effect && node.effect.length > 0 && !node._v32_affects) {
    node.effect = node.effect.map(edge => {
      // If the uid looks like an old id (not 12-char hex), try to resolve
      const resolved = globalUidMap.get(edge.uid) || edge.uid;
      if (resolved !== edge.uid) stats.resolved++;
      return { ...edge, uid: resolved };
    });
    return;
  }

  // Case B: convert _v32_affects → effect[]
  if (node._v32_affects) {
    node.effect = node._v32_affects.map(targetId => {
      const targetUid = globalUidMap.get(targetId);
      if (targetUid) {
        stats.resolved++;
        return {
          uid: targetUid,
          edge_type: 'derives_from',
          _review_required: true, // AI 自動轉換，需人工確認 edge_type
        };
      } else {
        stats.unresolved++;
        return {
          uid: targetId,
          edge_type: 'derives_from',
          _unresolved: true,     // 找不到目標，需人工處理
          _review_required: true,
        };
      }
    });
    // Keep _v32_affects for reference (don't delete)
  }
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────

function main() {
  console.log('\n╔═══════════════════════════════════╗');
  console.log('║  STR Migration  v3.2 → v4.0      ║');
  console.log('╚═══════════════════════════════════╝');
  if (DRY_RUN) console.log('  MODE: DRY RUN（不寫入任何檔案）');
  console.log(`  Dir : ${PROJECT_DIR}\n`);

  const allFiles = fs.readdirSync(PROJECT_DIR);
  const sysFiles = allFiles.filter(f => f.match(/^sys-.+\.json$/) && !f.includes('-arch'));

  console.log(`Found ${sysFiles.length} sys-*.json file(s)\n`);

  if (sysFiles.length === 0) {
    console.log('No sys-*.json files found. Nothing to migrate.\n');
    process.exit(0);
  }

  // ── Pass 1: assign uids ──
  console.log('Pass 1: Assigning UIDs...');
  const globalUidMap = new Map();  // old_id → new_uid
  const migratedSystems = {};

  for (const file of sysFiles) {
    const sys   = readJson(path.join(PROJECT_DIR, file));
    const nodes = sys.id_index || [];
    let assigned = 0;

    const migratedNodes = nodes.map(node => {
      const prev = !!node.uid;
      const m    = assignUid(node, globalUidMap);
      if (!prev) assigned++;
      return m;
    });

    migratedSystems[file] = {
      ...sys,
      $schema_version: '4.0',
      id_index: migratedNodes,
    };

    console.log(`  ${file}: ${nodes.length} nodes, ${assigned} new UIDs assigned`);
  }

  console.log(`\n  Total UIDs in map: ${globalUidMap.size}`);

  // ── Pass 2: resolve effect[] ──
  console.log('\nPass 2: Resolving effect[] references...');
  const stats = { resolved: 0, unresolved: 0, reviewRequired: 0 };

  for (const sys of Object.values(migratedSystems)) {
    for (const node of sys.id_index) {
      resolveEffects(node, globalUidMap, stats);
      if (node.effect.some(e => e._review_required)) stats.reviewRequired++;
    }
  }

  console.log(`  Resolved   : ${stats.resolved}`);
  console.log(`  Unresolved : ${stats.unresolved}`);
  console.log(`  Need review: ${stats.reviewRequired} nodes`);

  if (stats.unresolved > 0) {
    console.log('\n  ⚠  Unresolved refs (標記為 _unresolved:true):');
    for (const sys of Object.values(migratedSystems)) {
      for (const node of sys.id_index) {
        const bad = (node.effect || []).filter(e => e._unresolved);
        if (bad.length > 0) {
          console.log(`     ${node.uid} (${node.title}) → ${bad.map(e => e.uid).join(', ')}`);
        }
      }
    }
  }

  // ── Dry-run report ──
  if (DRY_RUN) {
    console.log('\n────────────────────────────────────');
    console.log('UID Mapping (old_id → new_uid):');
    for (const [oldId, newUid] of globalUidMap) {
      console.log(`  ${oldId.padEnd(20)} → ${newUid}`);
    }
    console.log('\nDry run complete. 未寫入任何檔案。');
    console.log('執行 node migrate_v3_to_v4.js 以套用遷移。\n');
    process.exit(0);
  }

  // ── Write files ──
  console.log('\nWriting migrated files...');
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');

  for (const [file, sys] of Object.entries(migratedSystems)) {
    const fp       = path.join(PROJECT_DIR, file);
    const backupFp = path.join(PROJECT_DIR, file.replace('.json', `.v32-backup-${timestamp}.json`));
    fs.copyFileSync(fp, backupFp);
    writeJson(fp, sys);
    console.log(`  ✓ ${file}  (backup → ${path.basename(backupFp)})`);
  }

  // ── Migration log ──
  const migrationLog = {
    migrated_at:      new Date().toISOString(),
    from_version:     '3.2',
    to_version:       '4.0',
    files_migrated:   Object.keys(migratedSystems),
    uid_map:          Object.fromEntries(globalUidMap),
    stats,
  };
  writeJson(path.join(PROJECT_DIR, 'migration_log.json'), migrationLog);

  console.log('\n╔═══════════════════════════════════╗');
  console.log('║  ✓ Migration complete             ║');
  console.log('╚═══════════════════════════════════╝');
  console.log('  migration_log.json written\n');
  console.log('  Next steps:');
  console.log('  1. 審查所有 effect[].edge_type（_review_required:true 標記的條目）');
  console.log('  2. 手動修正 _unresolved:true 的條目');
  console.log('  3. node compile.js --validate-only');
  console.log('  4. node compile.js\n');
}

main();
