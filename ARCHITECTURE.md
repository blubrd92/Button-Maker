# Button Maker — Architecture

## Project Summary

Button Maker is a static web application for designing and printing pinback button sheets.

It is built for library staff, but open to all, and is designed around a practical production workflow: create a main button design in Design Mode, customize specific buttons in Sheet Mode when needed, and export a print-ready PDF for printing and cutting.

The app supports nine button sizes from **1"** to **3"**, including the **2.375" Badge-a-Minit (BAM)** size. Layouts are tied to button size via configuration. The project uses vanilla JavaScript and HTML5 Canvas, with no backend and no build step.

---

## Core Workflow

The app has two connected editing modes:

### Design Mode
Design Mode is where the user creates the **main/default design** for the sheet. This includes:
- uploaded image placement and scaling
- background color or gradient
- brand text and brand text color

### Sheet Mode
Sheet Mode shows the printable sheet layout and allows the user to:
- preview the full page
- select individual buttons
- multi-select buttons
- apply custom overrides to selected buttons
- apply a design across a row or column
- copy and paste button designs
- reset customized buttons back to the main design
- promote a customized button back into the main design

This creates a **main-design-plus-overrides** workflow rather than separate fully independent button files.

---

## File Map

| File | Purpose | Key Dependencies |
|------|---------|------------------|
| `index.html` | App shell, visible controls, mode toggles, file actions, size selector, notification area | All CSS/JS files |
| `css/styles.css` | Layout, controls, notifications, Design Mode and Sheet Mode styling | None |
| `js/config.js` | Central configuration for button sizes, layouts, guides, fonts, palette, defaults, page math | None |
| `js/templates.js` | Template definitions and related helpers | `config.js` |
| `js/canvas.js` | Main design state, canvas rendering, guide circles, shared button renderer | `config.js`, `templates.js`, `text-tool.js` |
| `js/text-tool.js` | Text-related rendering utilities, especially curved brand text rendering | `config.js`, `canvas.js` |
| `js/image-tool.js` | Image upload, image scaling, drag-to-reposition behavior, image state helpers | `config.js`, `canvas.js` |
| `js/idb-storage.js` | IndexedDB storage layer for large assets (images) that exceed localStorage limits | None |
| `js/storage.js` | Save/load logic for `.buttons` files and local autosave/session recovery | `config.js`, `canvas.js`, `sheet-mode.js`, `idb-storage.js` |
| `js/pdf-export.js` | PDF generation, offscreen high-resolution rendering, sheet export pipeline, override merge | `config.js`, `canvas.js`, `sheet-mode.js`, jsPDF |
| `js/sheet-mode.js` | Sheet preview, selection logic, per-button overrides, row/column tools, copy/paste, sheet naming | `config.js`, `canvas.js`, `pdf-export.js` |
| `js/app.js` | App initialization, mode management, zoom state, notifications, top-level event wiring | All modules |
| `docs/BUTTON-SPECS.md` | Physical button measurements and print-zone reference | Docs only |

---

## Script Loading Order

Scripts are loaded in dependency order from `index.html`:

1. `config.js`
2. `templates.js`
3. `canvas.js`
4. `text-tool.js`
5. `image-tool.js`
6. `idb-storage.js`
7. `storage.js`
8. `pdf-export.js`
9. `sheet-mode.js`
10. `app.js`

This order matters because the app uses shared globals rather than a module bundler.

---

## State and Data Flow

```text
User Input
   ↓
currentDesign (main design state)
   ↓
renderDesignCanvas()
   ↓
renderButtonDesign()
   ├── Design canvas preview
   ├── Sheet Mode thumbnails
   └── PDF export rendering
```

### Main design state
The main/default design lives in `currentDesign` and acts as the source of truth for Design Mode. The app initializes the design canvas first, then restores autosaved state if available, or falls back to the blank template.

### Shared rendering
`renderButtonDesign()` is the shared renderer used across:
- the visible design canvas
- Sheet Mode thumbnails
- PDF export

That shared renderer is what keeps Design Mode, Sheet Mode, and exported output visually aligned. Sheet export begins by cloning the master design and applying any slot overrides before rendering each button.

---

## Master / Override Model

Button Maker uses a **master design + per-slot overrides** architecture.

### Master design
The master design is the main design created in Design Mode.

Typical properties include:
- `templateId`
- `backgroundColor`
- `gradient`
- `textElements`
- `imageElements`
- `libraryInfoText`
- `libraryInfoColor`

### Sheet slots
Each sheet slot can store an `overrides` object containing only the properties that differ from the master design.

Example:

```js
{
  slotIndex: 0,
  row: 0,
  col: 0,
  overrides: {
    backgroundColor: "#ff0000",
    libraryInfoText: "Custom text"
  }
}
```

### Inheritance rule
If a slot’s `overrides` object is empty, it renders exactly like the master design. Only explicitly overridden properties replace the master values. During export, the app clones the master design and merges overrides into that clone before rendering.

---

## Button Sizes and Layouts

Button and page layout behavior is controlled centrally in `js/config.js`.

### Supported button sizes

| Size | Cut Diameter | Face Diameter | Safe Diameter | Notes |
|------|-------------|---------------|---------------|-------|
| 1" | 1.313" | 1.0" | 0.875" | |
| 1.25" | 1.629" | 1.3" | 1.15" | |
| 1.5" | 1.837" | 1.5" | 1.35" | Default / primary |
| 1.75" | 2.088" | 1.75" | 1.575" | |
| 2" | 2.415" | 2.0" | 1.8" | |
| 2.25" | 2.625" | 2.25" | 2.025" | |
| 2.375" | 2.747" | 2.375" | 2.138" | Badge-a-Minit (BAM) |
| 2.5" | 2.920" | 2.5" | 2.25" | |
| 3" | 3.451" | 3.0" | 2.8" | |

### Current sheet layouts

| Size | Layout | Buttons per sheet |
|------|--------|-------------------|
| 1" | 5 × 7 | 35 |
| 1.25" | 4 × 6 | 24 |
| 1.5" | 4 × 5 | 20 |
| 1.75" | 3 × 4 | 12 |
| 2" | 3 × 4 | 12 |
| 2.25" | 3 × 3 | 9 |
| 2.375" | 2 × 3 | 6 |
| 2.5" | 2 × 3 | 6 |
| 3" | 2 × 2 | 4 |

### Page settings
- US Letter page size
- `0.3"` page margins
- `300 DPI` print rendering
- `72 points per inch` for jsPDF conversion

These values are defined in `CONFIG`, so additional sizes and layouts can be added without changing the overall app structure.

---

## Rendering Responsibilities

### `canvas.js`
Handles the visible design canvas and shared rendering behavior. This is where the main design is drawn and where the guide circles are rendered.

### `image-tool.js`
Owns image-specific editing behavior:
- file upload
- sizing/scaling
- drag-to-reposition
- image element management

### `text-tool.js`
Still provides text-related rendering utilities, especially the curved brand text used on buttons, even though the older broader text UI is not the current focus of the visible interface. The current UI clearly exposes Brand Text controls.

### `sheet-mode.js`
Builds the full sheet preview and selection system. It also owns tools such as:
- row/column application
- copy/paste
- reset to main
- make main design
- sheet naming
- multi-selection and selection UI hints

### `pdf-export.js`
Creates print-ready output by rendering each button to an offscreen canvas at print resolution and placing those renders into a PDF. It also merges slot overrides into cloned designs before export.

---

## Save / Load System

The app uses two persistence layers:

### 1. `.buttons` files
This is the main save/load format for user projects.

### 2. `localStorage`
The app also performs best-effort local autosave for session recovery. On startup, it attempts to restore:
- the current button size
- the main design
- sheet slots
- sheet name
- the most recent mode (`design` or `sheet`)

---

## Notifications

The app uses a simple toast-style notification system defined in `app.js`.

It supports:
- `error`
- `success`
- `info`

Notifications are shown in the `notification-area` element and auto-hide after a short timeout.

---

## Key Constants

| Constant / Setting | Location | Purpose |
|--------------------|----------|---------|
| `CONFIG.DPI` | `js/config.js` | Print rendering resolution |
| `CONFIG.CANVAS_DISPLAY_DIAMETER` | `js/config.js` | On-screen design canvas size |
| `CONFIG.BUTTON_SIZES` | `js/config.js` | Supported button dimensions |
| `CONFIG.SHEET_LAYOUTS` | `js/config.js` | Layout per button size |
| `CONFIG.PAGE` | `js/config.js` | Paper dimensions and margins |
| `CONFIG.GUIDES` | `js/config.js` | Cut, edge, and safe-zone guide styles |
| `CONFIG.DEFAULTS` | `js/config.js` | Base default design settings |
| `CONFIG.PDF.pointsPerInch` | `js/config.js` | jsPDF unit conversion |
| `NOTIFICATION_DURATION_MS` | `js/app.js` | Toast auto-hide timing |

---

## Where to Change Things

| Task | Location |
|------|----------|
| Add a new button size | `CONFIG.BUTTON_SIZES` in `js/config.js` |
| Add a new sheet layout | `CONFIG.SHEET_LAYOUTS` in `js/config.js` |
| Change page margins or page size math | `CONFIG.PAGE` in `js/config.js` |
| Adjust guide circle styling | `CONFIG.GUIDES` in `js/config.js` |
| Change brand text defaults | `CONFIG.DEFAULTS` in `js/config.js` |
| Modify image editing behavior | `js/image-tool.js` |
| Modify sheet selection and slot tools | `js/sheet-mode.js` |
| Change save/load behavior | `js/storage.js` |
| Modify export rendering or PDF placement | `js/pdf-export.js` |
| Change top-level app startup or notifications | `js/app.js` |

---

## External Dependencies

| Library | Loaded Via | Purpose |
|---------|------------|---------|
| jsPDF | Local `lib/` with fallback | PDF generation |
| Google Fonts | CDN | Fonts used by the app |
| Font Awesome | CDN | UI icons |

---

## Architecture Notes

This project intentionally keeps the stack simple:
- static files only
- no backend
- no build tooling
- shared global state
- shared renderer across editing, preview, and export

That simplicity makes the app easy to host and easy to inspect, but it also means script order and cross-file conventions matter a lot.