# Cloud Storage Integration Plan

## Goal

Add Google Drive and OneDrive save/load support to Button Maker. Users get dropdown menus on the existing Save/Load buttons with cloud options alongside the current local file behavior. Everything is client-side only — no backend, no build step, matching the project's architecture.

---

## Project Context for Implementers

Button Maker is a static web app (vanilla JS, no modules, no bundler). All scripts load via `<script>` tags in a specific order and communicate through globals. Read `CLAUDE.md` for full orientation. Key things to know:

- **`js/storage.js`** handles save/load. `buildSavePayload()` serializes the current state. `importDesignsFromJSON(file)` reads a File object, parses JSON, and restores state.
- **`js/app.js`** has `initApp()` which calls all module initializers in sequence.
- **`index.html`** lines 43-57 contain the header action buttons (Load, Save, Reset, Generate PDF).
- **`index.html`** lines 237-247 contain the script loading order.
- **`css/styles.css`** has all styling. Modal patterns exist (search for `.quick-ref-overlay`).
- **`validate.js`** checks file existence, script order, and config consistency. Run `node validate.js` after changes.

---

## New Files to Create

### 1. `js/cloud-config.js`

Deployment-specific credentials. Separated so each library deployment can use their own OAuth apps.

```javascript
var CLOUD_CONFIG = {
  // Google Drive — leave empty or omit to disable
  GOOGLE_CLIENT_ID: '',       // From Google Cloud Console > Credentials
  GOOGLE_API_KEY: '',         // From Google Cloud Console > Credentials
  GOOGLE_APP_ID: '',          // Google Cloud project number

  // OneDrive — leave empty or omit to disable
  ONEDRIVE_CLIENT_ID: '',     // From Azure Portal > App Registrations
  ONEDRIVE_REDIRECT_URI: ''   // Typically window.location.origin
};
```

**Load position**: After `storage.js`, before `cloud-storage.js`.

### 2. `js/cloud-storage.js`

Single module containing all cloud logic for both providers. Internal structure:

```
// ─── State ───
var _googleTokenClient;        // Google Identity Services token client
var _googleToken;              // Current Google access token
var _googleTokenExpiry;        // Token expiration timestamp
var _msalInstance;             // MSAL.js PublicClientApplication instance
var _cloudFileId;              // Drive fileId or OneDrive itemId of current file
var _cloudProvider;            // 'google' | 'onedrive' | null
var _cloudFileName;            // Display name of current cloud file
var _pickerInited;             // Whether Google Picker API is loaded

// ─── Initialization ───
initCloudStorage()             // Entry point called from app.js. Checks for APIs,
                               //   wires dropdown UI, hides items for unconfigured providers.
_initGoogleAuth()              // Calls google.accounts.oauth2.initTokenClient()
_initMsal()                    // Constructs new msal.PublicClientApplication(msalConfig)

// ─── Authentication ───
_authenticateGoogle(callback)  // Requests token via _googleTokenClient.requestAccessToken()
_authenticateOneDrive(callback)// Calls _msalInstance.loginPopup(), then acquireTokenSilent()
_ensureGoogleToken(callback)   // Checks _googleTokenExpiry, re-auths if expired
_ensureOneDriveToken(callback) // Calls acquireTokenSilent, falls back to loginPopup

// ─── Save ───
cloudSave(provider)            // Calls buildSavePayload(), generates filename from
                               //   currentButtonSize + sheetName, then dispatches to
                               //   provider-specific upload. If _cloudFileId is set and
                               //   provider matches _cloudProvider, updates existing file.
_uploadToGoogleDrive(jsonStr, fileName, existingFileId)
                               // Uses Drive API v3 multipart upload:
                               //   POST https://www.googleapis.com/upload/drive/v3/files
                               //   (or PATCH .../files/{id} for updates)
                               //   Content-Type: multipart/related
                               //   Part 1: JSON metadata {name, mimeType}
                               //   Part 2: file content
_uploadToOneDrive(jsonStr, fileName, existingItemId)
                               // Uses Graph API:
                               //   PUT https://graph.microsoft.com/v1.0/me/drive/root:
                               //     /{fileName}:/content
                               //   (or PUT .../items/{id}/content for updates)

// ─── Load ───
cloudLoad(provider)            // Opens provider picker, user selects file, fetches content,
                               //   calls importDesignsFromData(JSON.parse(content))
_showGooglePicker(callback)    // Uses google.picker.PickerBuilder
                               //   - View: google.picker.ViewId.DOCS
                               //   - Filter to .buttons files via setMimeTypes or query
                               //   - callback receives {id, name} of selected file
_showOneDrivePicker(callback)  // Uses Graph API to list .buttons files, shows them in
                               //   a custom modal list. User clicks one, callback receives
                               //   {id, name}. (OneDrive Picker SDK is an option but has
                               //   had breaking changes; a simple file-list modal is more
                               //   reliable for this use case.)
_fetchFromGoogleDrive(fileId)  // GET https://www.googleapis.com/drive/v3/files/{id}?alt=media
                               //   with Authorization: Bearer {token}
_fetchFromOneDrive(itemId)     // GET https://graph.microsoft.com/v1.0/me/drive/items/{id}/content
                               //   with Authorization: Bearer {token}

// ─── UI ───
_showCloudConnectModal(provider, onSuccess)
                               // Modal shown on first cloud action when not authenticated.
                               //   "Connect to {Provider} to save/load your button designs."
                               //   [Connect] button triggers auth, then calls onSuccess.
                               //   Uses same pattern as .quick-ref-overlay in existing CSS.
_updateCloudStatus()           // Updates header cloud indicator icon color:
                               //   gray = disconnected, blue = Google connected,
                               //   blue+green = both connected
_toggleDropdown(menuId)        // Shows/hides dropdown menu, closes others.
                               //   Click outside closes all dropdowns.
```

**Load position**: After `cloud-config.js`, before `pdf-export.js`.

---

## Files to Modify

### `index.html`

**In `<head>` (after the jsPDF script block, ~line 22):**

Add third-party API scripts with async/defer so they don't block page load:

```html
<!-- Cloud storage APIs (loaded async, features degrade gracefully if blocked) -->
<script async defer src="https://accounts.google.com/gsi/client"></script>
<script async defer src="https://apis.google.com/js/api.js"></script>
<script async defer src="https://alcdn.msauth.net/browser/2.38.0/js/msal-browser-2.38.0.js"></script>
```

**In `.header-actions` (lines 43-57):**

Replace the flat Save and Load buttons with dropdown wrappers. The main button click still does local save/load (unchanged behavior). A small caret button toggles a dropdown with cloud options.

Replace this block:
```html
<button id="btn-load" class="btn btn-header" title="Load Saved Designs" aria-label="Load saved button designs">
  <i class="fa-solid fa-upload" aria-hidden="true"></i> Load
</button>
<button id="btn-save" class="btn btn-header" title="Save Current Designs" aria-label="Save current button designs">
  <i class="fa-solid fa-download" aria-hidden="true"></i> Save
</button>
<input type="file" id="import-designs-file" accept=".buttons,.json" hidden aria-hidden="true">
```

With:
```html
<div class="btn-dropdown-wrapper">
  <button id="btn-load" class="btn btn-header" title="Load from Device" aria-label="Load saved button designs">
    <i class="fa-solid fa-upload" aria-hidden="true"></i> Load
  </button>
  <button class="btn btn-header btn-dropdown-toggle" data-menu="load-dropdown" aria-label="More load options">
    <i class="fa-solid fa-caret-down" aria-hidden="true"></i>
  </button>
  <div class="btn-dropdown-menu" id="load-dropdown" hidden>
    <button class="dropdown-item" data-action="load-local"><i class="fa-solid fa-upload"></i> Load from Device</button>
    <button class="dropdown-item cloud-option google-option" data-action="load-google"><i class="fa-brands fa-google-drive"></i> Load from Google Drive</button>
    <button class="dropdown-item cloud-option onedrive-option" data-action="load-onedrive"><i class="fa-brands fa-microsoft"></i> Load from OneDrive</button>
  </div>
</div>
<div class="btn-dropdown-wrapper">
  <button id="btn-save" class="btn btn-header" title="Save to Device" aria-label="Save current button designs">
    <i class="fa-solid fa-download" aria-hidden="true"></i> Save
  </button>
  <button class="btn btn-header btn-dropdown-toggle" data-menu="save-dropdown" aria-label="More save options">
    <i class="fa-solid fa-caret-down" aria-hidden="true"></i>
  </button>
  <div class="btn-dropdown-menu" id="save-dropdown" hidden>
    <button class="dropdown-item" data-action="save-local"><i class="fa-solid fa-download"></i> Save to Device</button>
    <button class="dropdown-item cloud-option google-option" data-action="save-google"><i class="fa-brands fa-google-drive"></i> Save to Google Drive</button>
    <button class="dropdown-item cloud-option onedrive-option" data-action="save-onedrive"><i class="fa-brands fa-microsoft"></i> Save to OneDrive</button>
  </div>
</div>
<input type="file" id="import-designs-file" accept=".buttons,.json" hidden aria-hidden="true">
```

Cloud dropdown items (`.cloud-option`) start hidden via CSS and are shown by `initCloudStorage()` only when the corresponding provider is configured.

**Add cloud-connect modal markup** (before the closing `</body>`, near other modals):

```html
<div id="cloud-connect-overlay" class="quick-ref-overlay" hidden>
  <div class="quick-ref-modal" style="max-width: 400px;">
    <button class="quick-ref-close" id="cloud-connect-close" aria-label="Close">&times;</button>
    <h2 id="cloud-connect-title">Connect to Cloud Storage</h2>
    <p id="cloud-connect-message">Connect to save and load your button designs in the cloud.</p>
    <div style="text-align: center; margin-top: 1rem;">
      <button id="cloud-connect-btn" class="btn btn-header-primary">Connect</button>
    </div>
  </div>
</div>
```

**In the script loading section (lines 237-247):**

Add cloud scripts after `storage.js` (line 243):

```html
<script src="js/storage.js"></script>
<script src="js/cloud-config.js"></script>
<script src="js/cloud-storage.js"></script>
<script src="js/pdf-export.js"></script>
```

### `js/storage.js`

**Refactor `importDesignsFromJSON`** (lines 343-441).

Extract the body into a new global `importDesignsFromData(raw)` that accepts already-parsed JSON. The existing `importDesignsFromJSON(file)` becomes a thin wrapper.

The split point is clear: everything inside the `reader.onload` callback after `JSON.parse` (lines 348-434) moves into `importDesignsFromData`. The function signature is:

```javascript
function importDesignsFromData(raw) {
  // Lines 349-434 of current importDesignsFromJSON, verbatim.
  // 'raw' is the parsed JSON (array or {designs:[...]} envelope).
  // Contains: validation, sanitization, IDB save, localStorage save,
  //   size restore, design deserialization, sheet mode switch, zoom, undo clear.
}
```

Then `importDesignsFromJSON` becomes:

```javascript
function importDesignsFromJSON(file) {
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      importDesignsFromData(JSON.parse(e.target.result));
    } catch (err) {
      console.error('Import failed:', err);
      if (typeof showNotification === 'function') showNotification('Could not load this file. Is it a valid .buttons file?');
    }
  };
  reader.readAsText(file);
}
```

This is a pure refactor — no behavior change. Cloud load calls `importDesignsFromData(JSON.parse(responseText))` directly.

### `js/app.js`

In `initApp()`, after the `initStorage()` / `quickLoad()` call, add:

```javascript
if (typeof initCloudStorage === 'function') initCloudStorage();
```

The guard ensures the app still works if `cloud-storage.js` is removed.

### `css/styles.css`

Add styles for:

1. **Dropdown wrapper** — `position: relative; display: inline-flex;` to keep the main button and caret together
2. **Dropdown toggle** (caret button) — narrow, no left border-radius, visually attached to main button
3. **Dropdown menu** — `position: absolute; top: 100%; right: 0; z-index: 1000;` white background, box shadow, rounded corners
4. **Dropdown items** — full-width buttons, hover highlight, icon + text layout
5. **Cloud connect modal** — reuse `.quick-ref-overlay` / `.quick-ref-modal` pattern (already exists)
6. **Cloud status indicator** — small cloud icon, gray when disconnected
7. **`.cloud-option`** — `display: none` by default, shown via `.cloud-option.enabled { display: flex; }` (toggled by JS)

### `validate.js`

- Add `'js/cloud-config.js'` and `'js/cloud-storage.js'` to the expected files list
- Update the script loading order array to include both new files in the correct position
- Add `'importDesignsFromData'` and `'initCloudStorage'` to the global definitions check if one exists

---

## Authentication Details

### Google Drive

**APIs used**: Google Identity Services (GIS) + Google API Client (gapi) + Google Picker API

**Auth flow**:
1. `initCloudStorage()` calls `_initGoogleAuth()` which calls `google.accounts.oauth2.initTokenClient({ client_id, scope: 'https://www.googleapis.com/auth/drive.file', callback })`
2. When user clicks a Google Drive action, `_authenticateGoogle(cb)` calls `_googleTokenClient.requestAccessToken()` which opens a popup
3. The callback receives a token response with `access_token` and `expires_in`
4. Store token and expiry in `_googleToken` / `_googleTokenExpiry` (memory only, never persisted)
5. Before each API call, `_ensureGoogleToken(cb)` checks expiry and silently re-requests if needed

**Scope**: `drive.file` — the app can only see files it created or the user explicitly opened via Picker. Cannot see other Drive files.

**Picker setup**: After auth, call `gapi.load('picker', callback)` then build picker with `new google.picker.PickerBuilder().addView(view).setOAuthToken(token).setDeveloperKey(apiKey).setAppId(appId).setCallback(pickerCallback).build()`

### OneDrive

**API used**: MSAL.js 2.x (Microsoft Authentication Library) + Microsoft Graph API

**Auth flow**:
1. `initCloudStorage()` calls `_initMsal()` which constructs `new msal.PublicClientApplication({ auth: { clientId, redirectUri }, cache: { cacheLocation: 'sessionStorage' } })`
2. When user clicks a OneDrive action, `_authenticateOneDrive(cb)` calls `_msalInstance.loginPopup({ scopes: ['Files.ReadWrite'] })`
3. For subsequent calls, `_ensureOneDriveToken(cb)` calls `_msalInstance.acquireTokenSilent({ scopes: ['Files.ReadWrite'] })`, falls back to `acquireTokenPopup()` if silent fails
4. Token management is handled by MSAL internally (cached in sessionStorage)

**File picker approach**: Rather than the OneDrive Picker SDK (which has had breaking changes), list `.buttons` files via Graph API `GET /me/drive/root/search(q='.buttons')` and show results in a simple custom modal list.

---

## Graceful Degradation

The cloud feature is entirely optional. The app must work identically to today when:

- `cloud-config.js` doesn't exist → `typeof CLOUD_CONFIG === 'undefined'`, `initCloudStorage()` exits immediately
- Credentials are empty → provider-specific UI items stay hidden
- Google/MS scripts fail to load (firewall, ad blocker) → `typeof google === 'undefined'` / `typeof msal === 'undefined'`, those providers are skipped
- App served over HTTP → Google OAuth won't work, cloud features disabled
- `cloud-storage.js` itself is removed → guarded call in `app.js` is a no-op

The dropdown arrows should only appear if at least one provider is successfully configured and its API script loaded.

---

## Error Handling

All cloud operations (auth, save, load) are wrapped in try/catch. Use `showNotification()` for user feedback:

- Auth cancelled by user: "Connection cancelled."
- Popup blocked: "Please allow popups for this site to connect to [provider]."
- Network failure during upload: "Could not save to [provider]. Your design is still saved locally."
- Network failure during download: "Could not load from [provider]. Check your connection."
- File parse failure on cloud load: "This file could not be loaded. It may be corrupted."
- Storage quota exceeded: "Your [provider] storage is full."
- Invalid/missing config: Cloud UI silently hidden, no error shown.

---

## Deployment Guide

### For Google Drive

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → Create project
2. Enable: **Google Drive API** and **Google Picker API**
3. Credentials → Create **OAuth 2.0 Client ID** (Web application type)
   - Authorized JavaScript origins: your exact app URL (e.g., `https://library.github.io`)
4. Credentials → Create **API Key** → Restrict to Drive API + Picker API
5. OAuth consent screen → Set app name "Button Maker", add scope `drive.file`
   - Internal use: keep in "Testing" mode (up to 100 test users) or set to "Internal" (Workspace orgs)
   - Public use: submit for Google verification
6. Copy **Client ID**, **API Key**, and **Project Number** (from project settings) into `cloud-config.js`

### For OneDrive

1. Go to [Azure Portal → App Registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps) → New registration
2. Name: "Button Maker", Supported account types: choose based on your org
3. Platform: **Single-page application** → Redirect URI: your app URL
4. API Permissions → Add **Microsoft Graph → Files.ReadWrite** (delegated)
5. Authentication → Enable "Access tokens" and "ID tokens" under Implicit grant
6. Copy **Application (client) ID** into `cloud-config.js`, set `ONEDRIVE_REDIRECT_URI` to your app URL

### No-Setup Default

Ship `cloud-config.js` with empty strings. The app works exactly as it does today until someone fills in credentials.

---

## Implementation Order

Work through these in sequence. Each phase is independently testable.

### Phase 1: Storage refactor + new file scaffolding
1. Refactor `importDesignsFromJSON` in `js/storage.js` → extract `importDesignsFromData`
2. Create `js/cloud-config.js` with empty template
3. Create `js/cloud-storage.js` with `initCloudStorage()` stub that checks for `CLOUD_CONFIG` and API availability
4. Add script tags to `index.html` (both `<head>` API scripts and body script tags)
5. Add `initCloudStorage()` call in `js/app.js`
6. Update `validate.js`
7. Run `node validate.js` — must pass
8. Open app in browser — must load without errors, behave identically to before

### Phase 2: Dropdown UI + CSS
1. Replace Save/Load buttons in `index.html` with dropdown wrapper markup
2. Add dropdown CSS to `styles.css`
3. Wire dropdown toggle logic in `cloud-storage.js` (show/hide menus, close on outside click)
4. Wire `data-action="save-local"` and `data-action="load-local"` to trigger existing save/load behavior
5. Hide `.cloud-option` items by default; show them in `initCloudStorage()` when provider is configured
6. Test: dropdowns open/close, local save/load still works via dropdown items, main button click still works

### Phase 3: Google Drive auth + save + load
1. Implement `_initGoogleAuth()`, `_authenticateGoogle()`, `_ensureGoogleToken()`
2. Implement cloud-connect modal show/hide
3. Implement `_uploadToGoogleDrive()` using Drive API multipart upload
4. Wire `data-action="save-google"` → `cloudSave('google')`
5. Implement `_showGooglePicker()` using Picker API
6. Implement `_fetchFromGoogleDrive()` using Drive API
7. Wire `data-action="load-google"` → `cloudLoad('google')`
8. Test with real Google credentials: save a design, load it back

### Phase 4: OneDrive auth + save + load
1. Implement `_initMsal()`, `_authenticateOneDrive()`, `_ensureOneDriveToken()`
2. Implement `_uploadToOneDrive()` using Graph API
3. Wire `data-action="save-onedrive"` → `cloudSave('onedrive')`
4. Implement `_showOneDrivePicker()` (Graph API search + custom modal list)
5. Implement `_fetchFromOneDrive()` using Graph API
6. Wire `data-action="load-onedrive"` → `cloudLoad('onedrive')`
7. Test with real Azure credentials

### Phase 5: Polish
1. Add cloud status indicator icon in header
2. Track `_cloudFileId` / `_cloudProvider` for re-save (update existing file vs. create new)
3. Add "Save as New" option to dropdown
4. Handle edge cases: token expiry mid-operation, offline detection, concurrent saves
5. Final `node validate.js` check

---

## Verification Checklist

- [ ] `node validate.js` passes
- [ ] App loads without console errors (with and without `cloud-config.js`)
- [ ] Existing local Save/Load works identically (main button click)
- [ ] Dropdown menus appear only when at least one provider is configured
- [ ] Provider-specific items appear only for configured providers
- [ ] Google auth popup opens and returns a token
- [ ] Save to Google Drive creates a `.buttons` file in user's Drive
- [ ] Load from Google Drive opens Picker, selected file restores design correctly
- [ ] OneDrive auth popup opens and returns a token
- [ ] Save to OneDrive creates a `.buttons` file
- [ ] Load from OneDrive shows file list, selected file restores design correctly
- [ ] Re-saving updates existing cloud file (not creating duplicates)
- [ ] Cloud features disabled gracefully when APIs blocked or config missing
- [ ] Error notifications shown for auth failures, network errors, parse failures
