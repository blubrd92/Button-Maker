# Refactor Plan: Eliminate `currentDesign` Swapping in Slot Editing

## Problem

When editing a slot, `editSlotInDesignMode()` swaps `currentDesign` to hold the slot's merged design and stashes the real main design in `_mainDesignBackup`. This means `currentDesign` sometimes holds the main design, sometimes a slot's design. The undo system has to detect which state it's in — leading to `_diffSlotOverrides`, `_saveSlotEditContext`, `_resumeSlotEditContext`, `_exitSlotEditIfActive`, conditional branching in `_captureSnapshot`, and a cascade of bugs in `setSheetSlots` and `applyOverridesToDesign`.

## Solution

Introduce `_slotEditDesign` — a separate variable that holds the merged design during slot editing. `currentDesign` always stays as the main design, never swapped.

A helper `getActiveDesign()` returns `_slotEditDesign || currentDesign`. All rendering, sidebar controls, and canvas interactions use this instead of `currentDesign` directly.

## Changes by file

### 1. canvas.js — Define new state + update ~20 references

**Add** after `currentDesign` declaration (line ~41):
```js
var _slotEditDesign = null;
function getActiveDesign() {
  return _slotEditDesign || currentDesign;
}
```

**Replace** `currentDesign` → `getActiveDesign()` in:
- `renderDesignCanvas()` — background, image, text rendering
- `drawSelectionHighlight()` — reading `.textElements`, `.imageElements`
- `handleCanvasMouseDown()` — element hit testing
- `handleCanvasMouseMove()` — drag/resize, hover cursor
- `setBackgroundColor()` — writing `.backgroundColor`, `.templateDraw`, `.templateId`

**Keep** `currentDesign` for the declaration/defaults object itself.

### 2. sheet-mode.js — Rewrite slot editing core + add `_computeOverrides()`

**Add** `_computeOverrides(mainDesign, editedDesign)` — extracted from the existing diff logic in `finishSlotEdit()`. Returns a sparse overrides object. Used by both `finishSlotEdit()` and undo's `_captureSnapshot()`.

**Rewrite** `editSlotInDesignMode()`:
- Instead of backing up `currentDesign` and merging into it:
  - Set `_slotEditDesign = cloneDesignForRender(currentDesign)` + `applyOverridesToDesign(_slotEditDesign, overrides)`
  - `currentDesign` is never touched
- Delete `_mainDesignBackup`

**Rewrite** `finishSlotEdit()`:
- Diff `_slotEditDesign` against `currentDesign` (instead of `currentDesign` against `_mainDesignBackup`)
- Delete the restore-from-backup block (lines 1078-1085) — nothing to restore
- Set `_slotEditDesign = null`

**Update** `syncSidebarToDesign()` fallback, `exitSheetMode()`, and `updateSheetOverridePanel()` to use `getActiveDesign()` where they currently reference `currentDesign`.

**Delete** `_mainDesignBackup` variable declaration.

### 3. undo.js — Major simplification (~100 lines removed)

**Delete entirely:**
- `_diffSlotOverrides()` — duplicated finishSlotEdit's diffing; replaced by `_computeOverrides()`
- `_saveSlotEditContext()` — no longer needed since we don't exit/re-enter slot edit
- `_resumeSlotEditContext()` — same
- `_exitSlotEditIfActive()` — existed to restore `currentDesign` from backup; nothing to restore now

**Simplify** `_captureSnapshot()`:
- Always serialize `currentDesign` as master (it's always the main design now)
- For the editing slot, use `_computeOverrides(currentDesign, _slotEditDesign)` to compute in-progress overrides
- No conditional `inSlotEdit` branching for the master

**Simplify** `undo()` and `redo()`:
- Just: capture → push → pop → restore → update buttons
- No save/exit/restore/resume slot context dance

**Update** `_restoreSnapshot()`:
- After restoring `currentDesign` and slots, if `_editingSlotIndex !== null`:
  - Rebuild `_slotEditDesign` from the restored main + restored slot overrides
  - Sync sidebar to `_slotEditDesign`
- Otherwise sync sidebar to `currentDesign`

### 4. app.js — Update ~30 sidebar writes

**Replace** `currentDesign` → `getActiveDesign()` in:
- Brand text input/color handlers (writes to `.libraryInfoText`, `.libraryInfoColor`)
- Gradient toggle, direction, color handlers
- `applyGradientFromUI()`, `applyGradientPreset()`
- `resetDesignToDefaults()` — also set `_slotEditDesign = null`

**Keep** `currentDesign` in:
- `applyBackgroundSettingsToAllButtons()` — intentionally writes to main
- `applyBrandTextSettingsToAllButtons()` — intentionally writes to main
- These "apply to all" functions should also update `_slotEditDesign` if active, so the sidebar/canvas reflect the change

### 5. image-tool.js — Update ~10 references

**Replace** `currentDesign` → `getActiveDesign()` in:
- `processLoadedImage()` — both the sheet-mode and design-mode write paths
- `deleteSelectedImage()`
- `showImageControls()`
- `applyImageScale()`
- `renderImageElements()`, `renderImagePlaceholder()`
- `recalculateImageBaseDimensions()`

### 6. text-tool.js — Update ~8 references

**Replace** `currentDesign` → `getActiveDesign()` in:
- `addTextElement()`, `deleteSelectedText()`
- `showTextControls()`, `updateSelectedTextProperty()`
- `renderTextElements()`, `renderLibraryInfoText()`
- Bold/italic toggle handlers

### 7. templates.js — Update 1 reference

**Replace** `currentDesign` → `getActiveDesign()` in `applyTemplate()`.

### 8. storage.js — Edge case handling

**Keep** `currentDesign` in `buildSavePayload()` and `autoSaveState()` (always saves main design).

**Add** to `buildSavePayload()` and `autoSaveState()`: if `_slotEditDesign` is active, temporarily commit in-progress overrides to the slot before building the payload (so saves capture current edits).

**Add** to `deserializeDesign()`: set `_slotEditDesign = null`, `_editingSlotIndex = null` to cleanly exit any in-progress slot edit on load.

### 9. pdf-export.js — No changes needed

`cloneDesignForRender(currentDesign)` and `applyOverridesToDesign()` always work with the main design + slot overrides for export. Correct as-is.

## What gets deleted

| Code | Lines | Why |
|------|-------|-----|
| `_mainDesignBackup` variable + all refs | ~50 lines | `currentDesign` is never swapped |
| `_diffSlotOverrides()` | ~50 lines | Replaced by shared `_computeOverrides()` |
| `_saveSlotEditContext()` | ~8 lines | No exit/re-enter dance needed |
| `_resumeSlotEditContext()` | ~12 lines | Same |
| `_exitSlotEditIfActive()` | ~20 lines | Nothing to restore |
| Conditional branching in `_captureSnapshot` | ~10 lines | `currentDesign` is always main |
| Save/exit/restore/resume in `undo()`/`redo()` | ~20 lines | Just capture/pop/restore |
| Restore-from-backup block in `finishSlotEdit` | ~10 lines | Nothing to restore |
| `_cloneOverrides()` in sheet-mode.js | ~25 lines | Was added to preserve imgObj through setSheetSlots; with simpler undo, can revert to JSON clone |

**Total: ~200 lines of complex conditional code deleted**, replaced by ~20 lines of straightforward `getActiveDesign()` usage and a shared `_computeOverrides()` helper.

## Implementation order

1. Add `_slotEditDesign`, `getActiveDesign()` in canvas.js
2. Add `_computeOverrides()` in sheet-mode.js
3. Rewrite `editSlotInDesignMode()` and `finishSlotEdit()`; delete `_mainDesignBackup`
4. Update all `currentDesign` → `getActiveDesign()` references across canvas.js, app.js, image-tool.js, text-tool.js, templates.js
5. Simplify undo.js — delete helper functions, simplify capture/restore/undo/redo
6. Handle save/load edge cases in storage.js
7. Run `node validate.js`, manual smoke test
