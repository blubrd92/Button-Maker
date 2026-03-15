# CLAUDE.md — Button Maker

## What is this project?

Button Maker is a static web app for designing and printing pinback button sheets. It runs entirely in the browser with no backend, no build step, and no framework — just vanilla JS, HTML5 Canvas, and direct DOM access.

Target users are library staff, but it's open to anyone.

## Quick orientation

- Open `index.html` in a browser to run the app
- All source is in `js/`, `css/`, and `index.html`
- Configuration lives in `js/config.js` (sizes, layouts, guides, defaults)
- No npm, no bundler, no test framework — static files only

## Key files

| File | Role |
|------|------|
| `js/config.js` | Central config: button sizes, layouts, page math, helpers |
| `js/canvas.js` | Design canvas rendering, shared `renderButtonDesign()` |
| `js/app.js` | App init, mode switching, zoom, notifications, top-level wiring |
| `js/sheet-mode.js` | Sheet preview, slot selection, overrides, row/col tools |
| `js/image-tool.js` | Image upload, scale, drag, positioning |
| `js/text-tool.js` | Curved brand text rendering |
| `js/storage.js` | Save/load `.buttons` files, localStorage autosave |
| `js/idb-storage.js` | IndexedDB layer for large image assets |
| `js/pdf-export.js` | PDF generation at 300 DPI via jsPDF |
| `js/templates.js` | Template definitions and helpers |
| `index.html` | App shell, all UI controls, script loading |
| `css/styles.css` | All styling |

## Architecture essentials

- **No modules** — scripts load in order via `<script>` tags; globals are shared
- **Master + overrides** — one main design, per-slot sparse overrides in Sheet Mode
- **Shared renderer** — `renderButtonDesign()` draws for design canvas, sheet thumbnails, and PDF export
- **Coordinates in inches** — positions stored as inches from button center, converted to pixels at render time
- **Config-driven sizing** — all 9 button sizes and layouts defined in `CONFIG.BUTTON_SIZES` and `CONFIG.SHEET_LAYOUTS`

## Supported button sizes

1", 1.25", 1.5" (default), 1.75", 2", 2.25", 2.375" (BAM), 2.5", 3"

Each size has: `cutDiameter`, `faceDiameter`, `safeDiameter`. Face is ~= nominal size, safe is ~90% of face.

## Script loading order (matters!)

1. config.js → 2. templates.js → 3. canvas.js → 4. text-tool.js → 5. image-tool.js → 6. idb-storage.js → 7. storage.js → 8. pdf-export.js → 9. sheet-mode.js → 10. app.js

## Automated validation

Run `node validate.js` before committing. It checks 120+ things:

1. **CONFIG consistency** — every `BUTTON_SIZES` key has a matching `SHEET_LAYOUTS` entry and vice versa
2. **HTML sync** — `<option>` values in the size selector match CONFIG keys
3. **Script loading order** — `<script>` tags in `index.html` match the required dependency order
4. **File existence** — all expected JS, CSS, doc, and config files exist
5. **Global definitions** — critical cross-file functions (`renderButtonDesign`, `initApp`, etc.) are defined in their expected files
6. **Quick Reference table** — cut diameters in the HTML table match CONFIG values
7. **Config sanity** — face < cut, safe < face, safe/face ratio ~90%, layouts fit on US Letter
8. **Doc accuracy** — ARCHITECTURE.md, README.md, and BUTTON-SPECS.md reference all current button sizes

Exit code 0 = all checks pass. Exit code 1 = at least one failure. Warnings (yellow) are informational and don't cause failure.

**When to run**: After any change to `js/config.js`, `index.html` (size selector or Quick Reference table), script loading order, or documentation files.

## How to test changes (manual, in-browser)

This project has no automated browser test suite. All UI/rendering testing is manual. Here's what to verify:

### After any change — basic smoke test
1. Open `index.html` in a browser (or refresh)
2. Verify the app loads without console errors
3. Switch between Design and Sheet modes
4. Confirm the canvas renders correctly

### After config/size changes
1. Select each button size from the dropdown
2. Verify guide circles resize correctly in Design Mode
3. Switch to Sheet Mode — verify correct grid layout (row/col count)
4. Check the Quick Reference modal matches config values

### After rendering changes
1. Upload an image — verify it displays and can be dragged/scaled
2. Set a background color — verify it fills the button
3. Enable gradient — verify it renders
4. Add brand text — verify curved text appears along the bottom edge
5. Switch to Sheet Mode — verify thumbnails match the design
6. Export PDF — open it and verify buttons render at correct size

### After sheet/override changes
1. In Sheet Mode, select a button and customize it (change background, brand text)
2. Verify the customized button looks different from others
3. Change the main design — verify non-customized buttons update but customized ones keep their overrides
4. Test "Apply to all" checkbox for background and brand text
5. Test row/column application tools
6. Test copy/paste between slots
7. Test "Reset to main" on a customized button

### After save/load changes
1. Make a design with an image, brand text, background, and some customized sheet slots
2. Save as `.buttons` file
3. Reload the page — verify autosave restores the design
4. Load the `.buttons` file — verify full restoration including images and overrides
5. Test with each button size to verify size is saved/restored correctly

### After PDF export changes
1. Export a PDF for at least 2 different button sizes
2. Open in a PDF viewer and verify:
   - Buttons are tiled correctly on US Letter
   - Cut guides appear (if enabled)
   - Image quality is sharp (300 DPI)
   - Button positions match the expected layout grid
3. Print at "Actual size" and measure a cut circle with a ruler if precision matters

## Common gotchas

- **Script order matters** — moving a `<script>` tag can break everything since globals must exist before they're used
- **Save/load is cross-cutting** — adding a new design property requires updates in: defaults, rendering, serialization, deserialization, override merge, reset, and UI sync
- **Shared renderer** — visual changes must go through `renderButtonDesign()` to appear consistently in design view, sheet thumbnails, and PDF
- **Sparse overrides** — slot overrides should only contain properties that differ from the master; don't store full design copies
- **Image objects aren't serializable** — `imgObj` (HTMLImageElement) is runtime-only; persist `dataUrl` and reconstruct on load
- **Font sizes in points, positions in inches** — never store screen-pixel values in design state

## Detailed docs

- `ARCHITECTURE.md` — file map, state flow, module responsibilities, data model
- `CONVENTIONS.md` — naming, coordinate system, event patterns, serialization rules, config shape
- `docs/BUTTON-SPECS.md` — physical button dimensions, zone explanations, all size specs
