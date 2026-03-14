# Button Specifications Reference

Physical button dimensions for Tecre-style and Badge-a-Minit (BAM) pinback button machines.

## Understanding Button Zones

A pinback button is made from a flat printed circle of paper that gets folded over a metal shell. The paper extends beyond the visible face of the button — the excess wraps around the edge and tucks behind it. This means the printed area is larger than the finished button.

```
    ┌─────────────────────────────────────┐
    │         CUT CIRCLE (1.837")         │
    │   ┌─────────────────────────────┐   │
    │   │     BUTTON FACE (1.5")      │   │
    │   │   ┌─────────────────────┐   │   │
    │   │   │  SAFE ZONE (1.35")  │   │   │
    │   │   │                     │   │   │
    │   │   │  All important text │   │   │
    │   │   │  and graphics go    │   │   │
    │   │   │  here.              │   │   │
    │   │   │                     │   │   │
    │   │   └─────────────────────┘   │   │
    │   │                             │   │
    │   └─────────────────────────────┘   │
    │              WRAP ZONE              │
    │   (folds over edge — hidden area)   │
    └─────────────────────────────────────┘
```

### Three Zones Explained

1. **Cut Circle (outermost)**: The total printed area. Paper is cut to this diameter. Background colors and patterns should extend to the full cut circle so there are no white edges after assembly. **Do not place important content here.**

2. **Button Face (middle)**: The visible front of the finished button. This is what people see when the button is pinned to a shirt. Content here is visible but close to the edge — slight manufacturing variance means items very close to this boundary might get partially hidden.

3. **Safe Zone (innermost)**: The guaranteed-visible area. All text, logos, and important graphics should stay within this circle. Anything inside the safe zone will definitely be visible on the finished button.

### Wrap Zone

The ring between the button face and the cut circle is called the **wrap zone**. This paper folds over the metal button edge and tucks behind it. It is NOT visible on the finished button.

- **Do**: Extend backgrounds (color, patterns, gradients) into the wrap zone
- **Don't**: Put text, logos, or important graphics in the wrap zone

## All Supported Button Sizes

Dimensions are for **Tecre**-style machines unless noted. The 2.375" size is the **Badge-a-Minit (BAM)** standard.

| Size | Cut Circle | Face Diameter | Safe Zone | Notes |
|------|-----------|---------------|-----------|-------|
| 1" | 1.313" | 1.0" | 0.875" | |
| 1.25" | 1.629" | 1.3" | 1.15" | |
| 1.5" | 1.837" | 1.5" | 1.35" | Default size, most common |
| 1.75" | 2.088" | 1.75" | 1.575" | |
| 2" | 2.415" | 2.0" | 1.8" | |
| 2.25" | 2.625" | 2.25" | 2.025" | |
| 2.375" | 2.747" | 2.375" | 2.138" | Badge-a-Minit (BAM) |
| 2.5" | 2.920" | 2.5" | 2.25" | |
| 3" | 3.451" | 3.0" | 2.8" | |

### Diameter relationships

- **faceDiameter** generally matches the nominal button size (e.g., a 2" button has a 2.0" face)
- **safeDiameter** is approximately 90% of faceDiameter
- **cutDiameter** includes the wrap zone needed for assembly

### 1.25" note

The 1.25" button uses a faceDiameter of 1.3" (slightly larger than the nominal size) to better fit brand text between the safe zone and the face edge.

## Adding New Button Sizes

To add a new button size:

1. Add an entry to `BUTTON_SIZES` in `js/config.js`
2. Each entry needs: `label`, `cutDiameter`, `faceDiameter`, `safeDiameter`, `primary` (all diameters in inches)
3. Add a matching entry to `SHEET_LAYOUTS` with `label`, `description`, `cols`, `rows`
4. Add an `<option>` element to the `#button-size-select` dropdown in `index.html`

Example:

```javascript
// In BUTTON_SIZES:
"2.75": {
  label: '2.75"',
  cutDiameter: 3.170,
  faceDiameter: 2.75,
  safeDiameter: 2.475,
  primary: false
}

// In SHEET_LAYOUTS:
"2.75": {
  label: "Standard (4)",
  description: "2 columns x 2 rows",
  cols: 2,
  rows: 2
}
```

## Print Accuracy

The PDF export must render buttons at **exactly** the cut circle diameter. This is critical:
- Buttons are cut with a circle cutter calibrated to the cut circle size
- If the printed circle is even slightly off, the cut won't align
- All print rendering uses 300 DPI for crisp output
- jsPDF works in points (72 per inch) — use `inchesToPoints()` for conversion
- Users should print at **Default** or **Actual size** scale (no fit-to-page)
