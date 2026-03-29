/* ==========================================================================
   GUIDED TOUR

   Walks users through Button Maker in section-based mini-tours.
   A full tour chains all sections in sequence.
   ========================================================================== */

(function() {
  'use strict';

  /* ----------------------------------------------------------------
     SECTION & STEP DEFINITIONS

     Each section has:
       title, description, icon (Font Awesome class), steps[]

     Each step has:
       target   - CSS selector for spotlight (null for general/no-target)
       text     - narration
       prepare  - optional function to set up the view (scroll, switch modes, etc.)
       padding  - optional extra px around spotlight (default 8)
     ---------------------------------------------------------------- */

  var SECTION_ORDER = [
    'getting-started',
    'size-setup',
    'design-button',
    'sheet-mode',
    'save-export'
  ];

  var SECTIONS = {
    'getting-started': {
      title: 'Getting Started',
      description: 'Overview of the interface and main controls.',
      icon: 'fa-solid fa-rocket',
      steps: [
        {
          target: '#design-canvas-wrapper',
          text: "Welcome to Button Maker! This tool helps you design and print sheets of pinback buttons. Let me show you around.",
          padding: 4,
        },
        {
          target: '#left-sidebar',
          text: "This is your control panel. It has everything you need: button size, image upload, background colors, and brand text.",
          prepare: function() { ensureSidebarOpen(); },
          padding: 0,
        },
        {
          target: '.header-actions',
          text: "These are your main actions. Load a saved project, Save your work, Reset to start fresh, or Generate a PDF when you're ready to print.",
          padding: 6,
        },
        {
          target: '#zoom-controls',
          text: "Use these controls to zoom in and out, fit the canvas to your screen, and undo or redo changes.",
          padding: 6,
        },
      ]
    },

    'size-setup': {
      title: 'Button Size & Setup',
      description: 'Choose your button size and editing mode.',
      icon: 'fa-solid fa-sliders',
      steps: [
        {
          target: '#button-size-select',
          text: "Choose your button size here. Button Maker supports 9 sizes from 1 inch to 3 inches. The layout and print grid adjust automatically.",
          prepare: function() {
            ensureSidebarOpen();
            scrollSidebarTo('general-section');
          },
        },
        {
          target: '#mode-toggle',
          text: "Switch between Design and Sheet modes. Design mode edits the master button that sets the default look. Sheet mode shows the full print layout.",
          prepare: function() {
            ensureSidebarOpen();
            scrollSidebarTo('general-section');
          },
        },
        {
          target: '#quick-ref-link',
          text: "Click Quick Reference to see cut diameters for every button size — handy when setting up your button press.",
          prepare: function() {
            ensureSidebarOpen();
            scrollSidebarTo('general-section');
          },
        },
        {
          target: '#design-canvas-wrapper',
          text: "The design canvas shows three guide circles: blue dashed is the safe zone, black solid is the button edge, and red dashed is the cut line. Keep your key content inside the blue circle.",
          padding: 4,
          prepare: function() {
            ensureMode('design');
          },
        },
      ]
    },

    'design-button': {
      title: 'Design Your Button',
      description: 'Images, colors, gradients, and brand text.',
      icon: 'fa-solid fa-palette',
      steps: [
        {
          target: '#image-section',
          text: "Upload an image to place on your button. Once uploaded, you can drag it to reposition and use the scale slider to resize.",
          prepare: function() {
            ensureSidebarOpen();
            ensureMode('design');
            scrollSidebarTo('image-section');
          },
          padding: 0,
        },
        {
          target: '#background-section',
          text: "Pick a background color from the palette, or use the custom color picker. This fills the entire button face behind your image.",
          prepare: function() {
            ensureSidebarOpen();
            scrollSidebarTo('background-section');
          },
          padding: 0,
        },
        {
          target: '#toggle-gradient',
          text: "Enable gradients for a more dynamic look. Choose a second color, pick a preset, or set the gradient direction.",
          prepare: function() {
            ensureSidebarOpen();
            scrollSidebarTo('background-section');
            // Scroll a bit further so the gradient toggle is visible
            var el = document.getElementById('toggle-gradient');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          },
        },
        {
          target: '#brand-text-section',
          text: "Add curved text along the bottom edge of your button — perfect for a library name, event, or slogan.",
          prepare: function() {
            ensureSidebarOpen();
            scrollSidebarTo('brand-text-section');
          },
          padding: 0,
        },
        {
          target: '#apply-background-to-all',
          text: "Check 'Apply to all' to push your background or brand text changes to every button on the sheet at once.",
          prepare: function() {
            ensureSidebarOpen();
            var el = document.getElementById('apply-background-to-all');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          },
        },
      ]
    },

    'sheet-mode': {
      title: 'Sheet Mode',
      description: 'Preview the print layout and customize individual buttons.',
      icon: 'fa-solid fa-grip',
      steps: [
        {
          target: '#btn-sheet-mode',
          text: "Click Sheet to see your full print layout. Let me switch there now.",
          prepare: function() {
            ensureSidebarOpen();
            scrollSidebarTo('general-section');
            // Switch to sheet mode after a brief delay
            setTimeout(function() { ensureMode('sheet'); }, 400);
          },
        },
        {
          target: '#sheet-view',
          text: "This is your button sheet — exactly how it will print. Each circle is one button. Click any button to select it, or Shift-click to select a range.",
          padding: 4,
          prepare: function() {
            ensureMode('sheet');
          },
        },
        {
          target: '#sheet-view',
          text: "Selected buttons can be customized individually — change their background, image, or brand text without affecting the others. A blue dot marks customized buttons.",
          padding: 4,
          prepare: function() {
            ensureMode('sheet');
          },
        },
        {
          target: '#btn-design-mode',
          text: "Switch back to Design mode to edit the master button. Any changes there automatically update all non-customized buttons on the sheet.",
          prepare: function() {
            ensureSidebarOpen();
            scrollSidebarTo('general-section');
            setTimeout(function() { ensureMode('design'); }, 400);
          },
        },
      ]
    },

    'save-export': {
      title: 'Save & Export',
      description: 'Save your work and generate a printable PDF.',
      icon: 'fa-solid fa-file-pdf',
      steps: [
        {
          target: '#btn-save',
          text: "Save your work as a .buttons file anytime. It stores everything: images, colors, overrides, and layout.",
          padding: 6,
        },
        {
          target: '#btn-load',
          text: "Load a previously saved .buttons file to pick up where you left off.",
          padding: 6,
        },
        {
          target: '#btn-export',
          text: "When you're happy with your design, hit Generate PDF. Print at Default or Actual Size scale for best results. Your buttons are ready to press!",
          padding: 6,
        },
        {
          target: null,
          text: "That's everything! You're all set to make some great buttons. Click the tour button in the header anytime to revisit these tips.",
        },
      ]
    }
  };


  /* ----------------------------------------------------------------
     TOUR STATE
     ---------------------------------------------------------------- */
  var currentSectionId = null;
  var currentStepIndex = 0;
  var isFullTour = false;
  var fullTourSectionIndex = 0;

  // Pre-tour state for restoration
  var preTourMode = null;
  var preTourSidebarCollapsed = null;

  // DOM refs (created once)
  var modalOverlay = null;
  var spotlight = null;
  var panel = null;
  var blocker = null;


  /* ----------------------------------------------------------------
     HELPERS
     ---------------------------------------------------------------- */
  function ensureSidebarOpen() {
    var sidebar = document.getElementById('left-sidebar');
    if (sidebar && sidebar.classList.contains('collapsed')) {
      sidebar.classList.remove('collapsed');
      var toggleBtn = document.getElementById('toggle-sidebar-btn');
      if (toggleBtn) toggleBtn.classList.add('active');
    }
  }

  function ensureMode(mode) {
    if (typeof currentMode !== 'undefined' && currentMode === mode) return;
    if (mode === 'design') {
      var designBtn = document.getElementById('btn-design-mode');
      if (designBtn) designBtn.click();
    } else if (mode === 'sheet') {
      var sheetBtn = document.getElementById('btn-sheet-mode');
      if (sheetBtn) sheetBtn.click();
    }
  }

  function scrollSidebarTo(sectionId) {
    var el = document.getElementById(sectionId);
    var sidebar = document.getElementById('left-sidebar');
    if (el && sidebar) {
      var offsetTop = el.offsetTop - sidebar.offsetTop;
      sidebar.scrollTo({ top: Math.max(0, offsetTop - 10), behavior: 'smooth' });
    }
  }

  function totalSteps() {
    if (!currentSectionId) return 0;
    if (isFullTour) {
      var total = 0;
      SECTION_ORDER.forEach(function(id) { total += SECTIONS[id].steps.length; });
      return total;
    }
    return SECTIONS[currentSectionId].steps.length;
  }

  function globalStepIndex() {
    if (!isFullTour) return currentStepIndex;
    var idx = 0;
    for (var i = 0; i < fullTourSectionIndex; i++) {
      idx += SECTIONS[SECTION_ORDER[i]].steps.length;
    }
    return idx + currentStepIndex;
  }


  /* ----------------------------------------------------------------
     DOM CREATION (once, on first use)
     ---------------------------------------------------------------- */
  function ensureDOM() {
    if (modalOverlay) return;

    // --- Modal ---
    modalOverlay = document.createElement('div');
    modalOverlay.className = 'tour-modal-overlay';
    modalOverlay.addEventListener('click', function(e) {
      if (e.target === modalOverlay) closeModal();
    });

    var modal = document.createElement('div');
    modal.className = 'tour-modal';

    // Header
    var header = document.createElement('div');
    header.className = 'tour-modal-header';
    header.innerHTML =
      '<div>' +
        '<h2><i class="fa-solid fa-compass" style="margin-right:8px;opacity:0.7"></i>Guided Tour</h2>' +
        '<p>Walk through the tool step by step.</p>' +
      '</div>' +
      '<button class="tour-modal-close" aria-label="Close tour menu">&times;</button>';
    header.querySelector('.tour-modal-close').addEventListener('click', closeModal);
    modal.appendChild(header);

    // Full tour button
    var fullBtn = document.createElement('button');
    fullBtn.className = 'tour-full-btn';
    var fullStepCount = 0;
    SECTION_ORDER.forEach(function(id) { fullStepCount += SECTIONS[id].steps.length; });
    fullBtn.innerHTML =
      '<i class="fa-solid fa-play"></i>' +
      'Take the Full Tour' +
      '<span class="btn-meta">' + fullStepCount + ' steps</span>';
    fullBtn.addEventListener('click', function() {
      closeModal();
      startFullTour();
    });
    modal.appendChild(fullBtn);

    // Sections label
    var label = document.createElement('div');
    label.className = 'tour-sections-label';
    label.textContent = 'Or pick a section';
    modal.appendChild(label);

    // Section cards
    var list = document.createElement('div');
    list.className = 'tour-sections-list';
    SECTION_ORDER.forEach(function(id) {
      var section = SECTIONS[id];
      var card = document.createElement('div');
      card.className = 'tour-section-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.innerHTML =
        '<div class="tour-section-icon"><i class="' + section.icon + '"></i></div>' +
        '<div class="tour-section-info">' +
          '<h3>' + section.title + '</h3>' +
          '<p>' + section.description + '</p>' +
        '</div>' +
        '<span class="tour-section-steps">' + section.steps.length + ' steps</span>';
      card.addEventListener('click', function() {
        closeModal();
        startSection(id);
      });
      card.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          closeModal();
          startSection(id);
        }
      });
      list.appendChild(card);
    });
    modal.appendChild(list);

    modalOverlay.appendChild(modal);
    document.body.appendChild(modalOverlay);

    // --- Interaction Blocker ---
    blocker = document.createElement('div');
    blocker.className = 'tour-blocker';
    document.body.appendChild(blocker);

    // --- Spotlight ---
    spotlight = document.createElement('div');
    spotlight.className = 'tour-spotlight';
    document.body.appendChild(spotlight);

    // --- Narration Panel ---
    panel = document.createElement('div');
    panel.className = 'tour-panel';

    var panelBody = document.createElement('div');
    panelBody.className = 'tour-panel-body';
    panelBody.innerHTML =
      '<div class="tour-panel-avatar"><i class="fa-solid fa-compass"></i></div>' +
      '<div class="tour-panel-text">' +
        '<div class="tour-panel-section"></div>' +
        '<div class="tour-panel-message"></div>' +
      '</div>';
    panel.appendChild(panelBody);

    var panelNav = document.createElement('div');
    panelNav.className = 'tour-panel-nav';
    panelNav.innerHTML =
      '<button class="tour-nav-btn tour-prev-btn">Back</button>' +
      '<span class="tour-step-counter"></span>' +
      '<button class="tour-nav-btn primary tour-next-btn">Next</button>' +
      '<button class="tour-nav-exit">Exit</button>';
    panelNav.querySelector('.tour-prev-btn').addEventListener('click', prevStep);
    panelNav.querySelector('.tour-next-btn').addEventListener('click', nextStep);
    panelNav.querySelector('.tour-nav-exit').addEventListener('click', exitTour);
    panel.appendChild(panelNav);

    document.body.appendChild(panel);

    // Keyboard navigation
    document.addEventListener('keydown', function(e) {
      if (!currentSectionId) return;
      if (e.key === 'Escape') exitTour();
      if (e.key === 'ArrowRight' || e.key === 'Enter') nextStep();
      if (e.key === 'ArrowLeft') prevStep();
    });
  }


  /* ----------------------------------------------------------------
     MODAL
     ---------------------------------------------------------------- */
  function openModal() {
    ensureDOM();
    modalOverlay.classList.add('visible');
  }

  function closeModal() {
    if (modalOverlay) modalOverlay.classList.remove('visible');
  }


  /* ----------------------------------------------------------------
     TOUR CONTROL
     ---------------------------------------------------------------- */
  function startSection(sectionId) {
    ensureDOM();
    isFullTour = false;
    currentSectionId = sectionId;
    currentStepIndex = 0;
    beginTour();
  }

  function startFullTour() {
    ensureDOM();
    isFullTour = true;
    fullTourSectionIndex = 0;
    currentSectionId = SECTION_ORDER[0];
    currentStepIndex = 0;
    beginTour();
  }

  function beginTour() {
    // Save pre-tour state for restoration
    preTourMode = typeof currentMode !== 'undefined' ? currentMode : 'design';
    var sidebar = document.getElementById('left-sidebar');
    preTourSidebarCollapsed = sidebar ? sidebar.classList.contains('collapsed') : false;

    // Mark body as tour-active (enables blocker)
    document.body.classList.add('tour-active');

    // Reset zoom so spotlight positioning is accurate
    if (typeof designZoom !== 'undefined') {
      designZoom = 1.0;
      sheetZoom = 1.0;
      if (typeof applyZoom === 'function') applyZoom();
    }

    // Reset to design mode and open sidebar
    ensureMode('design');
    ensureSidebarOpen();

    // Scroll sidebar and canvas area to top
    var sidebarEl = document.getElementById('left-sidebar');
    if (sidebarEl) sidebarEl.scrollTo({ top: 0, behavior: 'smooth' });
    var canvasScroll = document.getElementById('canvas-area-scroll');
    if (canvasScroll) canvasScroll.scrollTo({ top: 0, behavior: 'smooth' });

    showCurrentStep();
  }

  function showCurrentStep() {
    var section = SECTIONS[currentSectionId];
    var step = section.steps[currentStepIndex];

    // Run prepare if defined
    if (step.prepare) step.prepare();

    // Small delay for DOM to settle after prepare
    setTimeout(function() {
      var target = step.target ? document.querySelector(step.target) : null;

      // Panel content
      var sectionLabel = panel.querySelector('.tour-panel-section');
      var message = panel.querySelector('.tour-panel-message');
      var counter = panel.querySelector('.tour-step-counter');
      var prevBtn = panel.querySelector('.tour-prev-btn');
      var nextBtn = panel.querySelector('.tour-next-btn');

      sectionLabel.textContent = section.title;
      message.textContent = step.text;

      var gIdx = globalStepIndex();
      var total = totalSteps();
      counter.textContent = (gIdx + 1) + ' / ' + total;

      prevBtn.disabled = (gIdx === 0);
      nextBtn.textContent = (gIdx === total - 1) ? 'Finish' : 'Next';

      // Scroll target into view only if step didn't handle its own scrolling via prepare
      if (target && !step.prepare) {
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }

      // Hide spotlight/panel during transition to avoid stale positions
      spotlight.classList.remove('visible');
      panel.classList.remove('visible');

      // Blocker is always active (on-rails) — no interactive or hoverable steps
      blocker.classList.remove('interactive');
      blocker.classList.remove('hoverable');

      // Wait for scroll to settle before positioning
      setTimeout(function() {
        positionSpotlight(target, step.padding);
        positionPanel(target);
        spotlight.classList.add('visible');
        panel.classList.add('visible');
      }, 450);
    }, 150);
  }

  function nextStep() {
    if (!currentSectionId) return;
    var section = SECTIONS[currentSectionId];

    if (currentStepIndex < section.steps.length - 1) {
      currentStepIndex++;
      showCurrentStep();
    } else if (isFullTour && fullTourSectionIndex < SECTION_ORDER.length - 1) {
      // Advance to next section in full tour
      fullTourSectionIndex++;
      currentSectionId = SECTION_ORDER[fullTourSectionIndex];
      currentStepIndex = 0;
      showCurrentStep();
    } else {
      // Tour complete
      exitTour();
    }
  }

  function prevStep() {
    if (!currentSectionId) return;

    if (currentStepIndex > 0) {
      currentStepIndex--;
      showCurrentStep();
    } else if (isFullTour && fullTourSectionIndex > 0) {
      // Go back to previous section's last step
      fullTourSectionIndex--;
      currentSectionId = SECTION_ORDER[fullTourSectionIndex];
      currentStepIndex = SECTIONS[currentSectionId].steps.length - 1;
      showCurrentStep();
    }
  }

  function exitTour() {
    currentSectionId = null;
    currentStepIndex = 0;
    isFullTour = false;
    fullTourSectionIndex = 0;

    // Remove tour-active state
    document.body.classList.remove('tour-active');

    // Hide spotlight and panel
    spotlight.classList.remove('visible');
    panel.classList.remove('visible');

    // Restore pre-tour mode
    if (preTourMode) {
      ensureMode(preTourMode);
      preTourMode = null;
    }

    // Restore sidebar state
    if (preTourSidebarCollapsed) {
      var sidebar = document.getElementById('left-sidebar');
      if (sidebar) sidebar.classList.add('collapsed');
      var toggleBtn = document.getElementById('toggle-sidebar-btn');
      if (toggleBtn) toggleBtn.classList.remove('active');
    }
    preTourSidebarCollapsed = null;
  }


  /* ----------------------------------------------------------------
     POSITIONING
     ---------------------------------------------------------------- */
  function positionSpotlight(target, extraPad) {
    var pad = (extraPad !== undefined) ? extraPad : 8;

    if (!target) {
      spotlight.classList.add('no-target');
      spotlight.style.top = '50%';
      spotlight.style.left = '50%';
      spotlight.style.width = '0';
      spotlight.style.height = '0';
      return;
    }

    spotlight.classList.remove('no-target');
    var rect = target.getBoundingClientRect();
    spotlight.style.top = (rect.top - pad) + 'px';
    spotlight.style.left = (rect.left - pad) + 'px';
    spotlight.style.width = (rect.width + pad * 2) + 'px';
    spotlight.style.height = (rect.height + pad * 2) + 'px';
  }

  function positionPanel(target) {
    var panelWidth = 340;
    var panelHeight = panel.offsetHeight || 180;
    var margin = 16;
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    if (!target) {
      // Center the panel
      panel.style.top = Math.max(margin, (vh - panelHeight) / 2) + 'px';
      panel.style.left = Math.max(margin, (vw - panelWidth) / 2) + 'px';
      return;
    }

    var rect = target.getBoundingClientRect();
    var top, left;

    // Try below target
    if (rect.bottom + margin + panelHeight < vh) {
      top = rect.bottom + margin;
      left = Math.min(Math.max(margin, rect.left), vw - panelWidth - margin);
    }
    // Try above target
    else if (rect.top - margin - panelHeight > 0) {
      top = rect.top - margin - panelHeight;
      left = Math.min(Math.max(margin, rect.left), vw - panelWidth - margin);
    }
    // Try right of target
    else if (rect.right + margin + panelWidth < vw) {
      top = Math.min(Math.max(margin, rect.top), vh - panelHeight - margin);
      left = rect.right + margin;
    }
    // Try left of target
    else if (rect.left - margin - panelWidth > 0) {
      top = Math.min(Math.max(margin, rect.top), vh - panelHeight - margin);
      left = rect.left - margin - panelWidth;
    }
    // Fallback: bottom center
    else {
      top = vh - panelHeight - margin;
      left = Math.max(margin, (vw - panelWidth) / 2);
    }

    panel.style.top = top + 'px';
    panel.style.left = left + 'px';
  }


  /* ----------------------------------------------------------------
     INIT
     ---------------------------------------------------------------- */
  function init() {
    // Wire the header tour button
    var tourBtn = document.getElementById('tour-button');
    if (tourBtn) {
      tourBtn.addEventListener('click', openModal);
    }

    // Handle resize during tour
    window.addEventListener('resize', function() {
      if (!currentSectionId) return;
      var section = SECTIONS[currentSectionId];
      var step = section.steps[currentStepIndex];
      var target = step.target ? document.querySelector(step.target) : null;
      positionSpotlight(target, step.padding);
      positionPanel(target);
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API
  window.tour = { open: openModal };

})();
