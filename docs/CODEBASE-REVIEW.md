# Codebase Familiarization Notes

## Purpose

This document captures a quick technical orientation of the Button Maker project to speed up future development and maintenance.

## High-Level Architecture

- **Runtime model**: Static browser app (no backend, no build step).
- **Core state**: `currentDesign` is the in-memory master design object.
- **Rendering strategy**: One shared renderer (`renderButtonDesign`) is reused for editor canvas, sheet thumbnails, and print export.
- **Output**: PDF generation uses jsPDF with offscreen 300 DPI canvas rendering.

## Module Responsibilities

- `js/config.js`: centralized constants and layout math helpers.
- `js/templates.js`: template catalog and template-picker rendering.
- `js/canvas.js`: editor canvas setup, pointer interactions, and primary rendering logic.
- `js/text-tool.js`: text element CRUD/editing, including curved text behaviors.
- `js/image-tool.js`: upload/position/resize/layer controls for images.
- `js/sheet-mode.js`: slot override model and sheet editing interactions.
- `js/storage.js`: localStorage persistence with (de)serialization of non-serializable fields.
- `js/pdf-export.js`: printable tiled-sheet export.
- `js/app.js`: startup sequence and top-level UI event wiring.

## Data Model and Flow

1. User actions mutate `currentDesign` (or slot overrides in sheet mode).
2. Design view updates via `renderDesignCanvas`.
3. Shared render function is reused by:
   - Sheet thumbnails (`sheet-mode.js`)
   - PDF export (`pdf-export.js`)

This keeps visual parity between editor, sheet mode, and exported output.

## Important Invariants

- Design coordinates are stored in **inches offset from center**, then converted at render time using a target `scale` (px/in).
- Font size is stored in **points**, converted with `(scale / 72)`.
- Saved payloads persist `templateId` and image `dataUrl`, while runtime-only fields (`templateDraw`, `imgObj`) are reconstructed during load.
- In sheet mode, slot `overrides` should remain sparse (changed properties only) to preserve master inheritance semantics.

## Risk Areas to Watch

- **Global shared state coupling** across modules (e.g., `currentDesign`, `selectedSlots`, `currentMode`) can introduce side effects if changed without coordinated updates.
- **Script order dependence** in `index.html` is critical; moving scripts can break initialization.
- **Layout/gutter math** impacts print alignment; any change should be validated visually in both 15 and 20 layouts.
- **Serialization changes** can break backward compatibility with existing localStorage designs.

## Suggested Next Validation Checklist for Feature Work

- Verify edit-canvas interactions (text/image selection and drag).
- Verify sheet mode inheritance/override behaviors (single and multi-select).
- Verify save/load round trip with templates + images.
- Verify PDF output for both 15-up and 20-up layouts.

