# Button Maker

Button Maker is a browser-based tool for designing and printing pinback button sheets.

Built for library staff, but open to all, it is designed for fast, practical production work: create a main button design, customize selected buttons when needed, and export a print-ready PDF sheet for cutting and assembly.

The app supports nine button sizes from **1"** to **3"**, including the **2.375" Badge-a-Minit (BAM)** size.

## Quick Start

1. Open `index.html` in a web browser.
2. Choose a button size.
3. Build your main design in **Design** mode.
4. Switch to **Sheet** mode to preview the page and customize specific buttons.
5. Save your project as a `.buttons` file if needed.
6. Export a PDF and print at **Default** or **Actual size** for best results.

## Features

- Supports **nine button sizes**: 1", 1.25", 1.5", 1.75", 2", 2.25", 2.375" (BAM), 2.5", 3"
- Static web app with no build step
- **Design** mode for creating the default button style
- **Sheet** mode for previewing the print layout and customizing individual buttons
- Image upload with scaling and drag-to-reposition
- Background color controls and gradient options
- Brand text with curved text rendering and color controls
- Apply background or brand text changes to all buttons when desired
- Save and load projects as `.buttons` files
- Local autosave / session recovery
- PDF export for US Letter print sheets
- Zoom controls for both design and sheet views
- Toast notifications for load/save feedback

## Supported Layouts

| Size | Layout | Buttons/Sheet |
|------|--------|---------------|
| 1" | 5 × 7 | 35 |
| 1.25" | 4 × 6 | 24 |
| 1.5" | 4 × 5 | 20 |
| 1.75" | 3 × 4 | 12 |
| 2" | 3 × 4 | 12 |
| 2.25" | 3 × 3 | 9 |
| 2.375" (BAM) | 2 × 3 | 6 |
| 2.5" | 2 × 3 | 6 |
| 3" | 2 × 2 | 4 |

## Workflow

### Design Mode
Design Mode sets the default appearance for the full sheet. Use it to define the base look of your buttons before making any individual changes.

### Sheet Mode
Sheet Mode shows the printable page layout and lets you:

- select individual buttons
- multi-select buttons
- customize selected buttons
- apply changes across a row or column
- reset customized buttons back to the main design
- work from a main-design-plus-overrides workflow
- name the sheet for exported filenames

This makes it easy to keep one consistent overall design while creating variations across a sheet.

## File Structure

```text
Button-Maker/
├── index.html
├── css/
├── docs/
├── js/
│   ├── config.js
│   ├── canvas.js
│   ├── image-tool.js
│   ├── text-tool.js
│   ├── idb-storage.js
│   ├── storage.js
│   ├── pdf-export.js
│   ├── sheet-mode.js
│   ├── app.js
│   └── templates.js
├── lib/
├── ARCHITECTURE.md
├── CONVENTIONS.md
└── README.md