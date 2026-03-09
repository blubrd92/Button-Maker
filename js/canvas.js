/**
 * canvas.js
 *
 * Manages the HTML5 Canvas design surface for button editing.
 *
 * Responsibilities:
 * - Rendering the button design at editing size (scaled up from inches)
 * - Drawing guide circles (cut line, button edge, safe zone)
 * - Drawing background, text elements, images, and library info text
 * - Handling canvas interaction (click to select elements, drag to move)
 * - Providing shared rendering functions used by pdf-export.js
 *
 * Depends on:
 * - config.js (dimensions, scales, guide styles)
 * - templates.js (template draw functions for backgrounds)
 * - text-tool.js (text element data and curved text rendering)
 * - image-tool.js (image element data)
 *
 * Gotchas:
 * - The editing canvas uses getCanvasScale() to convert inches to pixels.
 * All positions/sizes in the design state are stored in INCHES, then
 * converted to canvas pixels only at render time.
 * - The canvas is square, sized to CANVAS_DISPLAY_DIAMETER.
 * - The wrap zone (between button face and cut circle) is dimmed to
 * visually distinguish it from the button face.
 */

// ─── Design state ──────────────────────────────────────────────────
// The master design object. All positions and sizes are in INCHES
// at print resolution. Canvas and PDF rendering convert from this.
let currentDesign = {
  templateId: "blank",
  backgroundColor: CONFIG.DEFAULTS.backgroundColor,
  templateDraw: null,          // reference to template's draw function
  gradient: null,              // { color1, color2, direction } or null
  textElements: [],            // array of text element objects (see text-tool.js)
  imageElements: [],           // array of image element objects (see image-tool.js)
  libraryInfoText: CONFIG.DEFAULTS.libraryInfoText,
  libraryInfoColor: CONFIG.DEFAULTS.libraryInfoColor
};

// Track which element is currently selected for editing
let selectedElement = null;     // { type: 'text'|'image', index: number } or null

// ─── Canvas setup ──────────────────────────────────────────────────

/**
 * Initialize the design canvas: set dimensions and attach event listeners.
 * Called once from app.js on startup.
 */
function initDesignCanvas() {
  const canvas = document.getElementById('design-canvas');
  const size = CONFIG.CANVAS_DISPLAY_DIAMETER;
  canvas.width = size;
  canvas.height = size;

  // Attach mouse interaction handlers
  canvas.addEventListener('mousedown', handleCanvasMouseDown);
  canvas.addEventListener('mousemove', handleCanvasMouseMove);
  canvas.addEventListener('mouseup', handleCanvasMouseUp);

  // Pointer cursor when hovering the safe zone (image upload target)
  canvas.addEventListener('mousemove', function(e) {
    if (isDragging || isResizing) return;
    var rect = canvas.getBoundingClientRect();
    var cssToCanvas = canvas.width / rect.width;
    var mouseX = (e.clientX - rect.left) * cssToCanvas;
    var mouseY = (e.clientY - rect.top) * cssToCanvas;
    var cx = CONFIG.CANVAS_DISPLAY_DIAMETER / 2;
    var cy = CONFIG.CANVAS_DISPLAY_DIAMETER / 2;
    var scale = getCanvasScale();
    var btnSize = getCurrentButtonSize();
    var safeRadius = (btnSize.safeDiameter / 2) * scale;
    var dist = Math.sqrt(Math.pow(mouseX - cx, 2) + Math.pow(mouseY - cy, 2));
    canvas.style.cursor = dist <= safeRadius ? 'pointer' : 'default';
  });

  // Initial render
  renderDesignCanvas();
}

/**
 * Main render function for the editing canvas.
 * Draws everything in z-order: background -> images -> text -> library info -> guides.
 */
function renderDesignCanvas() {
  const canvas = document.getElementById('design-canvas');
  const ctx = canvas.getContext('2d');
  const size = CONFIG.CANVAS_DISPLAY_DIAMETER;
  const cx = size / 2;
  const cy = size / 2;
  const scale = getCanvasScale();
  const btnSize = getCurrentButtonSize();

  const cutRadius = (btnSize.cutDiameter / 2) * scale;
  const faceRadius = (btnSize.faceDiameter / 2) * scale;
  const safeRadius = (btnSize.safeDiameter / 2) * scale;

  // Clear canvas
  ctx.clearRect(0, 0, size, size);

  // ── 1. Background ──
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, cutRadius, 0, Math.PI * 2);
  ctx.clip();

  if (currentDesign.templateDraw) {
    // Use template's draw function
    currentDesign.templateDraw(ctx, cx, cy, cutRadius);
  } else {
    // Solid color fallback
    ctx.fillStyle = currentDesign.backgroundColor;
    ctx.beginPath();
    ctx.arc(cx, cy, cutRadius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // ── 2. Wrap zone dimming ──
  // Dim the area between face and cut circles to indicate wrap zone
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, cutRadius, 0, Math.PI * 2);
  ctx.arc(cx, cy, faceRadius, 0, Math.PI * 2, true); // counter-clockwise to cut out
  ctx.fillStyle = CONFIG.WRAP_ZONE_DIM;
  ctx.fill();
  ctx.restore();

  // ── 3. Image elements (bottom layer) ──
  renderImageElements(ctx, cx, cy, scale);

  // ── 4. Text elements ──
  renderTextElements(ctx, cx, cy, scale);

  // ── 5. Library info curved text ──
  renderLibraryInfoText(ctx, cx, cy, safeRadius, scale);

  // ── 6. Guide circles ──
  drawGuideCircles(ctx, cx, cy, cutRadius, faceRadius, safeRadius);

  // ── 7. Selection highlight ──
  drawSelectionHighlight(ctx, cx, cy, scale);
}

/**
 * Draw the three guide circles: cut line, button edge, safe zone.
 * Uses styles from CONFIG.GUIDES.
 */
function drawGuideCircles(ctx, cx, cy, cutRadius, faceRadius, safeRadius) {
  const guides = [
    { radius: cutRadius, style: CONFIG.GUIDES.cutLine },
    { radius: faceRadius, style: CONFIG.GUIDES.buttonEdge },
    { radius: safeRadius, style: CONFIG.GUIDES.safeZone }
  ];

  guides.forEach(({ radius, style }) => {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.lineWidth;
    ctx.setLineDash(style.dashPattern);
    ctx.stroke();
    ctx.setLineDash([]);
  });
}

/**
 * Draw a highlight around the currently selected element.
 */
function drawSelectionHighlight(ctx, cx, cy, scale) {
  if (!selectedElement) return;

  if (selectedElement.type === 'text') {
    const textEl = currentDesign.textElements[selectedElement.index];
    if (!textEl) return;
    drawTextSelectionBox(ctx, textEl, cx, cy, scale);
  } else if (selectedElement.type === 'image') {
    const imgEl = currentDesign.imageElements[selectedElement.index];
    if (!imgEl) return;
    drawImageSelectionBox(ctx, imgEl, cx, cy, scale);
  }
}

// ─── Rendering a button design to any canvas context ───────────────
// This function is shared between the editing canvas and PDF export.

/**
 * Render the full button design to an arbitrary canvas context.
 * Used by both the editing view and PDF export.
 *
 * @param {CanvasRenderingContext2D} ctx - The target canvas context
 * @param {number} cx - Center X in target coordinates
 * @param {number} cy - Center Y in target coordinates
 * @param {number} scale - pixels per inch for this render
 * @param {Object} design - The design data object
 * @param {Object} [options] - Rendering options
 * @param {boolean} [options.showGuides=false] - Draw guide circles
 * @param {boolean} [options.showCutGuide=false] - Draw cut guide only (for PDF)
 * @param {boolean} [options.isPrint=false] - Render at print quality
 */
function renderButtonDesign(ctx, cx, cy, scale, design, options = {}) {
  const btnSize = getCurrentButtonSize();
  const cutRadius = (btnSize.cutDiameter / 2) * scale;
  const faceRadius = (btnSize.faceDiameter / 2) * scale;
  const safeRadius = (btnSize.safeDiameter / 2) * scale;

  // Background
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, cutRadius, 0, Math.PI * 2);
  ctx.clip();

  if (design.templateDraw) {
    design.templateDraw(ctx, cx, cy, cutRadius);
  } else {
    ctx.fillStyle = design.backgroundColor;
    ctx.beginPath();
    ctx.arc(cx, cy, cutRadius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Images
  renderImageElementsWithDesign(ctx, cx, cy, scale, design);

  // Text elements
  renderTextElementsWithDesign(ctx, cx, cy, scale, design, options.isPrint);

  // Library info text
  if (design.libraryInfoText) {
    renderLibraryInfoTextWithDesign(ctx, cx, cy, safeRadius, scale, design, options.isPrint);
  }

  // Cut guide for PDF - Solid black line
  if (options.showCutGuide) {
    ctx.beginPath();
    // Inset slightly to prevent clipping against the absolute edge of the canvas
    ctx.arc(cx, cy, cutRadius - (options.isPrint ? 1 : 0.5), 0, Math.PI * 2);
    ctx.strokeStyle = '#000000';
    // 2 pixels at 300 DPI is a clean, highly visible line
    ctx.lineWidth = options.isPrint ? 2 : 1;
    ctx.stroke();
  }

  // Full guides for screen/sheet
  if (options.showGuides) {
    drawGuideCircles(ctx, cx, cy, cutRadius, faceRadius, safeRadius);
  }
}

// ─── Mouse interaction ─────────────────────────────────────────────

let isDragging = false;
let dragOffset = { x: 0, y: 0 };
// Set to true on mousedown if an element was hit, so the click handler knows
let lastMouseDownHitElement = false;

/**
 * Handle mouse down on the canvas: select or start dragging an element.
 */
function handleCanvasMouseDown(e) {
  const canvas = e.target;
  const rect = canvas.getBoundingClientRect();
  // Account for CSS sizing vs canvas pixel size
  const cssToCanvas = canvas.width / rect.width;
  const mouseX = (e.clientX - rect.left) * cssToCanvas;
  const mouseY = (e.clientY - rect.top) * cssToCanvas;
  const scale = getCanvasScale();
  const cx = CONFIG.CANVAS_DISPLAY_DIAMETER / 2;
  const cy = CONFIG.CANVAS_DISPLAY_DIAMETER / 2;

  // Convert mouse position to inches (relative to center)
  var inchX = (mouseX - cx) / scale;
  var inchY = (mouseY - cy) / scale;

  // Check resize handles on currently selected image first
  if (selectedElement && selectedElement.type === 'image') {
    var selImg = currentDesign.imageElements[selectedElement.index];
    if (selImg) {
      var handle = getResizeHandle(mouseX, mouseY, selImg, cx, cy, scale);
      if (handle) {
        isResizing = true;
        resizeCorner = handle;
        resizeStartPos = { x: mouseX, y: mouseY };
        resizeStartDims = { width: selImg.width, height: selImg.height, x: selImg.x, y: selImg.y };
        lastMouseDownHitElement = true;
        return;
      }
    }
  }

  // Check text elements (top to bottom in z-order, so iterate in reverse)
  for (var i = currentDesign.textElements.length - 1; i >= 0; i--) {
    var textEl = currentDesign.textElements[i];
    if (isPointInTextElement(inchX, inchY, textEl)) {
      selectedElement = { type: 'text', index: i };
      isDragging = true;
      lastMouseDownHitElement = true;
      dragOffset.x = inchX - textEl.x;
      dragOffset.y = inchY - textEl.y;
      showTextControls(i);
      renderDesignCanvas();
      return;
    }
  }

  // Check image elements
  for (var j = currentDesign.imageElements.length - 1; j >= 0; j--) {
    var imgEl = currentDesign.imageElements[j];
    if (isPointInImageElement(inchX, inchY, imgEl)) {
      selectedElement = { type: 'image', index: j };
      isDragging = true;
      lastMouseDownHitElement = true;
      dragOffset.x = inchX - imgEl.x;
      dragOffset.y = inchY - imgEl.y;
      showImageControls(j);
      renderDesignCanvas();
      return;
    }
  }

  // Clicked on empty space — deselect
  selectedElement = null;
  isDragging = false;
  lastMouseDownHitElement = false;
  hideTextControls();
  hideImageControls();
  renderDesignCanvas();
}

/**
 * Handle mouse move: drag the selected element.
 */
function handleCanvasMouseMove(e) {
  const canvas = e.target;
  const rect = canvas.getBoundingClientRect();
  const cssToCanvas = canvas.width / rect.width;
  const mouseX = (e.clientX - rect.left) * cssToCanvas;
  const mouseY = (e.clientY - rect.top) * cssToCanvas;
  const scale = getCanvasScale();
  const cx = CONFIG.CANVAS_DISPLAY_DIAMETER / 2;
  const cy = CONFIG.CANVAS_DISPLAY_DIAMETER / 2;

  // Handle resize dragging
  if (isResizing && selectedElement && selectedElement.type === 'image') {
    const imgEl = currentDesign.imageElements[selectedElement.index];
    const dx = (mouseX - resizeStartPos.x) / scale;
    const dy = (mouseY - resizeStartPos.y) / scale;

    let newWidth = resizeStartDims.width;
    let newHeight = resizeStartDims.height;

    // Determine resize direction based on corner
    if (resizeCorner === 'br') {
      newWidth = resizeStartDims.width + dx;
      newHeight = resizeStartDims.height + dy;
    } else if (resizeCorner === 'bl') {
      newWidth = resizeStartDims.width - dx;
      newHeight = resizeStartDims.height + dy;
    } else if (resizeCorner === 'tr') {
      newWidth = resizeStartDims.width + dx;
      newHeight = resizeStartDims.height - dy;
    } else if (resizeCorner === 'tl') {
      newWidth = resizeStartDims.width - dx;
      newHeight = resizeStartDims.height - dy;
    }

    // Enforce minimum size
    newWidth = Math.max(0.1, newWidth);
    newHeight = Math.max(0.1, newHeight);

    // Lock aspect ratio if enabled
    if (imgEl.lockAspect) {
      const aspect = resizeStartDims.width / resizeStartDims.height;
      // Use the dominant axis
      if (Math.abs(dx) > Math.abs(dy)) {
        newHeight = newWidth / aspect;
      } else {
        newWidth = newHeight * aspect;
      }
    }

    imgEl.width = newWidth;
    imgEl.height = newHeight;

    renderDesignCanvas();
    return;
  }

  if (!isDragging || !selectedElement) return;

  const inchX = (mouseX - cx) / scale;
  const inchY = (mouseY - cy) / scale;

  if (selectedElement.type === 'text') {
    const textEl = currentDesign.textElements[selectedElement.index];
    textEl.x = inchX - dragOffset.x;
    textEl.y = inchY - dragOffset.y;
  } else if (selectedElement.type === 'image') {
    const imgEl = currentDesign.imageElements[selectedElement.index];
    imgEl.x = inchX - dragOffset.x;
    imgEl.y = inchY - dragOffset.y;
    constrainImagePosition(imgEl);
  }

  renderDesignCanvas();
}

/**
 * Handle mouse up: stop dragging.
 */
function handleCanvasMouseUp(e) {
  isDragging = false;
  isResizing = false;
  resizeCorner = null;
  resizeStartPos = null;
  resizeStartDims = null;
}

// ─── Background color update ──────────────────────────────────────

/**
 * Update the background to a solid color, clearing any template pattern.
 * @param {string} color - hex color string
 */
function setBackgroundColor(color) {
  currentDesign.backgroundColor = color;
  // When the user picks a custom color, we keep the template draw
  // function so patterns stay. If they want solid, they pick a solid template.
  // But if they use the color picker, override to solid:
  currentDesign.templateDraw = null;
  currentDesign.templateId = null;
  document.querySelectorAll('.template-card').forEach(function(card) {
    card.classList.remove('selected');
  });
  renderDesignCanvas();
  // Also refresh sheet thumbnails if in sheet mode
  if (typeof currentMode !== 'undefined' && currentMode === 'sheet' && typeof refreshSheetThumbnails === 'function') {
    refreshSheetThumbnails();
  }
}

/**
 * Update background swatch highlights to reflect the given color.
 */
function updateBackgroundSwatches(color) {
  document.querySelectorAll('#bg-color-swatches .color-swatch').forEach(swatch => {
    swatch.classList.toggle('active', swatch.dataset.color === color);
  });
}