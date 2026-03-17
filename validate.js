#!/usr/bin/env node

/**
 * validate.js — Lightweight lint/consistency checks for Button Maker
 *
 * Run with: node validate.js
 *
 * Checks:
 *   1. CONFIG consistency: BUTTON_SIZES keys match SHEET_LAYOUTS keys
 *   2. HTML <select> options match CONFIG.BUTTON_SIZES keys
 *   3. Script loading order in index.html matches expected order
 *   4. All expected JS files exist
 *   5. Global function/variable availability: functions used cross-file are defined
 *   6. Quick Reference table in index.html matches CONFIG cut diameters
 *   7. Config value sanity: face < cut, safe < face, safe ≈ 90% of face
 *   8. Doc accuracy: ARCHITECTURE.md, README.md, BUTTON-SPECS.md sizes match CONFIG
 *
 * Exit code 0 = all pass, 1 = failures found
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname);
let failures = 0;
let passes = 0;
let warnings = 0;

function pass(msg) {
  passes++;
  console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
}

function fail(msg) {
  failures++;
  console.log(`  \x1b[31m✗\x1b[0m ${msg}`);
}

function warn(msg) {
  warnings++;
  console.log(`  \x1b[33m⚠\x1b[0m ${msg}`);
}

function readFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

// ---------------------------------------------------------------------------
// Parse CONFIG from config.js (lightweight regex extraction, not eval)
// ---------------------------------------------------------------------------

function parseButtonSizes(configSrc) {
  const sizes = {};
  // Match entries like: "1.5": { ... cutDiameter: 1.837, ... faceDiameter: 1.5, ... safeDiameter: 1.35 ... }
  const blockRe = /"([^"]+)":\s*\{[^}]*?cutDiameter:\s*([\d.]+)[^}]*?faceDiameter:\s*([\d.]+)[^}]*?safeDiameter:\s*([\d.]+)/g;
  let m;
  while ((m = blockRe.exec(configSrc)) !== null) {
    sizes[m[1]] = {
      cutDiameter: parseFloat(m[2]),
      faceDiameter: parseFloat(m[3]),
      safeDiameter: parseFloat(m[4])
    };
  }
  return sizes;
}

function parseSheetLayouts(configSrc) {
  const layouts = {};
  // Find the SHEET_LAYOUTS block
  const layoutBlock = configSrc.match(/SHEET_LAYOUTS:\s*\{([\s\S]*?)\n  \}/);
  if (!layoutBlock) return layouts;
  const blockRe = /"([^"]+)":\s*\{[^}]*?cols:\s*(\d+)[^}]*?rows:\s*(\d+)/g;
  let m;
  while ((m = blockRe.exec(layoutBlock[1])) !== null) {
    layouts[m[1]] = { cols: parseInt(m[2]), rows: parseInt(m[3]) };
  }
  return layouts;
}

// ---------------------------------------------------------------------------
// 1. CONFIG consistency
// ---------------------------------------------------------------------------

console.log('\n\x1b[1m1. CONFIG consistency\x1b[0m');

const configSrc = readFile('js/config.js');
const buttonSizes = parseButtonSizes(configSrc);
const sheetLayouts = parseSheetLayouts(configSrc);

const sizeKeys = Object.keys(buttonSizes).sort();
const layoutKeys = Object.keys(sheetLayouts).sort();

if (sizeKeys.length === 0) {
  fail('Could not parse any BUTTON_SIZES from config.js');
} else {
  pass(`Parsed ${sizeKeys.length} button sizes: ${sizeKeys.join(', ')}`);
}

if (layoutKeys.length === 0) {
  fail('Could not parse any SHEET_LAYOUTS from config.js');
} else {
  pass(`Parsed ${layoutKeys.length} sheet layouts: ${layoutKeys.join(', ')}`);
}

// Every size needs a layout and vice versa
const sizesWithoutLayout = sizeKeys.filter(k => !sheetLayouts[k]);
const layoutsWithoutSize = layoutKeys.filter(k => !buttonSizes[k]);

if (sizesWithoutLayout.length > 0) {
  fail(`Button sizes missing layouts: ${sizesWithoutLayout.join(', ')}`);
} else {
  pass('Every BUTTON_SIZE has a matching SHEET_LAYOUT');
}

if (layoutsWithoutSize.length > 0) {
  fail(`Sheet layouts missing button sizes: ${layoutsWithoutSize.join(', ')}`);
} else {
  pass('Every SHEET_LAYOUT has a matching BUTTON_SIZE');
}

// ---------------------------------------------------------------------------
// 2. HTML <select> options match CONFIG
// ---------------------------------------------------------------------------

console.log('\n\x1b[1m2. HTML size selector\x1b[0m');

const indexHtml = readFile('index.html');
// Only match options inside the button-size-select dropdown
const sizeSelectBlock = indexHtml.match(/id="button-size-select"[\s\S]*?<\/select>/);
const htmlSizes = [];
if (sizeSelectBlock) {
  const optionRe = /<option\s+value="([^"]+)"/g;
  let om;
  while ((om = optionRe.exec(sizeSelectBlock[0])) !== null) {
    htmlSizes.push(om[1]);
  }
}

const missingInHtml = sizeKeys.filter(k => !htmlSizes.includes(k));
const extraInHtml = htmlSizes.filter(k => !buttonSizes[k]);

if (missingInHtml.length > 0) {
  fail(`Button sizes in CONFIG but missing from HTML <select>: ${missingInHtml.join(', ')}`);
} else {
  pass('All CONFIG sizes have matching HTML <option> elements');
}

if (extraInHtml.length > 0) {
  fail(`HTML <option> values not in CONFIG.BUTTON_SIZES: ${extraInHtml.join(', ')}`);
} else {
  pass('No extra HTML <option> values beyond CONFIG');
}

// ---------------------------------------------------------------------------
// 3. Script loading order
// ---------------------------------------------------------------------------

console.log('\n\x1b[1m3. Script loading order\x1b[0m');

const expectedOrder = [
  'js/config.js',
  'js/templates.js',
  'js/canvas.js',
  'js/text-tool.js',
  'js/image-tool.js',
  'js/idb-storage.js',
  'js/storage.js',
  'js/pdf-export.js',
  'js/sheet-mode.js',
  'js/undo.js',
  'js/app.js'
];

const scriptRe = /<script\s+src="([^"]+)"/g;
const loadedScripts = [];
let sm;
while ((sm = scriptRe.exec(indexHtml)) !== null) {
  // Only track local js/ scripts
  if (sm[1].startsWith('js/')) {
    loadedScripts.push(sm[1]);
  }
}

const orderMatch = expectedOrder.every((s, i) => loadedScripts[i] === s);
if (orderMatch && loadedScripts.length === expectedOrder.length) {
  pass(`Script loading order is correct (${loadedScripts.length} scripts)`);
} else {
  fail(`Script loading order mismatch`);
  fail(`  Expected: ${expectedOrder.join(' → ')}`);
  fail(`  Got:      ${loadedScripts.join(' → ')}`);
}

// ---------------------------------------------------------------------------
// 4. All expected JS files exist
// ---------------------------------------------------------------------------

console.log('\n\x1b[1m4. File existence\x1b[0m');

const requiredFiles = [
  'index.html',
  'css/styles.css',
  ...expectedOrder,
  'CLAUDE.md',
  'ARCHITECTURE.md',
  'CONVENTIONS.md',
  'docs/BUTTON-SPECS.md'
];

for (const f of requiredFiles) {
  if (fileExists(f)) {
    pass(f);
  } else {
    fail(`Missing: ${f}`);
  }
}

// ---------------------------------------------------------------------------
// 5. Cross-file global definitions
// ---------------------------------------------------------------------------

console.log('\n\x1b[1m5. Critical global definitions\x1b[0m');

// Functions that MUST be defined for the app to work, and which file should define them
const criticalGlobals = {
  'js/config.js': ['getCurrentButtonSize', 'getCurrentLayout', 'inchesToPrintPixels', 'inchesToPoints', 'getCanvasScale', 'inchesToCanvasPixels', 'computeSheetGutters'],
  'js/canvas.js': ['initDesignCanvas', 'renderDesignCanvas', 'renderButtonDesign', 'setBackgroundColor'],
  'js/text-tool.js': ['renderLibraryInfoText', 'drawCurvedText'],
  'js/image-tool.js': ['initImageTool', 'handleImageUpload', 'serializeImageElement', 'hydrateImageElement', 'buildSerializedImageAssetBundle', 'restoreSerializedImageAssets', 'getOrCreateCachedImage'],
  'js/idb-storage.js': ['IDB'],
  'js/storage.js': ['initStorage', 'serializeDesign', 'deserializeDesign', 'autoSaveState', 'autoRestoreState'],
  'js/pdf-export.js': ['generatePDF', 'initPDFExport', 'cloneDesignForRender', 'applyOverridesToDesign'],
  'js/sheet-mode.js': ['initSheetMode', 'renderSheetView', 'getSheetSlots', 'setSheetSlots', 'getSlotOverrides', 'setSlotOverrides', 'refreshSheetThumbnails'],
  'js/undo.js': ['pushUndo', 'undo', 'redo', 'clearUndoHistory'],
  'js/app.js': ['initApp', 'showNotification', 'buildGradientDrawFunction']
};

for (const [file, fns] of Object.entries(criticalGlobals)) {
  if (!fileExists(file)) {
    fail(`Cannot check globals — ${file} is missing`);
    continue;
  }
  const src = readFile(file);
  for (const fn of fns) {
    // Match: function fnName(, var fnName =, const fnName =, let fnName =, or fnName = function
    const defined = new RegExp(`(?:function\\s+${fn}\\b|(?:var|const|let)\\s+${fn}\\b|${fn}\\s*=\\s*(?:function|\\(|\\{))`).test(src);
    if (defined) {
      pass(`${fn} defined in ${file}`);
    } else {
      fail(`${fn} NOT found in ${file}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Quick Reference table matches CONFIG
// ---------------------------------------------------------------------------

console.log('\n\x1b[1m6. Quick Reference table\x1b[0m');

// Extract table rows: <td>SIZE</td><td>CUT_DIAM</td>
const qrRowRe = /<tr><td>([\d.]+"?\*?)<\/td><td>([\d.]+"?)<\/td><\/tr>/g;
const qrEntries = {};
let qr;
while ((qr = qrRowRe.exec(indexHtml)) !== null) {
  const sizeStr = qr[1].replace(/["\*]/g, '');
  const cutStr = qr[2].replace(/"/g, '');
  qrEntries[sizeStr] = parseFloat(cutStr);
}

for (const sizeKey of sizeKeys) {
  const expected = buttonSizes[sizeKey].cutDiameter;
  const actual = qrEntries[sizeKey];
  if (actual === undefined) {
    fail(`Quick Reference missing entry for ${sizeKey}"`);
  } else if (Math.abs(actual - expected) > 0.001) {
    fail(`Quick Reference ${sizeKey}": cut diameter ${actual} ≠ config ${expected}`);
  } else {
    pass(`Quick Reference ${sizeKey}": ${actual}" matches config`);
  }
}

// ---------------------------------------------------------------------------
// 7. Config value sanity checks
// ---------------------------------------------------------------------------

console.log('\n\x1b[1m7. Config value sanity\x1b[0m');

for (const [key, s] of Object.entries(buttonSizes)) {
  // face < cut
  if (s.faceDiameter >= s.cutDiameter) {
    fail(`${key}": faceDiameter (${s.faceDiameter}) should be < cutDiameter (${s.cutDiameter})`);
  } else {
    pass(`${key}": face (${s.faceDiameter}) < cut (${s.cutDiameter})`);
  }

  // safe < face
  if (s.safeDiameter >= s.faceDiameter) {
    fail(`${key}": safeDiameter (${s.safeDiameter}) should be < faceDiameter (${s.faceDiameter})`);
  } else {
    pass(`${key}": safe (${s.safeDiameter}) < face (${s.faceDiameter})`);
  }

  // safe ≈ 90% of face (allow 85-92% range, 1.25" is a known exception)
  const ratio = s.safeDiameter / s.faceDiameter;
  if (ratio < 0.84 || ratio > 0.93) {
    warn(`${key}": safe/face ratio ${(ratio * 100).toFixed(1)}% is outside typical 85-92% range`);
  } else {
    pass(`${key}": safe/face ratio ${(ratio * 100).toFixed(1)}% is within expected range`);
  }
}

// Layout sanity: buttons should fit on US Letter
for (const [key, layout] of Object.entries(sheetLayouts)) {
  const size = buttonSizes[key];
  if (!size) continue;
  const pageW = 8.5 - 2 * 0.3; // usable width
  const pageH = 11 - 2 * 0.3;  // usable height
  const gridW = layout.cols * size.cutDiameter;
  const gridH = layout.rows * size.cutDiameter;

  if (gridW > pageW + 0.01) {
    fail(`${key}": ${layout.cols} cols × ${size.cutDiameter}" = ${gridW.toFixed(3)}" exceeds usable page width ${pageW}"`);
  } else {
    pass(`${key}": ${layout.cols} cols fit in page width (${gridW.toFixed(3)}" ≤ ${pageW}")`);
  }

  if (gridH > pageH + 0.01) {
    fail(`${key}": ${layout.rows} rows × ${size.cutDiameter}" = ${gridH.toFixed(3)}" exceeds usable page height ${pageH}"`);
  } else {
    pass(`${key}": ${layout.rows} rows fit in page height (${gridH.toFixed(3)}" ≤ ${pageH}")`);
  }
}

// ---------------------------------------------------------------------------
// 8. Doc accuracy — check that docs mention all current sizes
// ---------------------------------------------------------------------------

console.log('\n\x1b[1m8. Doc accuracy\x1b[0m');

const docsToCheck = {
  'ARCHITECTURE.md': readFile('ARCHITECTURE.md'),
  'README.md': readFile('README.md'),
  'docs/BUTTON-SPECS.md': readFile('docs/BUTTON-SPECS.md')
};

for (const [docName, content] of Object.entries(docsToCheck)) {
  const missingSizes = sizeKeys.filter(k => {
    // Check for the size with quotes or table format
    return !content.includes(`${k}"`) && !content.includes(`${k}"`);
  });
  if (missingSizes.length > 0) {
    fail(`${docName} is missing references to sizes: ${missingSizes.join(', ')}`);
  } else {
    pass(`${docName} references all ${sizeKeys.length} button sizes`);
  }

  // Check for stale "only supports X sizes" or "currently supports" language
  if (/currently supports.*(?:1\.5|two|2)\b/i.test(content)) {
    warn(`${docName} may contain stale "currently supports" language`);
  }
}

// Check that ARCHITECTURE.md lists idb-storage.js
const archContent = docsToCheck['ARCHITECTURE.md'];
if (archContent.includes('idb-storage.js')) {
  pass('ARCHITECTURE.md includes idb-storage.js');
} else {
  fail('ARCHITECTURE.md is missing idb-storage.js');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n' + '─'.repeat(50));
const total = passes + failures + warnings;
console.log(`\x1b[1mResults: ${passes} passed, ${failures} failed, ${warnings} warnings (${total} checks)\x1b[0m`);

if (failures > 0) {
  console.log('\x1b[31mValidation FAILED\x1b[0m\n');
  process.exit(1);
} else {
  console.log('\x1b[32mValidation PASSED\x1b[0m\n');
  process.exit(0);
}
