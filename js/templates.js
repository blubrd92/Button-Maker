/**
 * templates.js
 *
 * Defines and manages the template system for button designs.
 *
 * Responsibilities:
 * - Stores template definitions as data objects (not procedural code)
 * - Renders template thumbnails in the left sidebar
 * - Applies a selected template to the current design
 *
 * Depends on:
 * - config.js (COLOR_PALETTE, BUTTON_SIZES, CANVAS_DISPLAY_DIAMETER)
 *
 * Gotchas:
 * - Templates define *initial* state. Once applied, the user can freely
 *   modify everything. The template ID is stored with the design for
 *   reference, but doesn't constrain future edits.
 * - Pattern templates use canvas drawing functions, not image files.
 * - To add a new template: add an entry to TEMPLATES array below,
 *   implementing its `draw` function. The thumbnail is auto-generated.
 */

// ─── Template definitions ──────────────────────────────────────────
// Each template is a data object:
//   id:          unique string key
//   label:       display name in the UI
//   category:    "solid" | "pattern" | "gradient"
//   draw(ctx, cx, cy, radius):
//       Draws the background onto a canvas context. The context is
//       already clipped to the cut circle. cx/cy is the center,
//       radius is the cut circle radius in canvas pixels.
//   backgroundColor:  hex fallback (used as the design's bg color after applying)

const TEMPLATES = [
  // ─── Blank ───
  {
    id: "blank",
    label: "Blank",
    category: "solid",
    backgroundColor: "#FFFFFF",
    draw(ctx, cx, cy, radius) {
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  // ─── Solid colors ───
  ...generateSolidTemplates(),

  // ─── Patterns ───
  {
    id: "pattern-polka-dots",
    label: "Polka Dots",
    category: "pattern",
    backgroundColor: "#4A90D9",
    draw(ctx, cx, cy, radius) {
      // Blue background with white dots
      ctx.fillStyle = "#4A90D9";
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.4)";
      const dotRadius = radius * 0.04;
      const spacing = radius * 0.18;
      for (let x = cx - radius; x <= cx + radius; x += spacing) {
        for (let y = cy - radius; y <= cy + radius; y += spacing) {
          const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
          if (dist + dotRadius < radius) {
            ctx.beginPath();
            ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
  },
  {
    id: "pattern-stripes",
    label: "Stripes",
    category: "pattern",
    backgroundColor: "#E74C3C",
    draw(ctx, cx, cy, radius) {
      // Red and white stripes
      ctx.fillStyle = "#E74C3C";
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.3)";
      const stripeWidth = radius * 0.12;
      const gap = radius * 0.12;
      for (let x = cx - radius; x <= cx + radius; x += stripeWidth + gap) {
        ctx.fillRect(x, cy - radius, stripeWidth, radius * 2);
      }
    }
  },
  {
    id: "pattern-concentric",
    label: "Rings",
    category: "pattern",
    backgroundColor: "#1ABC9C",
    draw(ctx, cx, cy, radius) {
      // Teal with concentric rings
      ctx.fillStyle = "#1ABC9C";
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 2;
      for (let r = radius * 0.15; r < radius; r += radius * 0.12) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  },
  {
    id: "pattern-starburst",
    label: "Starburst",
    category: "pattern",
    backgroundColor: "#F39C12",
    draw(ctx, cx, cy, radius) {
      // Amber starburst
      ctx.fillStyle = "#F39C12";
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.2)";
      const rays = 16;
      for (let i = 0; i < rays; i++) {
        const angle = (i / rays) * Math.PI * 2;
        const nextAngle = ((i + 0.5) / rays) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
        ctx.lineTo(cx + Math.cos(nextAngle) * radius, cy + Math.sin(nextAngle) * radius);
        ctx.closePath();
        ctx.fill();
      }
    }
  },

  // ─── Gradients ───
  {
    id: "gradient-sunset",
    label: "Sunset",
    category: "gradient",
    backgroundColor: "#E74C3C",
    draw(ctx, cx, cy, radius) {
      const grad = ctx.createLinearGradient(cx, cy - radius, cx, cy + radius);
      grad.addColorStop(0, "#E74C3C");
      grad.addColorStop(1, "#F39C12");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  {
    id: "gradient-ocean",
    label: "Ocean",
    category: "gradient",
    backgroundColor: "#4A90D9",
    draw(ctx, cx, cy, radius) {
      const grad = ctx.createLinearGradient(cx, cy - radius, cx, cy + radius);
      grad.addColorStop(0, "#4A90D9");
      grad.addColorStop(1, "#1ABC9C");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  {
    id: "gradient-berry",
    label: "Berry",
    category: "gradient",
    backgroundColor: "#9B59B6",
    draw(ctx, cx, cy, radius) {
      const grad = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
      grad.addColorStop(0, "#9B59B6");
      grad.addColorStop(1, "#E91E63");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
];

/**
 * Helper: generate solid-color templates from the color palette.
 * Skips white (already covered by "Blank").
 */
function generateSolidTemplates() {
  return CONFIG.COLOR_PALETTE.slice(1).map(color => ({
    id: `solid-${color.replace('#', '')}`,
    label: colorName(color),
    category: "solid",
    backgroundColor: color,
    draw(ctx, cx, cy, radius) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }));
}

/**
 * Simple color-to-name lookup for display purposes.
 */
function colorName(hex) {
  const names = {
    "#1A202C": "Black",
    "#2B6CB0": "Blue",
    "#C53030": "Red",
    "#2F855A": "Green",
    "#D69E2E": "Amber",
    "#6B46C1": "Purple",
    "#D53F8C": "Pink",
    "#2C7A7B": "Teal",
    "#718096": "Slate"
  };
  return names[hex.toUpperCase()] || hex;
}

// ─── Template manager functions ────────────────────────────────────

/**
 * Render template thumbnails into the template picker grid.
 * Each thumbnail is a small canvas showing the template's background.
 */
function renderTemplatePicker() {
  const container = document.getElementById('template-list');
  container.innerHTML = '';

  TEMPLATES.forEach(template => {
    const card = document.createElement('div');
    card.className = 'template-card';
    card.dataset.templateId = template.id;

    // Create thumbnail canvas
    const thumbSize = 100;
    const canvas = document.createElement('canvas');
    canvas.width = thumbSize;
    canvas.height = thumbSize;
    const ctx = canvas.getContext('2d');
    const cx = thumbSize / 2;
    const cy = thumbSize / 2;
    const radius = thumbSize / 2 - 2;

    // Clip to circle and draw
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    template.draw(ctx, cx, cy, radius);
    ctx.restore();

    // Label
    const label = document.createElement('div');
    label.className = 'template-label';
    label.textContent = template.label;

    card.appendChild(canvas);
    card.appendChild(label);

    // Click handler — apply template
    card.addEventListener('click', () => applyTemplate(template.id));

    container.appendChild(card);
  });
}

/**
 * Apply a template to the current design.
 * Sets background color and stores the template draw function for rendering.
 * @param {string} templateId - The id of the template to apply
 */
function applyTemplate(templateId) {
  const template = TEMPLATES.find(t => t.id === templateId);
  if (!template) return;

  // Update the current design state
  currentDesign.templateId = templateId;
  currentDesign.backgroundColor = template.backgroundColor;
  currentDesign.templateDraw = template.draw;
  // Clear gradient so it doesn't override the template on save/load
  currentDesign.gradient = null;

  // Update UI
  document.getElementById('bg-color-picker').value = template.backgroundColor;
  updateBackgroundSwatches(template.backgroundColor);

  // Sync gradient UI: uncheck toggle and hide controls
  var gradToggle = document.getElementById('toggle-gradient');
  if (gradToggle) gradToggle.checked = false;
  var gradControls = document.getElementById('gradient-controls');
  if (gradControls) gradControls.classList.add('hidden');
  if (typeof clearGradientPresetHighlight === 'function') {
    clearGradientPresetHighlight();
  }

  // Highlight selected template card
  document.querySelectorAll('.template-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.templateId === templateId);
  });

  // Re-render: design canvas always, plus sheet thumbnails if in sheet mode
  renderDesignCanvas();
  if (typeof currentMode !== 'undefined' && currentMode === 'sheet') {
    refreshSheetThumbnails();
  }
}

/**
 * Get a template by its ID.
 * @param {string} templateId
 * @returns {Object|null}
 */
function getTemplateById(templateId) {
  return TEMPLATES.find(t => t.id === templateId) || null;
}
