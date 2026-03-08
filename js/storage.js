/**
 * storage.js
 *
 * Manages saving and loading button designs to/from localStorage.
 *
 * Responsibilities:
 * - Serializing design state (master + per-button overrides) to JSON
 * - Saving designs with user-provided names
 * - Loading saved designs and restoring all state
 * - Listing and deleting saved designs
 * - Rendering the saved designs list in the left sidebar
 *
 * Depends on:
 * - config.js (for default values)
 * - canvas.js (currentDesign, renderDesignCanvas)
 * - templates.js (getTemplateById to restore template draw functions)
 * - image-tool.js (reconstructing Image objects from dataUrls)
 *
 * Gotchas:
 * - Image objects (DOM Image elements) cannot be serialized to JSON.
 *   We store the dataUrl and reconstruct the Image on load.
 * - Template draw functions cannot be serialized. We store the templateId
 *   and look up the function on load.
 * - localStorage has a ~5MB limit in most browsers. Large images (stored
 *   as base64 data URLs) can hit this. No graceful handling yet.
 */

const STORAGE_KEY = 'buttonmaker_designs';

// ─── Save/Load data structure ──────────────────────────────────────
// Stored in localStorage as JSON under STORAGE_KEY:
// {
//   designs: [
//     {
//       name: "My Design",
//       savedAt: "2024-01-15T10:30:00Z",
//       buttonSize: "1.5",
//       layout: "15",
//       master: {
//         templateId: "blank",
//         backgroundColor: "#FFFFFF",
//         textElements: [ ... ],
//         imageElements: [ ... ],   // dataUrl only, no imgObj
//         libraryInfoText: "",
//         libraryInfoColor: "#666666"
//       },
//       slots: [
//         { slotIndex: 0, row: 0, col: 0, overrides: {} },
//         ...
//       ]
//     }
//   ]
// }

/**
 * Get all saved designs from localStorage.
 * @returns {Array} Array of saved design objects
 */
function getSavedDesigns() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return (data && data.designs) ? data.designs : [];
  } catch (e) {
    console.warn('Failed to parse saved designs:', e);
    return [];
  }
}

/**
 * Save all designs to localStorage.
 * @param {Array} designs - Array of design objects
 */
function saveDesignsToStorage(designs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ designs }));
}

/**
 * Save the current design with a given name.
 * @param {string} name - User-provided name for the design
 */
function saveCurrentDesign(name) {
  if (!name || !name.trim()) {
    alert('Please enter a name for your design.');
    return;
  }

  const designs = getSavedDesigns();

  // Serialize the master design (strip non-serializable properties)
  const masterData = serializeDesign(currentDesign);

  // Serialize slot overrides from sheet mode
  const slotsData = (typeof getSheetSlots === 'function') ? getSheetSlots() : [];

  const savedDesign = {
    name: name.trim(),
    savedAt: new Date().toISOString(),
    buttonSize: CONFIG.currentButtonSize,
    layout: CONFIG.currentLayout,
    master: masterData,
    slots: slotsData
  };

  designs.push(savedDesign);
  saveDesignsToStorage(designs);
  renderSavedDesignsList();

  // Clear the name input
  document.getElementById('save-name-input').value = '';
}

/**
 * Load a saved design by index.
 * @param {number} index - Index in the saved designs array
 */
function loadSavedDesign(index) {
  const designs = getSavedDesigns();
  if (index < 0 || index >= designs.length) return;

  const saved = designs[index];

  // Restore config settings
  CONFIG.currentButtonSize = saved.buttonSize || "1.5";
  CONFIG.currentLayout = saved.layout || "15";

  // Restore master design
  deserializeDesign(saved.master);

  // Restore sheet slots if sheet mode is available
  if (typeof setSheetSlots === 'function' && saved.slots) {
    setSheetSlots(saved.slots);
  }

  renderDesignCanvas();
  renderSavedDesignsList();
}

/**
 * Delete a saved design by index.
 * @param {number} index - Index in the saved designs array
 */
function deleteSavedDesign(index) {
  const designs = getSavedDesigns();
  if (index < 0 || index >= designs.length) return;

  if (!confirm(`Delete "${designs[index].name}"?`)) return;

  designs.splice(index, 1);
  saveDesignsToStorage(designs);
  renderSavedDesignsList();
}

/**
 * Serialize a design object for storage (strips non-serializable data).
 * @param {Object} design - The design to serialize
 * @returns {Object} Serializable design data
 */
function serializeDesign(design) {
  return {
    templateId: design.templateId,
    backgroundColor: design.backgroundColor,
    textElements: design.textElements.map(t => ({
      text: t.text,
      fontFamily: t.fontFamily,
      fontSize: t.fontSize,
      color: t.color,
      bold: t.bold,
      italic: t.italic,
      align: t.align,
      x: t.x,
      y: t.y,
      curved: t.curved,
      curveRadius: t.curveRadius
    })),
    imageElements: design.imageElements.map(img => ({
      dataUrl: img.dataUrl,
      x: img.x,
      y: img.y,
      width: img.width,
      height: img.height,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      lockAspect: img.lockAspect
    })),
    libraryInfoText: design.libraryInfoText,
    libraryInfoColor: design.libraryInfoColor
  };
}

/**
 * Deserialize saved design data into the currentDesign object.
 * Reconstructs Image objects and template draw functions.
 * @param {Object} data - Saved design data
 */
function deserializeDesign(data) {
  currentDesign.templateId = data.templateId;
  currentDesign.backgroundColor = data.backgroundColor;

  // Restore template draw function
  if (data.templateId) {
    const template = getTemplateById(data.templateId);
    currentDesign.templateDraw = template ? template.draw : null;
  } else {
    currentDesign.templateDraw = null;
  }

  // Restore text elements
  currentDesign.textElements = data.textElements || [];

  // Restore image elements (reconstruct Image objects)
  currentDesign.imageElements = [];
  (data.imageElements || []).forEach(imgData => {
    const img = new Image();
    const element = {
      ...imgData,
      imgObj: img
    };
    img.onload = function() {
      renderDesignCanvas(); // re-render once image loads
    };
    img.src = imgData.dataUrl;
    currentDesign.imageElements.push(element);
  });

  // Restore library info
  currentDesign.libraryInfoText = data.libraryInfoText || '';
  currentDesign.libraryInfoColor = data.libraryInfoColor || CONFIG.DEFAULTS.libraryInfoColor;

  // Update UI controls
  document.getElementById('bg-color-picker').value = currentDesign.backgroundColor;
  document.getElementById('library-info-input').value = currentDesign.libraryInfoText;
  document.getElementById('library-info-color').value = currentDesign.libraryInfoColor;
  updateBackgroundSwatches(currentDesign.backgroundColor);

  // Update template selection
  document.querySelectorAll('.template-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.templateId === currentDesign.templateId);
  });

  // Deselect any element
  selectedElement = null;
  hideTextControls();
  hideImageControls();
}

/**
 * Render the saved designs list in the left sidebar.
 */
function renderSavedDesignsList() {
  const container = document.getElementById('saved-list');
  const designs = getSavedDesigns();

  container.innerHTML = '';

  if (designs.length === 0) {
    container.innerHTML = '<div style="color:#aaa; font-size:12px; padding:8px;">No saved designs</div>';
    return;
  }

  designs.forEach((design, index) => {
    const item = document.createElement('div');
    item.className = 'saved-item';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'saved-name';
    nameSpan.textContent = design.name;
    nameSpan.title = `Saved: ${new Date(design.savedAt).toLocaleString()}`;

    const deleteBtn = document.createElement('span');
    deleteBtn.className = 'saved-delete';
    deleteBtn.textContent = '\u00D7'; // × symbol
    deleteBtn.title = 'Delete';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSavedDesign(index);
    });

    item.appendChild(nameSpan);
    item.appendChild(deleteBtn);

    item.addEventListener('click', () => loadSavedDesign(index));

    container.appendChild(item);
  });
}

/**
 * Initialize storage: render saved designs list and wire save button.
 * Called once from app.js.
 */
function initStorage() {
  document.getElementById('btn-save').addEventListener('click', () => {
    const name = document.getElementById('save-name-input').value;
    saveCurrentDesign(name);
  });

  // Allow Enter key to save
  document.getElementById('save-name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const name = e.target.value;
      saveCurrentDesign(name);
    }
  });

  renderSavedDesignsList();
}
