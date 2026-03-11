/**
 * image-tool.js
 *
 * Manages a single background image on the button design canvas.
 *
 * Responsibilities:
 * - Uploading images (PNG, JPG, SVG) and automatically downscaling large ones
 * - Single-image model: new upload replaces existing image
 * - Cover-fill: image always fills the safe zone (no white gaps)
 * - Scale slider for zooming in beyond cover-fill minimum
 * - Drag to reposition with constraints so safe zone stays covered
 * - In-canvas placeholder hint when no image is present
 * - Rendering image elements onto any canvas context
 *
 * Depends on:
 * - config.js (BUTTON_SIZES for coordinate bounds)
 * - canvas.js (currentDesign, renderDesignCanvas, selectedElement)
 *
 * Gotchas:
 * - Image positions (x, y) are in INCHES relative to button center.
 * Width and height are also in inches.
 * - Images are stored as data URLs (base64) so they survive localStorage
 * serialization. 
 * - The Image object (DOM) is stored as `imgObj` but is NOT serialized.
 * On load, it's reconstructed from the dataUrl.
 * - `imageScale` is a multiplier >= 1.0 over the cover-fill size.
 */

// ─── Image cache (data URL → Image object) ────────────────────────
// Avoids recreating Image objects for the same data URL repeatedly,
// e.g. when sheet mode thumbnails re-render per-slot image overrides.
var _imageCache = {};

/**
 * Get or create a cached Image object for a data URL.
 * Returns the Image immediately; it may still be loading.
 * @param {string} dataUrl
 * @returns {Image}
 */
function getOrCreateCachedImage(dataUrl) {
  if (_imageCache[dataUrl]) return _imageCache[dataUrl];
  var img = new Image();
  img.onload = function() {
    // Trigger a re-render once loaded so thumbnails update
    if (typeof refreshSheetThumbnails === 'function') {
      refreshSheetThumbnails();
    }
  };
  img.src = dataUrl;
  _imageCache[dataUrl] = img;
  return img;
}

// ─── Image element data structure ──────────────────────────────────
// currentDesign.imageElements contains at most ONE element:
// {
//   dataUrl: "data:image/png;base64,...",
//   imgObj: Image,
//   x: 0,              // inches from center
//   y: 0,              // inches from center
//   width: 1.35,       // inches (at current scale)
//   height: 1.35,      // inches (at current scale)
//   naturalWidth: 400,  // original pixel width
//   naturalHeight: 300, // original pixel height
//   baseWidth: 1.35,   // cover-fill width (scale=1)
//   baseHeight: 1.35,  // cover-fill height (scale=1)
//   imageScale: 1.0    // current scale multiplier (>= 1.0)
// }

/**
 * Compute cover-fill dimensions for an image so it fills the safe zone.
 * The smaller dimension matches the safe zone diameter; the larger extends beyond.
 */
function computeCoverFillSize(naturalWidth, naturalHeight) {
  var btnSize = getCurrentButtonSize();
  var d = btnSize.safeDiameter;
  var w, h;
  if (naturalWidth <= naturalHeight) {
    w = d;
    h = d * (naturalHeight / naturalWidth);
  } else {
    h = d;
    w = d * (naturalWidth / naturalHeight);
  }
  return { width: w, height: h };
}

/**
 * Build an image element object from a loaded Image.
 * @param {string} dataUrl - base64 data URL
 * @param {Image} img - loaded DOM Image object
 * @returns {Object} image element with cover-fill sizing
 */
function buildImageElement(dataUrl, img) {
  // Cache the Image object so overrides can reuse it
  _imageCache[dataUrl] = img;
  var cover = computeCoverFillSize(img.naturalWidth, img.naturalHeight);
  return {
    dataUrl: dataUrl,
    imgObj: img,
    x: 0,
    y: 0,
    width: cover.width,
    height: cover.height,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    baseWidth: cover.width,
    baseHeight: cover.height,
    imageScale: 1.0
  };
}

/**
 * Recalculate base dimensions for existing images when the button size changes.
 * Ensures the image perfectly fills the new safe zone.
 */
function recalculateImageBaseDimensions() {
  if (!currentDesign || !currentDesign.imageElements || currentDesign.imageElements.length === 0) return;

  currentDesign.imageElements.forEach(function(imgEl) {
    var cover = computeCoverFillSize(imgEl.naturalWidth, imgEl.naturalHeight);
    imgEl.baseWidth = cover.width;
    imgEl.baseHeight = cover.height;
    
    // Reapply the user's zoom scale
    imgEl.width = imgEl.baseWidth * (imgEl.imageScale || 1.0);
    imgEl.height = imgEl.baseHeight * (imgEl.imageScale || 1.0);
    
    // Ensure it still covers the new safe zone without slipping out of bounds
    constrainImagePosition(imgEl);
  });
}

/**
 * Handle image file upload. Reads the file, creates an Image object,
 * applies downscaling if necessary, and replaces any existing image.
 *
 * @param {File} file - The uploaded file
 */
function handleImageUpload(file) {
  if (!file) return;

  var reader = new FileReader();
  reader.onload = function(e) {
    var rawDataUrl = e.target.result;
    var img = new Image();
    
    img.onload = function() {
      var MAX_SIZE = 1200;
      var finalDataUrl = rawDataUrl;
      var w = img.naturalWidth;
      var h = img.naturalHeight;

      // Downscale if the image is exceptionally large
      if (w > MAX_SIZE || h > MAX_SIZE) {
        var scale = Math.min(MAX_SIZE / w, MAX_SIZE / h);
        var newW = Math.round(w * scale);
        var newH = Math.round(h * scale);

        var canvas = document.createElement('canvas');
        canvas.width = newW;
        canvas.height = newH;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, newW, newH);
        
        var mimeType = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
        var quality = mimeType === 'image/jpeg' ? 0.9 : undefined;
        finalDataUrl = canvas.toDataURL(mimeType, quality);
        
        // We need a new Image object for the downscaled version so natural properties match
        var downscaledImg = new Image();
        downscaledImg.onload = function() {
          processLoadedImage(finalDataUrl, downscaledImg);
        };
        downscaledImg.src = finalDataUrl;
      } else {
        processLoadedImage(finalDataUrl, img);
      }
    };
    img.src = rawDataUrl;
  };
  reader.readAsDataURL(file);
}

/**
 * Core application logic for an image once it has been loaded and potentially downscaled.
 */
function processLoadedImage(dataUrl, img) {
  var imageElement = buildImageElement(dataUrl, img);

  // Sheet mode with selected slots → apply as per-slot override
  if (typeof currentMode !== 'undefined' && currentMode === 'sheet' &&
      typeof selectedSlots !== 'undefined' && selectedSlots.length > 0) {
    // Serialize for override storage (no imgObj)
    var serialized = [{
      dataUrl: imageElement.dataUrl,
      x: imageElement.x,
      y: imageElement.y,
      width: imageElement.width,
      height: imageElement.height,
      naturalWidth: imageElement.naturalWidth,
      naturalHeight: imageElement.naturalHeight,
      baseWidth: imageElement.baseWidth,
      baseHeight: imageElement.baseHeight,
      imageScale: imageElement.imageScale
    }];
    applyOverrideToSelectedSlots('imageElements', serialized);
    return;
  }

  // Sheet mode with NO selected slots → apply to master (all buttons)
  if (typeof currentMode !== 'undefined' && currentMode === 'sheet') {
    currentDesign.imageElements = [imageElement];
    if (typeof refreshSheetThumbnails === 'function') {
      refreshSheetThumbnails();
    }
    if (typeof showNotification === 'function') {
      showNotification('Image applied to all buttons.', 'success');
    }
    return;
  }

  // Design mode → replace master image
  currentDesign.imageElements = [imageElement];
  selectedElement = { type: 'image', index: 0 };
  showImageControls(0);
  renderDesignCanvas();
}

/**
 * Delete the current image.
 */
function deleteSelectedImage() {
  currentDesign.imageElements = [];
  selectedElement = null;
  hideImageControls();
  renderDesignCanvas();
}

/**
 * Show image controls for the selected image.
 * @param {number} index - index in currentDesign.imageElements
 */
function showImageControls(index) {
  var imgEl = currentDesign.imageElements[index];
  if (!imgEl) return;

  var controls = document.getElementById('image-controls');
  controls.classList.remove('hidden');

  // Update scale slider
  var slider = document.getElementById('image-scale');
  if (slider) {
    slider.value = ((imgEl.imageScale || 1.0) * 100).toFixed(0);
    var display = document.getElementById('image-scale-display');
    if (display) display.textContent = slider.value + '%';
  }

  // Hide text controls if visible
  if (typeof hideTextControls === 'function') hideTextControls();
}

/**
 * Hide image controls panel.
 */
function hideImageControls() {
  document.getElementById('image-controls').classList.add('hidden');
}

/**
 * Apply the scale slider value to the current image.
 * Recalculates dimensions and constrains position.
 */
function applyImageScale(scalePercent) {
  if (currentDesign.imageElements.length === 0) return;
  var imgEl = currentDesign.imageElements[0];
  var s = Math.max(1.0, scalePercent / 100);
  imgEl.imageScale = s;
  imgEl.width = imgEl.baseWidth * s;
  imgEl.height = imgEl.baseHeight * s;
  constrainImagePosition(imgEl);
  renderDesignCanvas();
}

/**
 * Constrain image position so the safe zone circle is always fully covered.
 * The image rectangle must contain the entire safe zone circle.
 */
function constrainImagePosition(imgEl) {
  var btnSize = getCurrentButtonSize();
  var r = btnSize.safeDiameter / 2; // safe zone radius

  // Image half-sizes
  var hw = imgEl.width / 2;
  var hh = imgEl.height / 2;

  // The image left edge must be at most -r from center:
  //   imgEl.x - hw <= -r  =>  imgEl.x <= hw - r
  // The image right edge must be at least +r from center:
  //   imgEl.x + hw >= r   =>  imgEl.x >= r - hw
  var maxX = hw - r;
  var minX = r - hw;
  var maxY = hh - r;
  var minY = r - hh;

  imgEl.x = Math.max(minX, Math.min(maxX, imgEl.x));
  imgEl.y = Math.max(minY, Math.min(maxY, imgEl.y));
}

// ─── Rendering ─────────────────────────────────────────────────────

/**
 * Draw the "Click to add image" placeholder hint on the canvas.
 */
function renderImagePlaceholder(ctx, cx, cy, scale) {
  if (currentDesign.imageElements.length > 0) return;

  ctx.save();
  // Hint text only — no extra circle
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.font = '14px Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Click to add image', cx, cy);
  ctx.restore();
}

/**
 * Render all image elements onto the editing canvas.
 * Images are clipped to the safe zone circle.
 */
function renderImageElements(ctx, cx, cy, scale) {
  renderImagePlaceholder(ctx, cx, cy, scale);
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
  var left = imgEl.x - imgEl.width / 2;
  var right = imgEl.x + imgEl.width / 2;
  var top = imgEl.y - imgEl.height / 2;
  var bottom = imgEl.y + imgEl.height / 2;

  return inchX >= left && inchX <= right && inchY >= top && inchY <= bottom;
}

/**
 * Draw selection box around an image element.
 */
function drawImageSelectionBox(ctx, imgEl, cx, cy, scale) {
  var px = cx + (imgEl.x - imgEl.width / 2) * scale;
  var py = cy + (imgEl.y - imgEl.height / 2) * scale;
  var pw = imgEl.width * scale;
  var ph = imgEl.height * scale;

  ctx.strokeStyle = '#4A90D9';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(px, py, pw, ph);
  ctx.setLineDash([]);
}

// ─── Event wiring ──────────────────────────────────────────────────

/**
 * Initialize image tool event listeners.
 * Called once from app.js.
 */
function initImageTool() {
  document.getElementById('image-upload').addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
      handleImageUpload(e.target.files[0]);
      e.target.value = ''; // reset so same file can be uploaded again
    }
  });

  document.getElementById('btn-delete-image').addEventListener('click', deleteSelectedImage);

  // Scale slider
  document.getElementById('image-scale').addEventListener('input', function(e) {
    var val = parseInt(e.target.value, 10);
    var display = document.getElementById('image-scale-display');
    if (display) display.textContent = val + '%';
    applyImageScale(val);
  });
}