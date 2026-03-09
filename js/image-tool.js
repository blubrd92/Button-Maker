/**
 * image-tool.js
 *
 * Manages image elements on the button design canvas.
 *
 * Responsibilities:
 * - Uploading images (PNG, JPG, SVG)
 * - Positioning and resizing images with drag handles
 * - Layer ordering (bring to front, send to back)
 * - Hit-testing for image element selection
 * - Rendering image elements onto any canvas context
 *
 * Depends on:
 * - config.js (BUTTON_SIZES for coordinate bounds)
 * - canvas.js (currentDesign, renderDesignCanvas, selectedElement)
 *
 * Gotchas:
 * - Image positions (x, y) are in INCHES relative to button center.
 *   Width and height are also in inches.
 * - Images are stored as data URLs (base64) so they survive localStorage
 *   serialization. This means large images will increase save data size.
 * - The Image object (DOM) is stored as `imgObj` but is NOT serialized.
 *   On load, it's reconstructed from the dataUrl.
 */

// ─── Image element data structure ──────────────────────────────────
// Each image element in currentDesign.imageElements looks like:
// {
//   dataUrl: "data:image/png;base64,...",   // base64 encoded image data
//   imgObj: Image,                           // DOM Image object (not serialized)
//   x: 0,                                   // inches from center (center of image)
//   y: 0,                                   // inches from center (center of image)
//   width: 1.35,                            // inches (defaults to safe zone diameter)
//   height: 1.35,                           // inches
//   naturalWidth: 400,                      // original pixel width
//   naturalHeight: 300,                     // original pixel height
//   lockAspect: true                        // maintain aspect ratio when resizing
// }

/**
 * Handle image file upload. Reads the file, creates an Image object,
 * and adds it to the design.
 * @param {File} file - The uploaded file
 */
function handleImageUpload(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const dataUrl = e.target.result;
    const img = new Image();
    img.onload = function() {
      // Default size: fit within the safe zone circle (1.35" for 1.5" buttons).
      // For a square image, both dimensions equal the safe zone diameter and
      // the circular clip handles the corners. For non-square images, the
      // largest dimension matches the diameter so nothing extends beyond.
      const btnSize = getCurrentButtonSize();
      const fitSize = btnSize.safeDiameter;
      let width, height;
      if (img.naturalWidth >= img.naturalHeight) {
        width = fitSize;
        height = fitSize * (img.naturalHeight / img.naturalWidth);
      } else {
        height = fitSize;
        width = fitSize * (img.naturalWidth / img.naturalHeight);
      }

      const imageElement = {
        dataUrl: dataUrl,
        imgObj: img,
        x: 0,
        y: 0,
        width: width,
        height: height,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        lockAspect: true
      };

      currentDesign.imageElements.push(imageElement);
      const index = currentDesign.imageElements.length - 1;
      selectedElement = { type: 'image', index };
      showImageControls(index);
      renderDesignCanvas();
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
}

/**
 * Delete the currently selected image element.
 */
function deleteSelectedImage() {
  if (!selectedElement || selectedElement.type !== 'image') return;

  currentDesign.imageElements.splice(selectedElement.index, 1);
  selectedElement = null;
  hideImageControls();
  renderDesignCanvas();
}

/**
 * Bring the selected image to the front (top of z-order).
 */
function bringImageToFront() {
  if (!selectedElement || selectedElement.type !== 'image') return;

  const index = selectedElement.index;
  const imageElements = currentDesign.imageElements;
  if (index >= imageElements.length - 1) return; // already on top

  const [element] = imageElements.splice(index, 1);
  imageElements.push(element);
  selectedElement.index = imageElements.length - 1;
  renderDesignCanvas();
}

/**
 * Send the selected image to the back (bottom of z-order).
 */
function sendImageToBack() {
  if (!selectedElement || selectedElement.type !== 'image') return;

  const index = selectedElement.index;
  const imageElements = currentDesign.imageElements;
  if (index === 0) return; // already at back

  const [element] = imageElements.splice(index, 1);
  imageElements.unshift(element);
  selectedElement.index = 0;
  renderDesignCanvas();
}

/**
 * Show image controls for the selected image.
 * @param {number} index - index in currentDesign.imageElements
 */
function showImageControls(index) {
  const imgEl = currentDesign.imageElements[index];
  if (!imgEl) return;

  const controls = document.getElementById('image-controls');
  controls.classList.remove('hidden');

  document.getElementById('lock-aspect').checked = imgEl.lockAspect;

  // Hide text controls if visible
  hideTextControls();
}

/**
 * Hide image controls panel.
 */
function hideImageControls() {
  document.getElementById('image-controls').classList.add('hidden');
}

// ─── Rendering ─────────────────────────────────────────────────────

/**
 * Render all image elements onto the editing canvas.
 * Images are clipped to the safe zone circle.
 */
function renderImageElements(ctx, cx, cy, scale) {
  if (currentDesign.imageElements.length === 0) return;
  var btnSize = getCurrentButtonSize();
  var safeRadius = (btnSize.safeDiameter / 2) * scale;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, safeRadius, 0, Math.PI * 2);
  ctx.clip();
  currentDesign.imageElements.forEach(function(imgEl) {
    renderSingleImageElement(ctx, cx, cy, scale, imgEl);
  });
  ctx.restore();
}

/**
 * Render image elements from a design object (for PDF/sheet mode).
 * Images are clipped to the safe zone circle.
 */
function renderImageElementsWithDesign(ctx, cx, cy, scale, design) {
  var imgs = design.imageElements || [];
  if (imgs.length === 0) return;
  var btnSize = getCurrentButtonSize();
  var safeRadius = (btnSize.safeDiameter / 2) * scale;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, safeRadius, 0, Math.PI * 2);
  ctx.clip();
  imgs.forEach(function(imgEl) {
    renderSingleImageElement(ctx, cx, cy, scale, imgEl);
  });
  ctx.restore();
}

/**
 * Render a single image element (no clipping — caller handles that).
 */
function renderSingleImageElement(ctx, cx, cy, scale, imgEl) {
  if (!imgEl.imgObj || !imgEl.imgObj.complete) return;

  var px = cx + (imgEl.x - imgEl.width / 2) * scale;
  var py = cy + (imgEl.y - imgEl.height / 2) * scale;
  var pw = imgEl.width * scale;
  var ph = imgEl.height * scale;

  ctx.drawImage(imgEl.imgObj, px, py, pw, ph);
}

// ─── Hit testing ───────────────────────────────────────────────────

/**
 * Check if a point (in inches, relative to center) is inside an image element.
 */
function isPointInImageElement(inchX, inchY, imgEl) {
  const left = imgEl.x - imgEl.width / 2;
  const right = imgEl.x + imgEl.width / 2;
  const top = imgEl.y - imgEl.height / 2;
  const bottom = imgEl.y + imgEl.height / 2;

  return inchX >= left && inchX <= right && inchY >= top && inchY <= bottom;
}

/**
 * Draw selection box around an image element.
 */
function drawImageSelectionBox(ctx, imgEl, cx, cy, scale) {
  const px = cx + (imgEl.x - imgEl.width / 2) * scale;
  const py = cy + (imgEl.y - imgEl.height / 2) * scale;
  const pw = imgEl.width * scale;
  const ph = imgEl.height * scale;

  ctx.strokeStyle = '#4A90D9';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(px, py, pw, ph);
  ctx.setLineDash([]);

  // Draw resize handles at corners
  const handleSize = 8;
  ctx.fillStyle = '#4A90D9';
  const corners = [
    [px, py], [px + pw, py],
    [px, py + ph], [px + pw, py + ph]
  ];
  corners.forEach(([hx, hy]) => {
    ctx.fillRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
  });
}

// ─── Image resize via drag handles ─────────────────────────────────

let isResizing = false;
let resizeCorner = null;       // which corner is being dragged
let resizeStartPos = null;     // starting mouse position
let resizeStartDims = null;    // starting element dimensions

/**
 * Check if mouse is near a resize handle of the selected image.
 * Returns the corner name or null.
 */
function getResizeHandle(mouseX, mouseY, imgEl, cx, cy, scale) {
  const px = cx + (imgEl.x - imgEl.width / 2) * scale;
  const py = cy + (imgEl.y - imgEl.height / 2) * scale;
  const pw = imgEl.width * scale;
  const ph = imgEl.height * scale;

  const handleSize = 12; // slightly larger hit area
  const corners = {
    'tl': [px, py],
    'tr': [px + pw, py],
    'bl': [px, py + ph],
    'br': [px + pw, py + ph]
  };

  for (const [name, [hx, hy]] of Object.entries(corners)) {
    if (Math.abs(mouseX - hx) < handleSize && Math.abs(mouseY - hy) < handleSize) {
      return name;
    }
  }
  return null;
}

// ─── Event wiring ──────────────────────────────────────────────────

/**
 * Initialize image tool event listeners.
 * Called once from app.js.
 */
function initImageTool() {
  document.getElementById('image-upload').addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleImageUpload(e.target.files[0]);
      e.target.value = ''; // reset so same file can be uploaded again
    }
  });

  document.getElementById('btn-delete-image').addEventListener('click', deleteSelectedImage);
  document.getElementById('btn-bring-front').addEventListener('click', bringImageToFront);
  document.getElementById('btn-send-back').addEventListener('click', sendImageToBack);

  document.getElementById('lock-aspect').addEventListener('change', (e) => {
    if (selectedElement && selectedElement.type === 'image') {
      currentDesign.imageElements[selectedElement.index].lockAspect = e.target.checked;
    }
  });
}
