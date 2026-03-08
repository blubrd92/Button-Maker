/**
 * text-tool.js
 *
 * Manages text elements on the button design canvas.
 *
 * Responsibilities:
 * - Adding, editing, and deleting text elements
 * - Font, size, color, bold, italic, alignment controls
 * - Curved/arced text rendering along a circular path
 * - Hit-testing for text element selection
 * - Rendering text elements onto any canvas context
 *
 * Depends on:
 * - config.js (FONTS, DEFAULTS, DPI)
 * - canvas.js (currentDesign, renderDesignCanvas, selectedElement)
 *
 * Gotchas:
 * - Text positions (x, y) are stored in INCHES relative to the button center.
 *   (0, 0) is the center of the button.
 * - Font size is stored in POINTS at print size. When rendering to screen,
 *   convert: screenPx = points * (canvasScale / 72).
 * - Curved text uses individual character placement along an arc path.
 *   This is more reliable than trying to use textPath equivalents on canvas.
 * - The text bounding box for hit-testing is approximate — uses measureText
 *   width and a height estimate based on font size.
 */

// ─── Text element data structure ───────────────────────────────────
// Each text element in currentDesign.textElements looks like:
// {
//   text: "Hello",
//   fontFamily: "Roboto",
//   fontSize: 24,           // points at print size
//   color: "#222222",
//   bold: false,
//   italic: false,
//   align: "center",        // "left" | "center" | "right"
//   x: 0,                   // inches from center
//   y: 0,                   // inches from center
//   curved: false,
//   curveRadius: 100        // canvas pixels for the curve (positive = top arc, negative = bottom arc)
// }

/**
 * Create a new text element with default properties and add it to the design.
 * Selects the new element and shows controls.
 */
function addTextElement() {
  const newText = {
    text: "New Text",
    fontFamily: CONFIG.DEFAULTS.fontFamily,
    fontSize: CONFIG.DEFAULTS.fontSize,
    color: CONFIG.DEFAULTS.textColor,
    bold: false,
    italic: false,
    align: "center",
    x: 0,
    y: 0,
    curved: false,
    curveRadius: 100
  };

  currentDesign.textElements.push(newText);
  const index = currentDesign.textElements.length - 1;
  selectedElement = { type: 'text', index };
  showTextControls(index);
  renderDesignCanvas();
}

/**
 * Delete the currently selected text element.
 */
function deleteSelectedText() {
  if (!selectedElement || selectedElement.type !== 'text') return;

  currentDesign.textElements.splice(selectedElement.index, 1);
  selectedElement = null;
  hideTextControls();
  renderDesignCanvas();
}

/**
 * Show the text controls panel with values from the given text element.
 * @param {number} index - index in currentDesign.textElements
 */
function showTextControls(index) {
  const textEl = currentDesign.textElements[index];
  if (!textEl) return;

  const controls = document.getElementById('text-controls');
  controls.classList.remove('hidden');

  document.getElementById('text-input').value = textEl.text;
  document.getElementById('font-select').value = textEl.fontFamily;
  document.getElementById('font-size').value = textEl.fontSize;
  document.getElementById('font-size-display').textContent = textEl.fontSize;
  document.getElementById('text-color-picker').value = textEl.color;
  document.getElementById('text-curved').checked = textEl.curved;

  // Show/hide curve radius control
  document.getElementById('curve-radius-row').style.display = textEl.curved ? '' : 'none';
  document.getElementById('curve-radius').value = textEl.curveRadius;

  // Bold/italic toggle states
  document.getElementById('btn-bold').classList.toggle('active', textEl.bold);
  document.getElementById('btn-italic').classList.toggle('active', textEl.italic);

  // Alignment states
  document.getElementById('btn-align-left').classList.toggle('active', textEl.align === 'left');
  document.getElementById('btn-align-center').classList.toggle('active', textEl.align === 'center');
  document.getElementById('btn-align-right').classList.toggle('active', textEl.align === 'right');

  // Hide image controls if visible
  hideImageControls();
}

/**
 * Hide the text controls panel.
 */
function hideTextControls() {
  document.getElementById('text-controls').classList.add('hidden');
}

/**
 * Update a property on the currently selected text element and re-render.
 * @param {string} prop - property name
 * @param {*} value - new value
 */
function updateSelectedTextProperty(prop, value) {
  if (!selectedElement || selectedElement.type !== 'text') return;
  const textEl = currentDesign.textElements[selectedElement.index];
  if (!textEl) return;

  textEl[prop] = value;
  renderDesignCanvas();
}

// ─── Rendering ─────────────────────────────────────────────────────

/**
 * Render all text elements onto the editing canvas.
 * Called from canvas.js renderDesignCanvas().
 */
function renderTextElements(ctx, cx, cy, scale) {
  currentDesign.textElements.forEach(textEl => {
    renderSingleTextElement(ctx, cx, cy, scale, textEl, false);
  });
}

/**
 * Render all text elements from a design object (for PDF/sheet rendering).
 */
function renderTextElementsWithDesign(ctx, cx, cy, scale, design, isPrint) {
  (design.textElements || []).forEach(textEl => {
    renderSingleTextElement(ctx, cx, cy, scale, textEl, isPrint);
  });
}

/**
 * Render one text element onto a canvas context.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx - center X in canvas pixels
 * @param {number} cy - center Y in canvas pixels
 * @param {number} scale - pixels per inch
 * @param {Object} textEl - the text element data
 * @param {boolean} isPrint - if true, use print DPI for sizing
 */
function renderSingleTextElement(ctx, cx, cy, scale, textEl, isPrint) {
  if (!textEl.text) return;

  // Convert font size from points to canvas pixels.
  // Points are 1/72 inch. Multiply by scale (pixels per inch) to get canvas pixels.
  const fontSizePx = textEl.fontSize * (scale / 72);

  // Build font string
  const fontStyle = textEl.italic ? 'italic' : 'normal';
  const fontWeight = textEl.bold ? 'bold' : 'normal';
  const fontString = `${fontStyle} ${fontWeight} ${fontSizePx}px "${textEl.fontFamily}"`;

  ctx.font = fontString;
  ctx.fillStyle = textEl.color;
  ctx.textAlign = textEl.align;
  ctx.textBaseline = 'middle';

  // Position in canvas pixels (relative to center)
  const px = cx + textEl.x * scale;
  const py = cy + textEl.y * scale;

  if (textEl.curved) {
    // Render text along a circular arc
    drawCurvedText(ctx, textEl.text, px, py, textEl.curveRadius * (scale / getCanvasScale()), fontSizePx, textEl.align);
  } else {
    // Straight text
    ctx.fillText(textEl.text, px, py);
  }
}

/**
 * Draw text along a circular arc using character-by-character placement.
 * Positive radius curves upward (text bows up, like the top of a circle),
 * negative radius curves downward (text bows down, like the bottom of a circle).
 *
 * The text is positioned so its baseline sits on the arc. The arc center
 * is computed from the text position and radius.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} textX - text anchor X position in canvas pixels
 * @param {number} textY - text anchor Y position in canvas pixels
 * @param {number} radius - arc radius in pixels (positive = top arc, negative = bottom arc)
 * @param {number} fontSizePx - font size in pixels
 * @param {string} align - text alignment ("left", "center", "right")
 */
function drawCurvedText(ctx, text, textX, textY, radius, fontSizePx, align) {
  if (Math.abs(radius) < 10) {
    // Radius too small, render straight to avoid visual glitches
    ctx.fillText(text, textX, textY);
    return;
  }

  const isTopArc = radius > 0;
  const absRadius = Math.abs(radius);

  // The arc center is directly below (top arc) or above (bottom arc) the text position
  const arcCenterX = textX;
  const arcCenterY = isTopArc ? textY + absRadius : textY - absRadius;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Measure each character width
  const chars = text.split('');
  const charWidths = chars.map(ch => ctx.measureText(ch).width);
  const totalWidth = charWidths.reduce((sum, w) => sum + w, 0);

  // Total angle the text string spans along the arc
  const totalAngle = totalWidth / absRadius;

  // Start angle: top of circle for top arc, bottom for bottom arc
  // Canvas angles: 0=right, PI/2=down, PI=left, -PI/2 or 3PI/2=up
  const midAngle = isTopArc ? -Math.PI / 2 : Math.PI / 2;

  // Alignment offset (center the text span around the midpoint)
  let startAngle;
  if (align === 'center') {
    startAngle = midAngle - (totalAngle / 2) * (isTopArc ? 1 : -1);
  } else if (align === 'right') {
    startAngle = midAngle - totalAngle * (isTopArc ? 1 : -1);
  } else {
    startAngle = midAngle;
  }

  let angle = startAngle;
  const direction = isTopArc ? 1 : -1;

  chars.forEach((ch, i) => {
    const halfCharAngle = (charWidths[i] / 2) / absRadius;
    angle += halfCharAngle * direction;

    // Character position on the arc
    const x = arcCenterX + absRadius * Math.cos(angle);
    const y = arcCenterY + absRadius * Math.sin(angle);

    ctx.save();
    ctx.translate(x, y);

    // Rotate character so its baseline follows the arc tangent
    const rotation = angle + (isTopArc ? Math.PI / 2 : -Math.PI / 2);
    ctx.rotate(rotation);

    ctx.fillText(ch, 0, 0);
    ctx.restore();

    angle += halfCharAngle * direction;
  });

  ctx.restore();
}

// ─── Library Info Text ─────────────────────────────────────────────
// Curved text along the bottom of the safe zone circle.

/**
 * Render the library info text along the bottom arc of the safe zone.
 * For screen rendering (editing canvas).
 */
function renderLibraryInfoText(ctx, cx, cy, safeRadius, scale) {
  if (!currentDesign.libraryInfoText) return;
  renderLibraryInfoTextInternal(ctx, cx, cy, safeRadius, scale,
    currentDesign.libraryInfoText, currentDesign.libraryInfoColor, false);
}

/**
 * Render library info text for a given design (PDF/sheet mode).
 */
function renderLibraryInfoTextWithDesign(ctx, cx, cy, safeRadius, scale, design, isPrint) {
  if (!design.libraryInfoText) return;
  renderLibraryInfoTextInternal(ctx, cx, cy, safeRadius, scale,
    design.libraryInfoText, design.libraryInfoColor, isPrint);
}

/**
 * Internal: render library info curved text along the bottom of the safe zone.
 *
 * For print rendering (isPrint=true), we render at 300 DPI internally
 * to keep the small text crisp. For screen, we render at canvas scale.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx - center X
 * @param {number} cy - center Y
 * @param {number} safeRadius - safe zone radius in current scale pixels
 * @param {number} scale - current pixels per inch
 * @param {string} text
 * @param {string} color
 * @param {boolean} isPrint - render at print DPI
 */
function renderLibraryInfoTextInternal(ctx, cx, cy, safeRadius, scale, text, color, isPrint) {
  // Font size: 4.3pt at print size -> convert to current scale pixels.
  // Points are 1/72 inch; multiply by scale (px/inch) to get pixels.
  const fontSizePt = CONFIG.DEFAULTS.libraryInfoFontSize;
  const fontSizePx = fontSizePt * (scale / 72);

  ctx.save();
  ctx.font = `normal normal ${fontSizePx}px "Roboto"`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Place text along the bottom inside arc of the safe zone circle.
  // The text curves along the circle, centered at the very bottom.
  // textRadius is slightly inside the safe zone so characters don't touch the edge.
  const textRadius = safeRadius - fontSizePx * 1.0;

  const chars = text.split('');
  const charWidths = chars.map(ch => ctx.measureText(ch).width);
  const totalWidth = charWidths.reduce((sum, w) => sum + w, 0);

  // Total angle spanned by the text string along the arc
  const totalAngle = totalWidth / textRadius;

  // Center the text at the bottom of the circle (PI/2 in canvas coords).
  //
  // Canvas angles go CLOCKWISE: 0=right, PI/2=bottom, PI=left.
  // To make text read LEFT-TO-RIGHT along the bottom arc, we need to
  // iterate COUNTER-CLOCKWISE (decreasing angle), because at the bottom:
  //   - larger angle = further LEFT on screen
  //   - smaller angle = further RIGHT on screen
  // So the first character starts at the LEFT side (high angle) and we
  // move toward the RIGHT (decreasing angle).
  const centerAngle = Math.PI / 2;
  let currentAngle = centerAngle + totalAngle / 2;  // start on the LEFT

  chars.forEach((ch, i) => {
    const halfCharAngle = (charWidths[i] / 2) / textRadius;
    currentAngle -= halfCharAngle;  // move counter-clockwise (toward right)

    // Position on the arc
    const x = cx + textRadius * Math.cos(currentAngle);
    const y = cy + textRadius * Math.sin(currentAngle);

    ctx.save();
    ctx.translate(x, y);

    // Rotate so the character's top points toward center and it reads
    // naturally left-to-right. At angle θ, rotating by θ + PI/2 makes
    // the character upright with its top pointing toward the circle center.
    ctx.rotate(currentAngle + Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();

    currentAngle -= halfCharAngle;  // advance past this character
  });

  ctx.restore();
}

// ─── Hit testing ───────────────────────────────────────────────────

/**
 * Check if a point (in inches, relative to center) is inside a text element's
 * bounding box.
 * @param {number} inchX
 * @param {number} inchY
 * @param {Object} textEl
 * @returns {boolean}
 */
function isPointInTextElement(inchX, inchY, textEl) {
  if (!textEl.text) return false;

  // Approximate bounding box in inches
  const fontSizeInches = textEl.fontSize / 72;  // points to inches
  const approxWidth = textEl.text.length * fontSizeInches * 0.6;
  const approxHeight = fontSizeInches * 1.2;

  let left, right;
  if (textEl.align === 'center') {
    left = textEl.x - approxWidth / 2;
    right = textEl.x + approxWidth / 2;
  } else if (textEl.align === 'right') {
    left = textEl.x - approxWidth;
    right = textEl.x;
  } else {
    left = textEl.x;
    right = textEl.x + approxWidth;
  }

  const top = textEl.y - approxHeight / 2;
  const bottom = textEl.y + approxHeight / 2;

  return inchX >= left && inchX <= right && inchY >= top && inchY <= bottom;
}

/**
 * Draw a selection box around a text element.
 */
function drawTextSelectionBox(ctx, textEl, cx, cy, scale) {
  const fontSizeInches = textEl.fontSize / 72;
  const approxWidth = textEl.text.length * fontSizeInches * 0.6;
  const approxHeight = fontSizeInches * 1.2;

  let left;
  if (textEl.align === 'center') {
    left = textEl.x - approxWidth / 2;
  } else if (textEl.align === 'right') {
    left = textEl.x - approxWidth;
  } else {
    left = textEl.x;
  }

  const px = cx + left * scale;
  const py = cy + (textEl.y - approxHeight / 2) * scale;
  const pw = approxWidth * scale;
  const ph = approxHeight * scale;

  ctx.strokeStyle = '#4A90D9';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(px, py, pw, ph);
  ctx.setLineDash([]);
}

// ─── Text controls event wiring ────────────────────────────────────

/**
 * Initialize text tool event listeners.
 * Called once from app.js.
 */
function initTextTool() {
  document.getElementById('btn-add-text').addEventListener('click', addTextElement);
  document.getElementById('btn-delete-text').addEventListener('click', deleteSelectedText);

  // Text input
  document.getElementById('text-input').addEventListener('input', (e) => {
    updateSelectedTextProperty('text', e.target.value);
  });

  // Font select
  document.getElementById('font-select').addEventListener('change', (e) => {
    updateSelectedTextProperty('fontFamily', e.target.value);
  });

  // Font size
  document.getElementById('font-size').addEventListener('input', (e) => {
    const size = parseInt(e.target.value);
    document.getElementById('font-size-display').textContent = size;
    updateSelectedTextProperty('fontSize', size);
  });

  // Text color
  document.getElementById('text-color-picker').addEventListener('input', (e) => {
    updateSelectedTextProperty('color', e.target.value);
  });

  // Bold toggle
  document.getElementById('btn-bold').addEventListener('click', () => {
    if (!selectedElement || selectedElement.type !== 'text') return;
    const textEl = currentDesign.textElements[selectedElement.index];
    textEl.bold = !textEl.bold;
    document.getElementById('btn-bold').classList.toggle('active', textEl.bold);
    renderDesignCanvas();
  });

  // Italic toggle
  document.getElementById('btn-italic').addEventListener('click', () => {
    if (!selectedElement || selectedElement.type !== 'text') return;
    const textEl = currentDesign.textElements[selectedElement.index];
    textEl.italic = !textEl.italic;
    document.getElementById('btn-italic').classList.toggle('active', textEl.italic);
    renderDesignCanvas();
  });

  // Alignment buttons
  ['left', 'center', 'right'].forEach(align => {
    document.getElementById(`btn-align-${align}`).addEventListener('click', () => {
      if (!selectedElement || selectedElement.type !== 'text') return;
      updateSelectedTextProperty('align', align);
      document.getElementById('btn-align-left').classList.toggle('active', align === 'left');
      document.getElementById('btn-align-center').classList.toggle('active', align === 'center');
      document.getElementById('btn-align-right').classList.toggle('active', align === 'right');
    });
  });

  // Curved text toggle
  document.getElementById('text-curved').addEventListener('change', (e) => {
    updateSelectedTextProperty('curved', e.target.checked);
    document.getElementById('curve-radius-row').style.display = e.target.checked ? '' : 'none';
  });

  // Curve radius
  document.getElementById('curve-radius').addEventListener('input', (e) => {
    updateSelectedTextProperty('curveRadius', parseInt(e.target.value));
  });

  // Populate font selector from CONFIG
  const fontSelect = document.getElementById('font-select');
  fontSelect.innerHTML = '';
  CONFIG.FONTS.forEach(font => {
    const option = document.createElement('option');
    option.value = font.family;
    option.textContent = `${font.family} (${font.category})`;
    option.style.fontFamily = font.family;
    fontSelect.appendChild(option);
  });
}
