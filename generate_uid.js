#!/usr/bin/env node
/**
 * generate_uid.js — STR v4.3 UID Generator
 *
 * Usage:
 *   node generate_uid.js           # 產生 1 個 uid
 *   node generate_uid.js 5         # 產生 5 個 uid
 *   node generate_uid.js --check 8f2c9e1ab442aabb   # 驗證 uid 格式是否合法
 *
 * 設計原則：
 *   - uid = crypto.randomBytes(8).toString('hex')
 *   - 64 bits entropy，16位小寫十六進位
 *   - 碰撞機率：10,000 節點時約 0.00027%，50,000 節點時約 0.0068%（vs v4.0: 1%/26%）
 *   - 此工具是 AI 唯一合法的 uid 來源，任何 uid 都應由此產生
 *   - 不得以任何方式推導 uid（不得從 title hash、display_id 推導）
 *   - namespace extension 介面：保留，未來 multi-project merge 需求出現時擴充
 *     格式可擴充為 {namespace}:{uid}；本版不實作，只保留欄位宣告
 *
 * v4.3 變更：
 *   - 48-bit (12位) → 64-bit (16位) entropy
 *   - 存量 v4.0 uid（12位）仍被 compile.js 接受（legacy），不強制遷移
 *   - --check 同時接受 12位（v4.0 legacy）與 16位（v4.3）格式
 */

'use strict';

const crypto = require('crypto');

const UID_PATTERN_V43 = /^[0-9a-f]{16}$/;  // v4.3 新建節點
const UID_PATTERN_V40 = /^[0-9a-f]{12}$/;  // v4.0 存量節點（legacy）

function generateUid() {
  return crypto.randomBytes(8).toString('hex');
}

function formatDescription(uid) {
  if (UID_PATTERN_V43.test(uid)) return '16位小寫十六進位（v4.3 格式）';
  if (UID_PATTERN_V40.test(uid)) return '12位小寫十六進位（v4.0 legacy 格式）';
  return null;
}

function validate(uid) {
  return formatDescription(uid) !== null;
}

// ─── CLI ───────────────────────────────────────────────────────

const args = process.argv.slice(2);

// --check mode
if (args[0] === '--check') {
  const target = args[1] || '';
  if (!target) {
    console.error('Usage: node generate_uid.js --check <uid>');
    process.exit(1);
  }
  const desc = formatDescription(target);
  if (desc) {
    console.log(`✓ "${target}" — 格式合法（${desc}）`);
    process.exit(0);
  } else {
    console.error(`✗ "${target}" — 格式不合法`);
    console.error('  v4.3 新建：16位小寫十六進位（例如：8f2c9e1ab442aabb）');
    console.error('  v4.0 存量：12位小寫十六進位（例如：8f2c9e1ab442）');
    process.exit(1);
  }
}

// Generate mode
const count = parseInt(args[0], 10) || 1;

if (count < 1 || count > 100) {
  console.error('count 必須介於 1 ~ 100');
  process.exit(1);
}

for (let i = 0; i < count; i++) {
  console.log(generateUid());
}
