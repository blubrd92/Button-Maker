# Button Maker — Architecture

## Project Summary

Button Maker is a static web application for designing and printing 1.5" pinback buttons. Staff design a button in a canvas editor, optionally customize individual buttons on a print sheet, and export a tiled PDF for printing and cutting. No server, no build step — vanilla JS + HTML5 Canvas, hosted on GitHub Pages.

## File Map

| File | Purpose | Key Dependencies |
|------|---------|-----------------|
| `index.html` | App shell — layout skeleton, all UI controls, notification area, script loading order | All CSS/JS files |
| `css/styles.css` | All styles — layout, components, notifications, sheet mode | None |
| `js/config.js` | Central configuration — button sizes, colors, fonts, layout math, helper functions | None |
| `js/templates.js` | Template definitions (solid, pattern, gradient) and picker UI | config.js |
| `js/canvas.js` | Design canvas rendering, guide circles, mouse interaction, shared `renderButtonDesign()` | config.js, templates.js |
| `js/text-tool.js` | Text element CRUD, font/size/color/alignment, curved text, library info footer text | config.js, canvas.js |
| `js/image-tool.js` | Image upload (PNG/JPG/SVG), cover-fill sizing, scale slider, drag-to-reposition, image cache | config.js, canvas.js |
| `js/storage.js` | Save/load via `.buttons` files and localStorage — serialization, auto-save session recovery | config.js, canvas.js, templates.js |
| `js/pdf-export.js` | PDF generation — 300 DPI offscreen rendering, tiling (15/20), cut guides | config.js, canvas.js, jsPDF |
| `js/sheet-mode.js` | Sheet grid view, per-button overrides, row/col/multi-select, slot editing, reset, badges | config.js, canvas.js, pdf-export.js |
| `js/app.js` | App initialization, notification system, gradient presets, top-level event wiring, mode management | All modules |
| `docs/BUTTON-SPECS.md` | Physical button dimension reference with zone diagrams | N/A (docs) |

## Script Loading Order

Scripts are loaded in `index.html` in dependency order:
1. `config.js` — no dependencies, defines CONFIG and helper functions
2. `templates.js` — uses CONFIG
3. `canvas.js` — uses CONFIG, defines `currentDesign` and `renderButtonDesign()`
4. `text-tool.js` — uses CONFIG, currentDesign, renderDesignCanvas
5. `image-tool.js` — uses CONFIG, currentDesign, renderDesignCanvas
6. `storage.js` — uses all of the above, plus `showNotification()` from app.js (loaded later but called asynchronously from FileReader callbacks)
7. `pdf-export.js` — uses CONFIG, renderButtonDesign, jsPDF
8. `sheet-mode.js` — uses CONFIG, renderButtonDesign, cloneDesignForRender
9. `app.js` — defines notification system, gradient presets, initializes everything, wires events

## Data Flow

```
User Input → currentDesign (in-memory state, canvas.js:31)
                    ↓
            renderDesignCanvas() → Editing Canvas (visible on screen)
                    ↓
            renderButtonDesign() → Shared render for any canvas context
                    ↓                    ↓
            PDF Export              Sheet Mode Thumbnails
            (offscreen 300 DPI      (small canvases with
             canvas → jsPDF)         master + overrides)
```

1. **User edits** (text, images, background, templates) modify `currentDesign` in `canvas.js:31`
2. **`renderDesignCanvas()`** (`canvas.js:69`) draws the current state to the visible editing canvas
3. **`renderButtonDesign()`** (`canvas.js:187`) is the shared function that draws a design to any context
4. **PDF export** (`pdf-export.js:34`) creates an offscreen canvas per button at 300 DPI, renders via `renderButtonDesign()`, places as image in jsPDF
5. **Sheet mode** (`sheet-mode.js:240`) clones `currentDesign` via `cloneDesignForRender()`, applies slot overrides, renders thumbnails

## Master/Override Data Model

```javascript
// Master design (canvas.js — currentDesign)
{
  templateId: "blank",           // template key or null
  backgroundColor: "#FFFFFF",    // hex color
  templateDraw: function,        // template's draw(ctx,cx,cy,r) or null
  gradient: {                    // null if no gradient active
    color1, color2,              // hex colors for 2-stop gradients
    stops: [{offset, color}],    // multi-stop array (null = use color1/color2)
    direction: "top-bottom",     // "top-bottom"|"bottom-top"|"left-right"|"right-left"|"radial"
    preset: "rainbow"            // preset key or null
  },
  textElements: [{               // array, see text-tool.js for schema
    text, fontFamily, fontSize, color, bold, italic,
    align, x, y, curved, curveRadius
  }],
  imageElements: [{              // at most one element (single-image model)
    dataUrl,                     // base64 data URL (serializable)
    imgObj,                      // DOM Image object (NOT serialized, reconstructed on load)
    x, y,                        // position in inches relative to center
    width, height,               // current display size in inches (baseWidth × imageScale)
    naturalWidth, naturalHeight, // original image pixel dimensions
    baseWidth, baseHeight,       // cover-fill baseline size (scale=1, fills safe zone)
    imageScale                   // multiplier >= 1.0 over cover-fill size
  }],
  libraryInfoText: "",           // curved footer text content
  libraryInfoColor: "#666666"    // independent color for footer
}

// Sheet slot (sheet-mode.js — sheetSlots[])
{
  slotIndex: 0,
  row: 0,
  col: 0,
  overrides: {
    // ONLY properties that differ from master
    // e.g. { backgroundColor: '#ff0000', libraryInfoText: 'Custom' }
    // Supported override keys: backgroundColor, gradient, templateId,
    // textElements, imageElements, libraryInfoText, libraryInfoColor
  }
}
```

**Inheritance rule**: if `overrides` is empty `{}`, the slot renders identically to master. Only explicitly set override properties replace master values. `applyOverridesToDesign()` in `pdf-export.js` handles the merge.

## Key Constants

| Constant | Location | Value | Purpose |
|----------|----------|-------|---------|
| `DPI` | config.js | 300 | Print resolution |
| `CANVAS_DISPLAY_DIAMETER` | config.js | 500 | Editing canvas pixel size |
| `BUTTON_SIZES["1.5"]` | config.js | cut=1.837", face=1.5", safe=1.35" | Button dimensions |
| `PAGE.margin` | config.js | 0.25" | PDF page margins (all sides) |
| `PDF.pointsPerInch` | config.js | 72 | jsPDF unit conversion |
| `STORAGE_KEY` | storage.js | "buttonmaker_designs" | localStorage key |
| `AUTOSAVE_KEY` | storage.js | "buttonmaker_autosave" | Auto-save session recovery key |
| `NOTIFICATION_DURATION_MS` | app.js | 3000 | Toast notification auto-hide timeout |
| `GRADIENT_PRESETS` | app.js | Object with 10 presets | Named gradient presets (rainbow, pride flags, etc.) |

## Where to Find Things

| Task | Location |
|------|----------|
| Change the font list | `CONFIG.FONTS` array in `js/config.js` |
| Add a new template | Add object to `TEMPLATES` array in `js/templates.js` |
| Add a new button size | Add entry to `CONFIG.BUTTON_SIZES` in `js/config.js` |
| Change color swatches | `CONFIG.COLOR_PALETTE` in `js/config.js` |
| Modify PDF tiling layout | `CONFIG.SHEET_LAYOUTS` in `js/config.js` |
| Change guide circle styles | `CONFIG.GUIDES` in `js/config.js` |
| Modify canvas interaction | Mouse handlers in `js/canvas.js` |
| Change save/load data format | `serializeDesign()` / `deserializeDesign()` in `js/storage.js` |
| Change library info font size | `CONFIG.DEFAULTS.libraryInfoFontSize` in `js/config.js` |
| Add a new overridable property | Update `applyOverridesToDesign()` in `js/pdf-export.js` and `finishSlotEdit()` in `js/sheet-mode.js` |
| Add/modify gradient presets | `GRADIENT_PRESETS` object in `js/app.js` |
| Modify notification behavior | `showNotification()` / `hideNotification()` in `js/app.js`, CSS in `css/styles.css` |

## Notification System

Toast notifications slide down from the top of the viewport, matching the Booklist Maker's notification styling. Three types:
- **error** (default) — red background (`--danger-color`)
- **success** — green background (`--success-color`)
- **info** — blue background (`--primary-color`)

Auto-hides after 3 seconds. Used for file import success/failure messages and sheet mode feedback.

Functions: `showNotification(message, type, autoHide)` and `hideNotification()` in `js/app.js`. HTML element: `<div id="notification-area">` in `index.html`.

## Save/Load System

Two-tier persistence:
1. **`.buttons` file export/import** — primary save mechanism. `quickSave()` serializes current design + sheet slots and downloads a `.buttons` JSON file. `quickLoad()` opens a file picker to import.
2. **localStorage** — best-effort cache. `quickSave()` also writes to localStorage but wraps in try/catch (large base64 images can exceed quota). Auto-save on `beforeunload` for session recovery.

Key functions in `storage.js`:
- `quickSave()` → serializes, saves to localStorage (best-effort), downloads `.buttons` file via `exportDesignsFromArray()`
- `quickLoad()` → triggers file picker → `importDesignsFromJSON()` → parses, merges by name, loads first design
- `autoSaveState()` / `autoRestoreState()` → session recovery on page reload

## External Dependencies

| Library | Version | Loaded Via | Purpose |
|---------|---------|-----------|---------|
| jsPDF | 2.5.2 | Local (`lib/`) with CDN fallback | PDF generation |
| Google Fonts | N/A | CDN (index.html) | 9 font families for text tool |
| Font Awesome | 6.4.0 | CDN (index.html) | UI icons |
