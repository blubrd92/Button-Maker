# Button Maker — Architecture

## Project Summary

Button Maker is a static web application for designing and printing 1.5" pinback buttons. Staff design a button in a canvas editor, optionally customize individual buttons on a print sheet, and export a tiled PDF for printing and cutting. No server, no build step — vanilla JS + HTML5 Canvas, hosted on GitHub Pages.

## File Map

| File | Purpose | Key Dependencies |
|------|---------|-----------------|
| `index.html` | App shell — layout skeleton, all UI controls, script loading order | All CSS/JS files |
| `css/styles.css` | All styles — layout, components, modals, sheet mode | None |
| `js/config.js` | Central configuration — button sizes, colors, fonts, layout math, helpers | None |
| `js/templates.js` | Template definitions (solid, pattern, gradient) and picker UI | config.js |
| `js/canvas.js` | Design canvas rendering, guide circles, mouse interaction, shared render function | config.js, templates.js |
| `js/text-tool.js` | Text element CRUD, font/size/color/alignment controls, curved text rendering, library info text | config.js, canvas.js |
| `js/image-tool.js` | Image upload, positioning, resizing, layer ordering | config.js, canvas.js |
| `js/storage.js` | localStorage save/load — serialization, design list UI | config.js, canvas.js, templates.js |
| `js/pdf-export.js` | PDF generation — tiling, 300 DPI rendering, cut guides | config.js, canvas.js, jsPDF |
| `js/sheet-mode.js` | Sheet grid view, per-button overrides, row/col selection, reset | config.js, canvas.js |
| `js/app.js` | App initialization, top-level event wiring, mode management | All modules |
| `docs/BUTTON-SPECS.md` | Physical button dimension reference | N/A (documentation) |

## Data Flow

```
User Input → currentDesign (in-memory state) → Canvas Rendering
                                               ↓
                                          PDF Export (300 DPI offscreen canvas → jsPDF)
                                               ↓
                                          Sheet Mode (per-slot overrides applied on top of master)
```

1. **User edits** (text, images, background, templates) modify `currentDesign` in `canvas.js`
2. **`renderDesignCanvas()`** draws the current state to the visible editing canvas
3. **`renderButtonDesign()`** is the shared function that can draw a design to any context (screen, PDF, thumbnail)
4. **PDF export** creates an offscreen canvas per button at 300 DPI, renders via `renderButtonDesign()`, then places the image in the PDF using jsPDF
5. **Sheet mode** clones `currentDesign`, applies slot overrides, and renders thumbnails

## Master/Override Data Model

```javascript
// Master design (canvas.js: currentDesign)
{
  templateId, backgroundColor, templateDraw,
  textElements: [...],
  imageElements: [...],
  libraryInfoText, libraryInfoColor
}

// Sheet slot (sheet-mode.js: sheetSlots[])
{
  slotIndex, row, col,
  overrides: {
    // ONLY properties that differ from master
    // e.g. { backgroundColor: '#ff0000' }
  }
}
```

Inheritance rule: if `overrides` is empty `{}`, the slot renders identically to master. Only explicitly set properties override.

## Key Constants

| Constant | Location | Value | Purpose |
|----------|----------|-------|---------|
| `DPI` | config.js | 300 | Print resolution |
| `CANVAS_DISPLAY_DIAMETER` | config.js | 500 | Editing canvas size (px) |
| `BUTTON_SIZES["1.5"]` | config.js | cut=1.837", face=1.5", safe=1.35" | Button dimensions |
| `PAGE.margin` | config.js | 0.25" | PDF page margins |
| `PDF.pointsPerInch` | config.js | 72 | jsPDF unit conversion |

## Where to Find Things

- **To change the font list**: Edit `CONFIG.FONTS` array in `js/config.js`
- **To add a new template**: Add an object to the `TEMPLATES` array in `js/templates.js`
- **To add a new button size**: Add an entry to `CONFIG.BUTTON_SIZES` in `js/config.js`
- **To change color swatches**: Edit `CONFIG.COLOR_PALETTE` in `js/config.js`
- **To modify PDF tiling layout**: Edit `CONFIG.SHEET_LAYOUTS` in `js/config.js`
- **To change guide circle styles**: Edit `CONFIG.GUIDES` in `js/config.js`
- **To modify canvas interaction**: Edit mouse handlers in `js/canvas.js`
- **To change save/load data format**: Edit `serializeDesign()` / `deserializeDesign()` in `js/storage.js`
