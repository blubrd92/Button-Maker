# Button Maker

A web-based tool for designing and printing 1.5" pinback buttons. Built for library staff who need to quickly create professional button designs and print tiled sheets for cutting.

## Quick Start

1. Open `index.html` in a web browser
2. Pick a template or start with a blank canvas
3. Add text, images, and customize colors
4. Export a PDF with 15 or 20 buttons per sheet
5. Print, cut, and assemble

## Features

- Template-based design with solid colors, patterns, and gradients
- Text tool with font selection, sizing, color, and curved text
- Image upload with positioning and layer ordering
- Library info curved footer text
- Save/load designs to browser localStorage
- PDF export with 15 or 20 button layouts per US Letter sheet
- Sheet Mode for per-button customization with master/override system

## For Developers

- **Architecture**: See `ARCHITECTURE.md` for file map and data flow
- **Conventions**: See `CONVENTIONS.md` for coding patterns and config structure
- **Button specs**: See `docs/BUTTON-SPECS.md` for physical dimensions

No build step required. Pure vanilla JavaScript with HTML5 Canvas.

## Dependencies

- [jsPDF](https://github.com/parallax/jsPDF) — PDF generation (loaded via CDN)
- [Google Fonts](https://fonts.google.com/) — Typography (loaded via CDN)
