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
 * - Deduplicating image asset data so the same upload is stored once and
 *   referenced by assetId from designs / slot overrides / save files
 */

// ─── Image cache and asset registry ───────────────────────────────

// data URL -> Image object cache for fast re-use at render time
var _imageCache = {};

// assetId -> { assetId, dataUrl, naturalWidth, naturalHeight }
var _imageAssets = {};

// data URL -> assetId reverse lookup so repeated uploads are deduped
var _imageAssetIdsByDataUrl = {};

var _nextImageAssetId = 1;

function generateImageAssetId() {
  var id = 'img_' + _nextImageAssetId;
  _nextImageAssetId += 1;
  return id;
}

function registerImageAsset(dataUrl, meta) {
  if (!dataUrl) return null;

  if (_imageAssetIdsByDataUrl[dataUrl]) {
    var existingId = _imageAssetIdsByDataUrl[dataUrl];
    var existing = _imageAssets[existingId];
    if (existing && meta) {
      if (!existing.naturalWidth && meta.naturalWidth) existing.naturalWidth = meta.naturalWidth;
      if (!existing.naturalHeight && meta.naturalHeight) existing.naturalHeight = meta.naturalHeight;
    }
    return existingId;
  }

  var assetId = generateImageAssetId();
  _imageAssets[assetId] = {
    assetId: assetId,
    dataUrl: dataUrl,
    naturalWidth: meta && meta.naturalWidth ? meta.naturalWidth : null,
    naturalHeight: meta && meta.naturalHeight ? meta.naturalHeight : null
  };
  _imageAssetIdsByDataUrl[dataUrl] = assetId;
  return assetId;
}

function getImageAsset(assetId) {
  return assetId ? _imageAssets[assetId] || null : null;
}

function getImageDataUrlByAssetId(assetId) {
  var asset = getImageAsset(assetId);
  return asset ? asset.dataUrl : null;
}

function getImageDataUrlForElement(imgEl) {
  if (!imgEl) return null;
  return imgEl.dataUrl || getImageDataUrlByAssetId(imgEl.assetId);
}

function ensureImageElementAsset(imgEl) {
  if (!imgEl) return null;
  if (imgEl.assetId && _imageAssets[imgEl.assetId]) {
    return imgEl.assetId;
  }

  if (imgEl.dataUrl) {
    var assetId = registerImageAsset(imgEl.dataUrl, {
      naturalWidth: imgEl.naturalWidth,
      naturalHeight: imgEl.naturalHeight
    });
    imgEl.assetId = assetId;
    delete imgEl.dataUrl;
    return assetId;
  }

  return imgEl.assetId || null;
}

function getOrCreateCachedImage(dataUrl) {
  if (!dataUrl) return null;
  if (_imageCache[dataUrl]) return _imageCache[dataUrl];

  var img = new Image();
  img.onload = function() {
    if (typeof refreshSheetThumbnails === 'function') {
      refreshSheetThumbnails();
    }
  };
  img.src = dataUrl;
  _imageCache[dataUrl] = img;
  return img;
}

function refreshImageElementGeometryForCurrentSize(element) {
  if (!element) return element;

  if (typeof element.x !== 'number') element.x = 0;
  if (typeof element.y !== 'number') element.y = 0;

  if (!element.imageScale) {
    element.imageScale = 1.0;
  }

  if (element.naturalWidth && element.naturalHeight) {
    var cover = computeCoverFillSize(element.naturalWidth, element.naturalHeight);
    element.baseWidth = cover.width;
    element.baseHeight = cover.height;
    element.width = element.baseWidth * element.imageScale;
    element.height = element.baseHeight * element.imageScale;
    constrainImagePosition(element);
  }

  return element;
}

function hydrateImageElement(imgData) {
  var element = Object.assign({}, imgData || {});

  if (!element.assetId && element.dataUrl) {
    element.assetId = registerImageAsset(element.dataUrl, {
      naturalWidth: element.naturalWidth,
      naturalHeight: element.naturalHeight
    });
  }

  // Always recompute geometry from the current button size.
  // This prevents stale dimensions from surviving size switches,
  // saved-file loads, copy/paste, and slot override hydration.
  refreshImageElementGeometryForCurrentSize(element);

  var dataUrl = getImageDataUrlForElement(element);
  if (dataUrl) {
    element.imgObj = getOrCreateCachedImage(dataUrl);
  }

  delete element.dataUrl;
  return element;
}

function serializeImageElement(imgEl) {
  var assetId = ensureImageElementAsset(imgEl);
  var serialized = {
    x: imgEl.x,
    y: imgEl.y,
    width: imgEl.width,
    height: imgEl.height,
    naturalWidth: imgEl.naturalWidth,
    naturalHeight: imgEl.naturalHeight,
    baseWidth: imgEl.baseWidth,
    baseHeight: imgEl.baseHeight,
    imageScale: imgEl.imageScale || 1.0
  };

  if (assetId) {
    serialized.assetId = assetId;
  } else if (imgEl.dataUrl) {
    // Backward compatibility fallback
    serialized.dataUrl = imgEl.dataUrl;
  }

  return serialized;
}

function normalizeSlotDataImageAssets(slots) {
  if (!Array.isArray(slots)) return slots;
  slots.forEach(function(slot) {
    if (!slot || !slot.overrides || slot.overrides.imageElements === undefined) return;
    slot.overrides.imageElements = (slot.overrides.imageElements || []).map(function(img) {
      return serializeImageElement(img);
    });
  });
  return slots;
}

function buildSerializedImageAssetBundle(masterDesign, slots) {
  var referencedIds = {};

  function collectFromImages(images) {
    (images || []).forEach(function(img) {
      var assetId = ensureImageElementAsset(img);
      if (assetId) referencedIds[assetId] = true;
    });
  }

  function collectFromDesign(design) {
    if (!design) return;
    collectFromImages(design.imageElements || []);
  }

  collectFromDesign(masterDesign);

  (slots || []).forEach(function(slot) {
    if (!slot || !slot.overrides || slot.overrides.imageElements === undefined) return;
    collectFromImages(slot.overrides.imageElements || []);
  });

  var bundle = {};
  Object.keys(referencedIds).forEach(function(assetId) {
    var asset = _imageAssets[assetId];
    if (!asset) return;
    bundle[assetId] = {
      dataUrl: asset.dataUrl,
      naturalWidth: asset.naturalWidth,
      naturalHeight: asset.naturalHeight
    };
  });

  return bundle;
}

function restoreSerializedImageAssets(bundle) {
  _imageAssets = {};
  _imageAssetIdsByDataUrl = {};
  _nextImageAssetId = 1;

  if (!bundle) return;

  function ingest(assetId, asset) {
    if (!asset || !asset.dataUrl) return;
    _imageAssets[assetId] = {
      assetId: assetId,
      dataUrl: asset.dataUrl,
      naturalWidth: asset.naturalWidth || null,
      naturalHeight: asset.naturalHeight || null
    };
    _imageAssetIdsByDataUrl[asset.dataUrl] = assetId;

    var numeric = parseInt(String(assetId).replace(/\D+/g, ''), 10);
    if (!isNaN(numeric) && numeric >= _nextImageAssetId) {
      _nextImageAssetId = numeric + 1;
    }
  }

  if (Array.isArray(bundle)) {
    bundle.forEach(function(asset) {
      if (!asset) return;
      var assetId = asset.assetId || generateImageAssetId();
      ingest(assetId, asset);
    });
  } else {
    Object.keys(bundle).forEach(function(assetId) {
      ingest(assetId, bundle[assetId]);
    });
  }
}

// ─── Image element data structure ─────────────────────────────────
// currentDesign.imageElements contains at most ONE element:
// {
//   assetId: "img_1",
//   imgObj: Image,
//   x: 0,
//   y: 0,
//   width: 1.35,
//   height: 1.35,
//   naturalWidth: 400,
//   naturalHeight: 300,
//   baseWidth: 1.35,
//   baseHeight: 1.35,
//   imageScale: 1.0
// }

function computeCoverFillSize(naturalWidth, naturalHeight) {
  var btnSize = getCurrentButtonSize();
  var d = btnSize.safeDiameter;
  var w;
  var h;
  if (naturalWidth <= naturalHeight) {
    w = d;
    h = d * (naturalHeight / naturalWidth);
  } else {
    h = d;
    w = d * (naturalWidth / naturalHeight);
  }
  return { width: w, height: h };
}

function buildImageElement(dataUrl, img) {
  _imageCache[dataUrl] = img;
  var assetId = registerImageAsset(dataUrl, {
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight
  });
  var cover = computeCoverFillSize(img.naturalWidth, img.naturalHeight);
  return {
    assetId: assetId,
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

function recalculateImageBaseDimensions() {
  if (!currentDesign || !currentDesign.imageElements || currentDesign.imageElements.length === 0) return;

  currentDesign.imageElements.forEach(function(imgEl) {
    refreshImageElementGeometryForCurrentSize(imgEl);
  });
}

function recalculateOverrideImageBaseDimensions() {
  if (typeof getSheetSlots !== 'function' || typeof setSheetSlots !== 'function') return;

  var slots = getSheetSlots();
  if (!slots || slots.length === 0) return;

  var changed = false;

  slots.forEach(function(slot) {
    if (!slot || !slot.overrides || !Array.isArray(slot.overrides.imageElements)) return;

    slot.overrides.imageElements = slot.overrides.imageElements.map(function(imgEl) {
      var updated = Object.assign({}, imgEl || {});
      refreshImageElementGeometryForCurrentSize(updated);
      changed = true;
      return updated;
    });
  });

  if (changed) {
    setSheetSlots(slots);
  }
}

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

function processLoadedImage(dataUrl, img) {
  var imageElement = buildImageElement(dataUrl, img);

  if (typeof currentMode !== 'undefined' && currentMode === 'sheet' && typeof selectedSlots !== 'undefined' && selectedSlots.length > 0) {
    var serialized = [serializeImageElement(imageElement)];
    applyOverrideToSelectedSlots('imageElements', serialized);
    return;
  }

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

  currentDesign.imageElements = [imageElement];
  selectedElement = { type: 'image', index: 0 };
  showImageControls(0);
  renderDesignCanvas();
}

function deleteSelectedImage() {
  currentDesign.imageElements = [];
  selectedElement = null;
  hideImageControls();
  renderDesignCanvas();
}

function showImageControls(index) {
  var imgEl = currentDesign.imageElements[index];
  if (!imgEl) return;

  // Only show image controls in Design Mode
  if (typeof currentMode !== 'undefined' && currentMode !== 'design') return;

  var controls = document.getElementById('image-controls');
  controls.classList.remove('hidden');

  var slider = document.getElementById('image-scale');
  if (slider) {
    slider.value = ((imgEl.imageScale || 1.0) * 100).toFixed(0);
    var display = document.getElementById('image-scale-display');
    if (display) display.textContent = slider.value + '%';
  }

  if (typeof hideTextControls === 'function') hideTextControls();
}

function hideImageControls() {
  document.getElementById('image-controls').classList.add('hidden');
}

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

function constrainImagePosition(imgEl) {
  var btnSize = getCurrentButtonSize();
  var r = btnSize.safeDiameter / 2;
  var hw = imgEl.width / 2;
  var hh = imgEl.height / 2;
  var maxX = hw - r;
  var minX = r - hw;
  var maxY = hh - r;
  var minY = r - hh;
  imgEl.x = Math.max(minX, Math.min(maxX, imgEl.x));
  imgEl.y = Math.max(minY, Math.min(maxY, imgEl.y));
}

// ─── Rendering ────────────────────────────────────────────────────

function renderImagePlaceholder(ctx, cx, cy, scale) {
  if (currentDesign.imageElements.length > 0) return;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.font = '14px Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Click to add image', cx, cy);
  ctx.restore();
}

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

function renderSingleImageElement(ctx, cx, cy, scale, imgEl) {
  if (!imgEl) return;

  if (!imgEl.imgObj) {
    imgEl = hydrateImageElement(imgEl);
  }

  if (!imgEl.imgObj || !imgEl.imgObj.complete) return;

  var px = cx + (imgEl.x - imgEl.width / 2) * scale;
  var py = cy + (imgEl.y - imgEl.height / 2) * scale;
  var pw = imgEl.width * scale;
  var ph = imgEl.height * scale;
  ctx.drawImage(imgEl.imgObj, px, py, pw, ph);
}

// ─── Hit testing ──────────────────────────────────────────────────

function isPointInImageElement(inchX, inchY, imgEl) {
  var left = imgEl.x - imgEl.width / 2;
  var right = imgEl.x + imgEl.width / 2;
  var top = imgEl.y - imgEl.height / 2;
  var bottom = imgEl.y + imgEl.height / 2;
  return inchX >= left && inchX <= right && inchY >= top && inchY <= bottom;
}

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

let isResizing = false;
let resizeCorner = null;
let resizeStartPos = null;
let resizeStartDims = null;

function getResizeHandle() {
  return null;
}

// ─── Event wiring ─────────────────────────────────────────────────

function initImageTool() {
  document.getElementById('image-upload').addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
      handleImageUpload(e.target.files[0]);
      e.target.value = '';
    }
  });

  document.getElementById('btn-delete-image').addEventListener('click', deleteSelectedImage);

  document.getElementById('image-scale').addEventListener('input', function(e) {
    var val = parseInt(e.target.value, 10);
    var display = document.getElementById('image-scale-display');
    if (display) display.textContent = val + '%';
    applyImageScale(val);
  });
}
