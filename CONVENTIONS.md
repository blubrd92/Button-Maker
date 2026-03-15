# Button Maker — Coding Conventions

## Purpose

This document describes the current coding conventions used in Button Maker.

The goal is to document the patterns the codebase actually follows now, so future changes fit the existing structure and avoid introducing mismatched assumptions.

Button Maker is a plain JavaScript project with:

- no build step
- no module bundler
- no framework
- shared globals across script files
- direct DOM access
- Canvas-based rendering

Because of that, consistency matters more than clever abstraction. Prefer simple functions, predictable state flow, and explicit wiring over indirection.

---

## Naming Conventions

### JavaScript

- **Functions**: `camelCase`, usually verb-first and descriptive  
  Examples:
  - `renderDesignCanvas()`
  - `drawGuideCircles()`
  - `handleCanvasMouseDown()`
  - `serializeDesign()`
  - `applyOverrideToSelectedSlots()`

- **Variables**: `camelCase`  
  Examples:
  - `currentDesign`
  - `selectedElement`
  - `sheetSlots`
  - `selectedSlots`
  - `currentMode`

- **Constants**: `UPPER_SNAKE_CASE` for true top-level constants  
  Examples:
  - `CONFIG`
  - `STORAGE_KEY`
  - `AUTOSAVE_KEY`
  - `MAX_HISTORY_SLOTS`
  - `NOTIFICATION_DURATION_MS`

- **Config keys**: `camelCase` inside `CONFIG`  
  Examples:
  - `CONFIG.currentButtonSize`
  - `CONFIG.guidesVisible`
  - `CONFIG.libraryInfoColor`

### DOM IDs

Use `kebab-case` for IDs.

Examples:
- `design-canvas`
- `button-size-select`
- `bg-color-picker`
- `library-info-input`
- `notification-area`

### CSS

This project uses practical, component-oriented class naming rather than a strict methodology.

Examples:
- `.sidebar-heading`
- `.canvas-wrapper`
- `.sheet-view`
- `.toggle-label`

State classes are short and direct:

- `.active`
- `.selected`
- `.hidden`
- `.show`

### Rule

Use the style already present in nearby code rather than introducing a new naming system for one feature.

---

## Canvas Coordinate System

All design element positions are stored in **inches** relative to the button center.

### Coordinate rules

- `(0, 0)` = center of the button
- Positive X = right
- Positive Y = down
- Positions are stored in design state and converted to pixels only at render time

This applies to both text elements and image elements.

---

## Conversion Functions

Use the helpers in `config.js` instead of duplicating unit math.

| Function | Input | Output | Use When |
|----------|-------|--------|----------|
| `getCanvasScale()` | — | px/inch | Getting the editing canvas scale factor |
| `inchesToCanvasPixels(inches)` | inches | canvas px | Positioning on the editing canvas |
| `inchesToPrintPixels(inches)` | inches | print px | Rendering at 300 DPI |
| `inchesToPoints(inches)` | inches | PDF points | jsPDF coordinates (72 pt/in) |
| `computeSheetGutters()` | — | `{ columnGutter, rowGutter, columnInset, usableWidth, usableHeight }` | PDF tiling and sheet layout math |
| `getCurrentButtonSize()` | — | size config object | Looking up current cut/face/safe diameters |
| `getCurrentLayout()` | — | layout config object | Looking up current sheet rows/cols |

### Render-time conversion pattern

```javascript
const px = cx + element.x * scale;
const py = cy + element.y * scale;
```

Where:
- `element.x` and `element.y` are stored in inches
- `scale` is pixels per inch for the current rendering context
- `cx` and `cy` are the center of the target render surface

### Font size conversion

Font sizes are stored in **points** (1 pt = 1/72 inch).

To convert to canvas pixels:

```javascript
const fontSizePx = fontSizePoints * (scale / 72);
```

This works for both:
- screen rendering (`scale = getCanvasScale()`)
- print rendering (`scale = CONFIG.DPI`)

### Rule

Store logical design data in inches or points. Convert to pixels or PDF units only at render/export time.

Do not store screen-pixel coordinates in design state.

---

## Event Handling Patterns

1. **Initialization**
   - Each major module exposes an `init*()` function
   - These are called from `app.js:initApp()`

2. **Event listeners**
   - Attach listeners in JavaScript
   - Do not put behavior in inline HTML handlers

3. **Cross-module communication**
   - Use shared globals and direct function calls
   - There is no event bus, store library, or pub/sub layer

4. **Mode awareness**
   - Controls often branch on `currentMode`
   - In Design Mode, they usually update the master design
   - In Sheet Mode, they may update selected slot overrides instead

5. **Mouse interaction**
   - Canvas mouse events live in `canvas.js`
   - CSS pixel coordinates are converted into canvas coordinates using:
     ```javascript
     const cssToCanvas = canvas.width / rect.width;
     ```

### Rule

Before wiring any control, decide explicitly:

- Does it always change the main design?
- Does it change selected slots in Sheet Mode?
- Does it optionally apply to all slots?

Do not let controls silently update custom buttons unless that behavior is intentional.

---

## Module Communication

Global variables shared across modules include:

- `currentDesign` — master design state
- `selectedElement` — currently selected text/image element
- `currentMode` — `'design'` or `'sheet'`
- `selectedSlots` — selected slot indices in Sheet Mode
- `sheetSlots` — per-button override data
- `sheetName` — user-editable name for the sheet
- `CONFIG` — all configuration
- `TEMPLATES` — template definitions
- `GRADIENT_PRESETS` — named gradient presets
- `designZoom` / `sheetZoom` — separate zoom state for each mode

### Rule

Do not introduce a second source of truth for the same concept.

Examples:
- Main design state lives in `currentDesign`
- Per-button changes live in slot `overrides`
- Current app mode lives in `currentMode`
- Current button size lives in `CONFIG.currentButtonSize`

If a value can be derived, prefer deriving it instead of storing a parallel copy.

---

## Initialization Order

The app uses an explicit startup order from `app.js`.

Current initialization order:

1. `initDesignCanvas()`
2. `initImageTool()`
3. `initStorage()`
4. `initPDFExport()`
5. `initSheetMode()`
6. `initTopLevelControls()`
7. restore autosave or apply the blank template

### Rule

Initialization order matters because this codebase uses shared globals and direct cross-file calls.

If a feature depends on another module’s globals or helpers, initialize it after those dependencies are available.

---

## Config.js Structure

The current configuration shape is organized around button size and shared rendering/export constants.

```javascript
CONFIG = {
  DPI: 300,
  SCREEN_DPI: 96,
  CANVAS_DISPLAY_DIAMETER: 500,

  BUTTON_SIZES: {
    // 9 sizes from 1" to 3", keyed by nominal button size string
    // Each has: label, cutDiameter, faceDiameter, safeDiameter, primary
    // faceDiameter generally matches the button size
    // safeDiameter is ~90% of faceDiameter
    // Only one size has primary: true (currently "1.5")
    // The "2.375" entry is the Badge-a-Minit (BAM) size
    "1":     { label: '1"',     cutDiameter: 1.313, faceDiameter: 1.0,   safeDiameter: 0.875, primary: false },
    "1.25":  { label: '1.25"',  cutDiameter: 1.629, faceDiameter: 1.3,   safeDiameter: 1.15,  primary: false },
    "1.5":   { label: '1.5"',   cutDiameter: 1.837, faceDiameter: 1.5,   safeDiameter: 1.35,  primary: true  },
    "1.75":  { label: '1.75"',  cutDiameter: 2.088, faceDiameter: 1.75,  safeDiameter: 1.575, primary: false },
    "2":     { label: '2"',     cutDiameter: 2.415, faceDiameter: 2.0,   safeDiameter: 1.8,   primary: false },
    "2.25":  { label: '2.25"',  cutDiameter: 2.625, faceDiameter: 2.25,  safeDiameter: 2.025, primary: false },
    "2.375": { label: '2.375"', cutDiameter: 2.747, faceDiameter: 2.375, safeDiameter: 2.138, primary: false },
    "2.5":   { label: '2.5"',   cutDiameter: 2.920, faceDiameter: 2.5,   safeDiameter: 2.25,  primary: false },
    "3":     { label: '3"',     cutDiameter: 3.451, faceDiameter: 3.0,   safeDiameter: 2.8,   primary: false }
  },

  currentButtonSize: "1.5",

  PAGE: {
    width: 8.5,
    height: 11,
    margin: 0.3
  },

  SHEET_LAYOUTS: {
    // Keyed by button size string, matching BUTTON_SIZES keys
    // Some layouts support optional: maxColumnGutter, maxRowGutter, equalRowSpacing
    "1":     { label: "Standard (35)", description: "5 columns x 7 rows", cols: 5, rows: 7 },
    "1.25":  { label: "Standard (24)", description: "4 columns x 6 rows", cols: 4, rows: 6 },
    "1.5":   { label: "Standard (20)", description: "4 columns x 5 rows", cols: 4, rows: 5 },
    "1.75":  { label: "Standard (12)", description: "3 columns x 4 rows", cols: 3, rows: 4 },
    "2":     { label: "Standard (12)", description: "3 columns x 4 rows", cols: 3, rows: 4 },
    "2.25":  { label: "Standard (9)",  description: "3 columns x 3 rows", cols: 3, rows: 3 },
    "2.375": { label: "Standard (6)",  description: "2 columns x 3 rows", cols: 2, rows: 3 },
    "2.5":   { label: "Standard (6)",  description: "2 columns x 3 rows", cols: 2, rows: 3 },
    "3":     { label: "Standard (4)",  description: "2 columns x 2 rows", cols: 2, rows: 2, equalRowSpacing: true }
  },

  GUIDES: {
    cutLine: { color, lineWidth, dashPattern, label },
    buttonEdge: { color, lineWidth, dashPattern, label },
    safeZone: { color, lineWidth, dashPattern, label }
  },

  guidesVisible: true,
  WRAP_ZONE_DIM: "rgba(0, 0, 0, 0.08)",

  FONTS: [{ family, category }, ...],
  COLOR_PALETTE: ["#FFFFFF", ...],

  DEFAULTS: {
    backgroundColor: "#FFFFFF",
    fontFamily: "Roboto",
    libraryInfoFontSize: 4.5,
    libraryInfoColor: "#000000",
    libraryInfoText: ""
  },

  PDF: {
    showCutGuides: true,
    pointsPerInch: 72
  }
}
```

### Rule

Add new size/layout behavior through configuration first.

Prefer:
- `CONFIG.BUTTON_SIZES`
- `CONFIG.SHEET_LAYOUTS`
- shared helper functions

Avoid scattering size-specific conditionals across unrelated files when the config structure can own the variation.

---

## File Ownership Conventions

Each major file has a primary responsibility.

### `config.js`
Owns:
- shared constants
- button sizes
- sheet layouts
- page math
- conversion helpers

### `canvas.js`
Owns:
- main design canvas rendering
- guide circle drawing
- element selection highlighting
- drag/resize behavior on the design canvas
- shared `renderButtonDesign()` renderer

### `image-tool.js`
Owns:
- image upload
- image scaling/sizing helpers
- image position constraints
- image element serialization/hydration helpers

### `text-tool.js`
Owns:
- text-related rendering helpers
- brand/library curved text rendering
- legacy text-rendering support still used by the shared renderer

Note: the current visible UI emphasizes brand text rather than a broader text-editing workflow.

### `sheet-mode.js`
Owns:
- sheet preview grid
- slot selection
- sparse per-slot overrides
- row/column tools
- copy/paste design actions
- making a slot the main design
- sheet naming and selection UI

### `storage.js`
Owns:
- local save/load
- `.buttons` import/export
- autosave/restore
- serialization/deserialization

### `pdf-export.js`
Owns:
- PDF generation
- offscreen print rendering
- tiling on the letter-size page
- merging overrides for export

### `app.js`
Owns:
- top-level initialization
- mode switching
- notifications
- zoom controls
- wiring controls that span multiple modules

### Rule

When adding code, extend the file that already owns that behavior unless there is a strong reason not to.

---

## Master Design + Sparse Overrides

Sheet Mode follows a master/override model.

- The main design is stored once in `currentDesign`
- Each slot stores only the properties that differ from the master
- An empty `overrides` object means the slot fully inherits the master

### Slot shape

```javascript
{
  slotIndex: 0,
  row: 0,
  col: 0,
  overrides: {}
}
```

### Effective design pattern

To render or export a slot:

1. clone the master design
2. look up the slot’s overrides
3. apply only explicitly set properties

### Rule

Overrides should stay **sparse** whenever possible.

Store only changed properties, not a full duplicate design, unless a specific tool intentionally creates a full snapshot.

### Practical implication

When the main design changes, any slot that does not override that property should automatically inherit the new value.

That inheritance behavior is intentional.

---

## Design Object Shape

The main design object typically contains:

```javascript
{
  templateId: "blank",
  backgroundColor: "#FFFFFF",
  templateDraw: functionOrNull,
  gradient: nullOrGradientObject,
  textElements: [ ... ],
  imageElements: [ ... ],
  libraryInfoText: "",
  libraryInfoColor: "#000000"
}
```

### Text element shape

```javascript
{
  text: "Hello",
  fontFamily: "Roboto",
  fontSize: 18,
  color: "#000000",
  bold: false,
  italic: false,
  align: "center",
  x: 0,
  y: 0,
  curved: false,
  curveRadius: 0
}
```

### Image element shape

```javascript
{
  dataUrl: "data:image/png;base64,...",
  x: 0,
  y: 0,
  width: 1.2,
  height: 1.2,
  naturalWidth: 1000,
  naturalHeight: 1000,
  baseWidth: 1.0,
  baseHeight: 1.0,
  imageScale: 1.0,
  imgObj: HTMLImageElement // runtime only
}
```

### Rule

If you add a new design property, update all dependent layers:

- defaults
- rendering
- serialization
- deserialization
- override application
- export behavior
- reset behavior
- UI synchronization

---

## Mode-Aware Control Behavior

A major convention in this app is mode-aware branching.

### Design Mode
Controls update the master design directly.

### Sheet Mode
Controls usually do one of three things:

1. apply to selected slots
2. apply to all buttons
3. update the master design while preserving custom slot values

This is especially important for:
- background changes
- gradient changes
- brand text changes
- brand text color changes

### Rule

When changing top-level controls, preserve this behavior model:

- selected slots should receive explicit overrides
- “Apply to all” should clear or replace relevant overrides globally
- updating the master design in Sheet Mode should not unintentionally overwrite customized slots

---

## Background and Brand Text Preservation

The app includes preservation helpers for Sheet Mode so master changes do not stomp existing custom slot values when “Apply to all” is off and no slots are selected.

Examples of this pattern:
- preserving background-related overrides on custom slots
- preserving brand text overrides on custom slots

### Rule

When adding a new top-level property that can be customized per slot, think through whether it needs a similar preservation strategy.

If the app updates the master while custom slots already diverge, preserve their effective values first.

---

## Rendering Pipeline

The same design can be rendered at multiple scales.

| Context | Scale Value | Used By |
|---------|-------------|---------|
| Editing canvas | `getCanvasScale()` | `renderDesignCanvas()` |
| Sheet thumbnail | sheet-specific scale derived from cut diameter | sheet preview rendering |
| PDF export | `CONFIG.DPI` = 300 px/in | `generatePDF()` |

All of these rely on `renderButtonDesign()` as the shared renderer.

### Shared renderer pattern

```javascript
renderButtonDesign(ctx, cx, cy, scale, design, options)
```

This renderer is responsible for:
- background/template/gradient rendering
- image rendering
- text rendering
- brand text rendering
- optional cut-guide rendering

### Rule

If a visual change should appear consistently in:
- Design Mode
- Sheet Mode
- PDF export

then it belongs in the shared rendering path, not in only one context.

---

## Render Clone / Override Application

For Sheet Mode rendering and PDF export, the project clones the master design and then applies overrides.

### Clone convention

Cloning should:
- copy arrays so the master is not mutated during rendering
- preserve runtime fields needed for rendering
- leave source-of-truth state untouched

### Override application convention

Only explicitly defined override properties replace the master values.

Typical override keys include:
- `backgroundColor`
- `gradient`
- `templateId`
- `textElements`
- `imageElements`
- `libraryInfoText`
- `libraryInfoColor`

### Important behavior

When image overrides are applied, image runtime objects may need to be reconstructed from `dataUrl`.

When gradient overrides are applied, the gradient draw function may need to be rebuilt.

When template overrides are applied, the template draw function must be looked up again.

---

## Template System

Templates are defined in `templates.js`.

A template object follows the general pattern:

```javascript
{
  id: "unique-string-id",
  label: "Display Name",
  category: "solid" | "pattern" | "gradient",
  backgroundColor: "#hex",
  draw(ctx, cx, cy, radius) { ... }
}
```

### Convention

- `id` is the persistent key stored with designs
- `label` is UI-facing
- `draw()` contains runtime rendering logic
- the `draw` function is **not serializable**

### Rule

On save, persist only descriptive data such as `templateId`.

On load, reconstruct the runtime draw function via template lookup.

### Note

Template infrastructure still exists in the codebase, but not every older template-related UI assumption is part of the current visible workflow. Follow the live code, not older comments, when extending template behavior.

---

## Gradient Conventions

Gradients are stored as serializable data, not executable drawing functions.

Typical gradient shape:

```javascript
{
  color1: "#ff0000",
  color2: "#0000ff",
  stops: nullOrArray,
  direction: "top-bottom",
  preset: nullOrPresetName
}
```

### Rule

Treat gradient data as serializable configuration.

If runtime rendering depends on a helper function, rebuild that helper from the gradient data after load or override application.

---

## Image Handling Conventions

Image elements are stored as serializable data plus runtime-only image objects.

### Serializable image fields

- `dataUrl`
- `x`
- `y`
- `width`
- `height`
- `naturalWidth`
- `naturalHeight`
- `baseWidth`
- `baseHeight`
- `imageScale`

### Runtime-only field

- `imgObj`

### Rule

Never attempt to persist DOM image objects directly.

Persist descriptive image data and reconstruct runtime image objects during hydration/deserialization.

### Additional rule

When hydrating image elements, make sure the render path can handle:
- already-loaded images
- asynchronously loading images
- failed image loads

Do not assume image loading is synchronous.

---

## Save/Load Data Structure

Designs are saved in local storage and can be exported as `.buttons` files.

### Local storage keys

```javascript
const STORAGE_KEY = "buttonmaker_designs";
const AUTOSAVE_KEY = "buttonmaker_autosave";
const MAX_HISTORY_SLOTS = 2;
```

### Saved design wrapper format (`.buttons` export)

```javascript
{
  app: "ButtonMaker",
  version: "1.0",
  exportedAt: "2026-03-12T00:00:00Z",
  designs: [ /* saved designs */ ]
}
```

### Saved design record

```javascript
{
  name: "My Design",
  savedAt: "2026-03-12T00:00:00Z",
  buttonSize: "1.5",
  master: {
    templateId: "blank",
    backgroundColor: "#FFFFFF",
    gradient: null,
    textElements: [ ... ],
    imageElements: [ ... ],
    libraryInfoText: "",
    libraryInfoColor: "#000000"
  },
  slots: [
    { slotIndex: 0, row: 0, col: 0, overrides: {} }
  ],
  assets: nullOrAssetBundle
}
```

### Important correction

The current save format is keyed by `buttonSize`. Do not document or implement a separate `layout` field as if it were still part of the saved design record.

---

## Serialization Rules

`serializeDesign()` strips non-serializable fields and keeps only the data needed to rebuild the design.

### Non-serializable fields to strip or reconstruct

- `templateDraw` → reconstruct from `templateId` or gradient data
- `imgObj` → reconstruct from serialized image data

### Rule

If a feature depends on runtime-only objects or functions, persist only the minimal descriptive data needed to reconstruct them later.

### When adding a new property

Update all of these together:

- `serializeDesign()`
- `deserializeDesign()`
- autosave payload shape
- import/export shape
- override merge logic
- render logic
- reset/default logic

If a property renders correctly but is not serialized, users will lose it on save/load.

---

## Deserialization and Hydration Conventions

`deserializeDesign()` restores a saved design into live runtime state.

### Current expectations

- restore `templateId`
- restore `backgroundColor`
- restore `gradient`
- rebuild `templateDraw`
- rebuild image runtime objects
- restore brand text values
- resync UI controls to the restored state

### Rule

Deserialization should not only restore raw data. It must restore a **renderable** state.

That includes:
- runtime image objects
- gradient/template draw behavior
- visible UI control values
- sheet preview refresh when needed

---

## Autosave Conventions

Autosave stores current working state separately from saved-history designs.

Typical autosave state includes:

```javascript
{
  savedAt: "...",
  master: serializeDesign(currentDesign),
  buttonSize: CONFIG.currentButtonSize,
  sheetName: "",
  slots: getSheetSlots(),
  mode: currentMode,
  assets: maybeAssetBundle
}
```

### Rule

Autosave is for session recovery, not long-term history.

Keep it robust, silent, and tolerant of storage failures.

---

## PDF Tiling Math

Sheet tiling is driven by current button size and current layout.

### Gutter calculations

```text
usableWidth  = PAGE.width  - 2 × PAGE.margin
usableHeight = PAGE.height - 2 × PAGE.margin

columnGutter = (usableWidth  - cols × cutDiameter) / (cols - 1)
rowGutter    = (usableHeight - rows × cutDiameter) / (rows - 1)
```

### Button position on page

```text
cellX = PAGE.margin + columnInset + col × (cutDiameter + columnGutter)
cellY = PAGE.margin + row × (cutDiameter + rowGutter)
```

### Layout options

Layout entries can include optional spacing controls:
- `maxColumnGutter` — caps horizontal gutter and centers the grid
- `maxRowGutter` — caps vertical gutter and centers the grid
- `equalRowSpacing` — distributes equal gaps above, between, and below rows (used by the 3" layout)

### Example reference values

For **1.5"** buttons (`cutDiameter = 1.837`, layout `4 × 5`):
- `columnGutter ≈ 0.184"`
- `rowGutter ≈ 0.304"`

### Rule

Do not hardcode button placement values in export code. Derive them from current config and current size/layout helpers.

---

## Shared Rendering and Export

PDF export renders each button to an offscreen canvas at print resolution, then places that render into the PDF.

### Export pattern

1. resolve current layout
2. compute gutters
3. build one effective design per slot
4. create an offscreen canvas per button
5. render with `renderButtonDesign(..., isPrint: true)`
6. add image to jsPDF
7. save using button size + sheet name

### Rule

Keep export behavior aligned with editor rendering by reusing the shared renderer whenever possible.

Do not fork visual behavior unnecessarily between screen preview and PDF output.

---

## DOM and UI Wiring Conventions

Top-level controls are wired in JavaScript and grouped by ownership.

Examples:
- top-level mode/zoom/background/brand text controls in `app.js`
- image-specific controls in `image-tool.js`
- sheet interactions in `sheet-mode.js`
- save/load/export wiring in `storage.js` / `pdf-export.js`

### Rule

Keep event ownership close to the module that owns the behavior.

Do not centralize every listener in one file if a module already owns the feature.

---

## Notifications and Feedback

The app uses a simple notification area in `app.js`.

Types currently used include:
- `error`
- `success`
- `info`

### Rule

Use the existing notification system for normal user feedback.

Reserve blocking `alert()` usage for critical failures where the user must notice immediately, such as export-library failures or hard load failures already handled that way.

---

## Defensive Coding Style

The codebase favors practical defensive checks.

Common patterns:
- `if (!element) return;`
- `if (typeof someFunction === 'function') { ... }`
- sensible fallbacks
- try/catch around storage access
- tolerant handling of partially missing saved data

### Rule

Match this style when touching nearby code.

Prefer straightforward resilience over abstraction-heavy purity.

---

## Comments and Documentation Style

Use comments to explain:
- ownership
- data shape
- non-obvious gotchas
- why a runtime reconstruction step exists
- why initialization order matters
- why overrides must remain sparse

Avoid comments that simply narrate the next obvious line.

### Good comment topics

- why positions are stored in inches
- why `imgObj` is not serialized
- why gradient/template draw behavior is rebuilt
- why a Sheet Mode control branches differently with or without selected slots
- why shared rendering should stay centralized

---

## Practical Gotchas

### 1. Layout behavior is now size-based
Do not document or implement layout selection as if it still used separate layout keys like `15` and `20`.

### 2. The visible UI is narrower than some older code comments imply
There is still text/template infrastructure in the codebase, but the current visible UI is centered on image, background, gradient, brand text, sheet editing, save/load, and PDF export.

### 3. Save/load changes are cross-cutting
A small design-state change often requires updates in multiple files.

### 4. Shared rendering is intentional
Do not duplicate rendering logic for design view, sheet preview, and export unless there is a strong reason.

### 5. Preservation behavior matters
When working in Sheet Mode, changing the master design without “Apply to all” should not casually erase customized slot values.

---

## Checklist for New Features

Before merging a feature, check:

1. Which module owns it?
2. Does it affect the main design, selected slots, or both?
3. Does it need sparse slot overrides?
4. Does it need serialization?
5. Does it need to render in:
   - Design Mode
   - Sheet Mode
   - PDF export
6. Does it need default values in `CONFIG.DEFAULTS`?
7. Does it need size-aware behavior?
8. Does it require runtime reconstruction after load?
9. Does it preserve the master/override model?

If the answer to several of those is yes, update all affected layers together.

---

## Preferred Change Strategy

When making changes, prefer:

- small edits in the file that already owns the behavior
- reuse of existing helpers
- config-driven additions
- consistency with shared state
- consistency with shared rendering
- sparse overrides in Sheet Mode

Avoid:

- parallel state objects
- one-off rendering branches that bypass shared logic
- hidden serialization gaps
- old layout assumptions
- introducing a new architectural pattern for one isolated feature

---

## Summary

The codebase favors:

- simple files with clear ownership
- shared global state
- config-driven sizing and layout
- a master-design-plus-overrides model
- shared rendering across editor, sheet preview, and export
- direct DOM wiring
- practical defensive JavaScript

Follow those conventions, and new work will fit the project naturally instead of fighting it.