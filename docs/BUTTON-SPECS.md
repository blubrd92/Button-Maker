# Button Specifications Reference

Physical button dimensions for Tecre-style pinback button machines.

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

The ring between the button face (1.5") and the cut circle (1.837") is called the **wrap zone**. This paper folds over the metal button edge and tucks behind it. It is NOT visible on the finished button.

- **Do**: Extend backgrounds (color, patterns, gradients) into the wrap zone
- **Don't**: Put text, logos, or important graphics in the wrap zone

## 1.5" Button (Tecre Standard)

| Zone | Diameter (inches) | Radius (inches) | Purpose |
|------|-------------------|------------------|---------|
| Cut Circle | 1.837 | 0.9185 | Paper cut boundary |
| Button Face | 1.500 | 0.7500 | Visible button front |
| Safe Zone | 1.350 | 0.6750 | Safe area for content |

These dimensions are for the **Tecre** button-making machine, the most common brand in library and educational settings.

## Adding New Button Sizes

To add a new button size:

1. Add an entry to `BUTTON_SIZES` in `js/config.js`
2. Each entry needs: `cutDiameter`, `faceDiameter`, `safeDiameter` (all in inches)
3. The tiling layout (rows/columns per sheet) may need adjustment in `SHEET_LAYOUTS`
4. Example for a hypothetical 2.25" button:

```javascript
"2.25": {
  label: '2.25"',
  cutDiameter: 2.625,
  faceDiameter: 2.25,
  safeDiameter: 2.0,
  primary: false
}
```

## Print Accuracy

The PDF export must render buttons at **exactly** the cut circle diameter. This is critical:
- Buttons are cut with a circle cutter calibrated to the cut circle size
- If the printed circle is even slightly off, the cut won't align
- All print rendering uses 300 DPI for crisp output
- jsPDF works in points (72 per inch) — use `inchesToPoints()` for conversion
