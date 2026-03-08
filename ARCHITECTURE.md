# Button Maker — Architecture

## Project Summary

Button Maker is a static web application for designing and printing 1.5" pinback buttons. Staff design a button in a canvas editor, optionally customize individual buttons on a print sheet, and export a tiled PDF for printing and cutting. No server, no build step — vanilla JS + HTML5 Canvas, hosted on GitHub Pages.

## File Map

| File | Purpose | Key Dependencies |
|------|---------|-----------------|
| `index.html` | App shell — layout skeleton, all UI controls, script loading order | All CSS/JS files |
| `css/styles.css` | All styles — layout, components, modals, sheet mode | None |
| `js/config.js` | Central configuration — button sizes, colors, fonts, layout math, helper functions | None |
| `js/templates.js` | Template definitions (solid, pattern, gradient) and picker UI | config.js |
| `js/canvas.js` | Design canvas rendering, guide circles, mouse interaction, shared `renderButtonDesign()` | config.js, templates.js |
| `js/text-tool.js` | Text element CRUD, font/size/color/alignment, curved text, library info footer text | config.js, canvas.js |
| `js/image-tool.js` | Image upload (PNG/JPG/SVG), positioning, resizing, layer ordering | config.js, canvas.js |
| `js/storage.js` | localStorage save/load — serialization, design list UI, Enter-to-save | config.js, canvas.js, templates.js |
| `js/pdf-export.js` | PDF generation — 300 DPI offscreen rendering, tiling (15/20), cut guides | config.js, canvas.js, jsPDF |
| `js/sheet-mode.js` | Sheet grid view, per-button overrides, row/col/multi-select, reset, badges | config.js, canvas.js, pdf-export.js |
| `js/app.js` | App initialization, top-level event wiring, mode management (design/sheet) | All modules |
| `docs/BUTTON-SPECS.md` | Physical button dimension reference with zone diagrams | N/A (docs) |

## Script Loading Order

Scripts are loaded in `index.html` in dependency order (line ~93):
1. `config.js` — no dependencies, defines CONFIG and helper functions
2. `templates.js` — uses CONFIG
3. `canvas.js` — uses CONFIG, defines `currentDesign` and `renderButtonDesign()`
4. `text-tool.js` — uses CONFIG, currentDesign, renderDesignCanvas
5. `image-tool.js` — uses CONFIG, currentDesign, renderDesignCanvas
6. `storage.js` — uses all of the above
7. `pdf-export.js` — uses CONFIG, renderButtonDesign, jsPDF
8. `sheet-mode.js` — uses CONFIG, renderButtonDesign, cloneDesignForRender
9. `app.js` — initializes everything, wires events

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
// Master design (canvas.js:31 — currentDesign)
{
  templateId: "blank",           // template key or null
  backgroundColor: "#FFFFFF",    // hex color
  templateDraw: function,        // template's draw(ctx,cx,cy,r) or null
  textElements: [{               // array, see text-tool.js for schema
    text, fontFamily, fontSize, color, bold, italic,
    align, x, y, curved, curveRadius
  }],
  imageElements: [{              // array, see image-tool.js for schema
    dataUrl, imgObj, x, y, width, height,
    naturalWidth, naturalHeight, lockAspect
  }],
  libraryInfoText: "",           // curved footer text content
  libraryInfoColor: "#666666"    // independent color for footer
}

// Sheet slot (sheet-mode.js:34 — sheetSlots[])
{
  slotIndex: 0,
  row: 0,
  col: 0,
  overrides: {
    // ONLY properties that differ from master
    // e.g. { backgroundColor: '#ff0000', libraryInfoText: 'Custom' }
  }
}
```

**Inheritance rule**: if `overrides` is empty `{}`, the slot renders identically to master. Only explicitly set override properties replace master values. `applyOverridesToDesign()` in `pdf-export.js:151` handles the merge.

## Key Constants

| Constant | Location (file:line) | Value | Purpose |
|----------|---------------------|-------|---------|
| `DPI` | config.js:19 | 300 | Print resolution |
| `CANVAS_DISPLAY_DIAMETER` | config.js:23 | 500 | Editing canvas pixel size |
| `BUTTON_SIZES["1.5"]` | config.js:30 | cut=1.837", face=1.5", safe=1.35" | Button dimensions |
| `PAGE.margin` | config.js:47 | 0.25" | PDF page margins (all sides) |
| `PDF.pointsPerInch` | config.js:124 | 72 | jsPDF unit conversion |
| `STORAGE_KEY` | storage.js:25 | "buttonmaker_designs" | localStorage key |

## Where to Find Things

| Task | Location |
|------|----------|
| Change the font list | `CONFIG.FONTS` array in `js/config.js:89` |
| Add a new template | Add object to `TEMPLATES` array in `js/templates.js:27` |
| Add a new button size | Add entry to `CONFIG.BUTTON_SIZES` in `js/config.js:30` |
| Change color swatches | `CONFIG.COLOR_PALETTE` in `js/config.js:107` |
| Modify PDF tiling layout | `CONFIG.SHEET_LAYOUTS` in `js/config.js:56` |
| Change guide circle styles | `CONFIG.GUIDES` in `js/config.js:70` |
| Modify canvas interaction | Mouse handlers in `js/canvas.js:245` |
| Change save/load data format | `serializeDesign()` / `deserializeDesign()` in `js/storage.js` |
| Change library info font size | `CONFIG.DEFAULTS.libraryInfoFontSize` in `js/config.js:118` |
| Add a new overridable property | Update `applyOverridesToDesign()` in `js/pdf-export.js:151` |

## External Dependencies

| Library | Version | Loaded Via | Purpose |
|---------|---------|-----------|---------|
| jsPDF | 2.5.2 | CDN (index.html) | PDF generation |
| Google Fonts | N/A | CDN (index.html) | 8 font families for text tool |
