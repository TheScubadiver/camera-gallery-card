/* camera-gallery-card-editor.js */

const AVAILABLE_OBJECT_FILTERS = [
  "bicycle",
  "bird",
  "bus",
  "car",
  "cat",
  "dog",
  "motorcycle",
  "person",
  "truck",
  "visitor",
];

const DEFAULT_AUTOPLAY = false;
const DEFAULT_AUTOMUTED = true;
const DEFAULT_LIVE_AUTO_MUTED = true;

const MAX_VISIBLE_OBJECT_FILTERS = AVAILABLE_OBJECT_FILTERS.length;

const STYLE_SECTIONS = [
  {
    id: "card",
    label: "Card",
    icon: "mdi:card-outline",
    controls: [
      { type: "color",  hostId: "bgcolor-host",     variable: "--cgc-card-bg",           label: "Background" },
      { type: "color",  hostId: "bordercolor-host", variable: "--cgc-card-border-color", label: "Border color" },
      { type: "radius", variable: "--r",             label: "Border radius", min: 0, max: 32, default: 10 },
    ],
  },
  {
    id: "preview",
    label: "Pills",
    icon: "mdi:image-outline",
    controls: [
      { type: "color", hostId: "tsbar-txt-host", variable: "--cgc-tsbar-txt", label: "Text / icon color" },
      { type: "color", hostId: "pill-bg-host",   variable: "--cgc-pill-bg",   label: "Background color" },
      { type: "radius", variable: "--cgc-pill-size", label: "Size", min: 10, max: 28, default: 14 },
    ],
  },
  {
    id: "thumbs",
    label: "Thumbnails",
    icon: "mdi:view-grid-outline",
    controls: [
      { type: "color",  hostId: "tbarbg-host",   variable: "--cgc-tbar-bg",      label: "Bar background" },
      { type: "color",  hostId: "tbar-txt-host", variable: "--cgc-tbar-txt",     label: "Bar text color" },
      { type: "radius", variable: "--cgc-thumb-radius",   label: "Border radius", min: 0, max: 20, default: 10 },
    ],
  },
  {
    id: "filters",
    label: "Filter buttons",
    icon: "mdi:filter-outline",
    controls: [
      { type: "color",  hostId: "filterbg-host",   variable: "--cgc-obj-btn-bg",            label: "Background" },
      { type: "color",  hostId: "iconcolor-host",  variable: "--cgc-obj-icon-color",        label: "Icon color" },
      { type: "color",  hostId: "btnactive-host",  variable: "--cgc-obj-btn-active-bg",     label: "Active background" },
      { type: "color",  hostId: "iconactive-host", variable: "--cgc-obj-icon-active-color", label: "Active icon color" },
      { type: "radius", variable: "--cgc-obj-btn-radius", label: "Border radius", min: 0, max: 14, default: 10 },
    ],
  },
  {
    id: "controls",
    label: "Today / Date / Live",
    icon: "mdi:calendar-outline",
    controls: [
      { type: "color",  hostId: "ctrl-txt-host",     variable: "--cgc-ctrl-txt",       label: "Text color" },
      { type: "color",  hostId: "ctrl-chevron-host", variable: "--cgc-ctrl-chevron",   label: "Chevron color" },
      { type: "color",  hostId: "live-active-host",  variable: "--cgc-live-active-bg", label: "Live active color" },
      { type: "radius", variable: "--cgc-ctrl-radius", label: "Border radius", min: 0, max: 16, default: 10 },
    ],
  },
];

class CameraGalleryCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this.attachShadow({ mode: "open" });

    this._scrollRestore = {
      windowY: 0,
      hostScrollTop: 0,
      browserBodyTop: 0,
    };

    this._activeTab = "general";
    this._focusState = null;
    this._lastSuggestFingerprint = {
      entities: "",
      mediasources: "",
    };
    this._mediaBrowseCache = new Map();
    this._mediaSuggestReq = 0;
    this._mediaSuggestTimer = null;
    this._raf = null;

    this._mediaBrowserOpen = false;
    this._mediaBrowserLoading = false;
    this._mediaBrowserPath = "";
    this._mediaBrowserItems = [];
    this._mediaBrowserHistory = [];

    this._suggestState = {
      entities: { open: false, items: [], index: -1 },
      mediasources: { open: false, items: [], index: -1 },
    };

    this._openStyleSections = new Set();

    this._wizardOpen = false;
    this._wizardFolder = "";
    this._wizardName = "";
    this._wizardStatus = null;
  }

  _applyFieldValidation(id) {
    const el = this.shadowRoot?.getElementById(id);
    if (!el) return;
    const field = el.closest(".field");
    if (!field) return;

    field.classList.remove("valid", "invalid");

    let state = "neutral";
    if (id === "entities") state = this._validateSensors(el.value);
    if (id === "mediasources") state = this._validateMediaFolders(el.value);

    if (state === "valid") field.classList.add("valid");
    if (state === "invalid") field.classList.add("invalid");
  }

  _applySuggestion(id, value) {
    const el = this.shadowRoot?.getElementById(id);
    if (!el) return;

    this._replaceCurrentLine(el, value);

    if (id === "entities") {
      this._commitEntities(false);
      this._applyFieldValidation("entities");
    } else if (id === "mediasources") {
      this._commitMediaSources(false);
      this._applyFieldValidation("mediasources");
    }

    this._closeSuggestions(id);
  }

  _acceptSuggestion(id) {
    const state = this._suggestState[id];
    if (!state?.open || !state.items.length) return false;
    const idx = state.index >= 0 ? state.index : 0;
    const value = state.items[idx];
    this._applySuggestion(id, value);
    return true;
  }

  async _browseMediaFolders(mediaContentId) {
    const id = this._normalizeMediaSourceValue(mediaContentId);
    if (!id || !this._hass?.callWS) return [];

    if (this._mediaBrowseCache.has(id)) {
      return this._mediaBrowseCache.get(id);
    }

    try {
      const result = await this._hass.callWS({
        type: "media_source/browse_media",
        media_content_id: id,
      });

      const children = Array.isArray(result?.children) ? result.children : [];
      const folders = children
        .filter((child) => this._isFolderNode(child))
        .map((child) => String(child.media_content_id || "").trim())
        .filter((v) => v.startsWith("media-source://"));

      const clean = this._sortUniqueStrings(folders);
      this._mediaBrowseCache.set(id, clean);
      return clean;
    } catch (_) {
      this._mediaBrowseCache.set(id, []);
      return [];
    }
  }

  async _browseMediaFolderNodes(mediaContentId) {
    const isRoot = mediaContentId === null || mediaContentId === "" || mediaContentId == null;
    const id = isRoot ? null : this._normalizeMediaSourceValue(mediaContentId);
    if (!isRoot && (id === null || id === undefined)) return [];
    if (!this._hass?.callWS) return [];

    const cacheKey = `__nodes__:${isRoot ? "__root__" : id}`;
    if (this._mediaBrowseCache.has(cacheKey)) {
      return this._mediaBrowseCache.get(cacheKey);
    }

    try {
      const wsPayload = { type: "media_source/browse_media" };
      if (!isRoot) wsPayload.media_content_id = id;
      const result = await this._hass.callWS(wsPayload);

      const children = Array.isArray(result?.children) ? result.children : [];

      const folders = children
        .filter((child) => this._isFolderNode(child))
        .map((child) => {
          const mediaId = String(child.media_content_id || "").trim();
          const title = String(child.title || "").trim();
          return {
            id: mediaId,
            title: title || this._lastPathSegment(mediaId),
          };
        })
        .filter((v) => v.id.startsWith("media-source://"))
        .sort((a, b) => a.title.localeCompare(b.title));

      this._mediaBrowseCache.set(cacheKey, folders);
      return folders;
    } catch (_) {
      this._mediaBrowseCache.set(cacheKey, []);
      return [];
    }
  }

  _getHostScroller() {
    let el = this;
    while (el) {
      const root = el.getRootNode?.();
      const parent = el.parentElement || (root && root.host ? root.host : null);

      if (!parent) break;

      try {
        const style = getComputedStyle(parent);
        const overflowY = style.overflowY;
        const canScroll =
          (overflowY === "auto" || overflowY === "scroll") &&
          parent.scrollHeight > parent.clientHeight;

        if (canScroll) return parent;
      } catch (_) {}

      el = parent;
    }

    return null;
  }

  _captureScrollState() {
    try {
      this._scrollRestore.windowY =
        window.scrollY ||
        window.pageYOffset ||
        document.documentElement.scrollTop ||
        0;
    } catch (_) {
      this._scrollRestore.windowY = 0;
    }

    try {
      const scroller = this._getHostScroller();
      this._scrollRestore.hostScrollTop = scroller ? scroller.scrollTop : 0;
    } catch (_) {
      this._scrollRestore.hostScrollTop = 0;
    }

    try {
      const body = this.shadowRoot?.querySelector(".browser-body");
      this._scrollRestore.browserBodyTop = body ? body.scrollTop : 0;
    } catch (_) {
      this._scrollRestore.browserBodyTop = 0;
    }
  }

  _restoreScrollState() {
    requestAnimationFrame(() => {
      try {
        const scroller = this._getHostScroller();
        if (scroller) {
          scroller.scrollTop = this._scrollRestore.hostScrollTop || 0;
        } else {
          window.scrollTo({
            top: this._scrollRestore.windowY || 0,
            behavior: "auto",
          });
        }
      } catch (_) {}

      try {
        const body = this.shadowRoot?.querySelector(".browser-body");
        if (body) {
          body.scrollTop = this._scrollRestore.browserBodyTop || 0;
        }
      } catch (_) {}
    });
  }

  _lockPageScroll() {
    this._captureScrollState();

    const body = document.body;
    const docEl = document.documentElement;

    if (body) {
      body.style.overflow = "hidden";
      body.style.touchAction = "none";
    }

    if (docEl) {
      docEl.style.overflow = "hidden";
    }
  }

  _unlockPageScroll() {
    const body = document.body;
    const docEl = document.documentElement;

    if (body) {
      body.style.overflow = "";
      body.style.touchAction = "";
    }

    if (docEl) {
      docEl.style.overflow = "";
    }

    this._restoreScrollState();
  }

  _clampInt(n, min, max) {
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  _closeSuggestions(id) {
    this._suggestState[id] = { open: false, items: [], index: -1 };
    this._lastSuggestFingerprint[id] = "";
    this._renderSuggestions(id);
  }

  _collectEntitySuggestions() {
    if (!this._hass) return [];
    return Object.values(this._hass.states)
      .filter(
        (e) =>
          e.entity_id.startsWith("sensor.") &&
          e.attributes?.fileList !== undefined
      )
      .map((e) => e.entity_id)
      .sort((a, b) => a.localeCompare(b));
  }

  async _collectMediaSuggestionsDynamic(query) {
    const defaults = this._getDefaultMediaSuggestions();
    const q = this._normalizeMediaSourceValue(query);

    if (!q) return defaults.slice(0, 8);

    if (!q.startsWith("media-source://")) {
      return defaults
        .filter((v) => v.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 8);
    }

    const exactFolders = await this._browseMediaFolders(q);
    if (exactFolders.length) return exactFolders.slice(0, 8);

    const { base, needle } = this._mediaBaseAndNeedle(q);

    if (!base) {
      return defaults
        .filter((v) => v.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 8);
    }

    const baseFolders = await this._browseMediaFolders(base);
    if (!baseFolders.length) {
      return defaults
        .filter((v) => v.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 8);
    }

    const filtered = !needle
      ? baseFolders
      : baseFolders.filter((v) => {
          const tail = v.slice(base.length + 1).toLowerCase();
          return tail.includes(needle.toLowerCase());
        });

    return filtered.slice(0, 8);
  }

  _commitEntities(commit = false) {
    const entitiesEl = this.shadowRoot?.getElementById("entities");
    const raw = String(entitiesEl?.value || "");
    const arr = this._parseTextList(raw);

    if (!arr.length) {
      const next = { ...this._config };
      delete next.entities;
      delete next.entity;
      this._config = this._stripAlwaysTrueKeys(next);
      if (commit) {
        this._fire();
        this._scheduleRender();
      }
      return;
    }

    const next = { ...this._config, entities: arr };
    delete next.entity;
    this._config = this._stripAlwaysTrueKeys(next);

    if (commit) {
      this._fire();
      this._scheduleRender();
    }
  }

  _commitMediaSources(commit = false) {
    const mediaEl = this.shadowRoot?.getElementById("mediasources");
    const raw = String(mediaEl?.value || "");
    const arr = this._parseTextList(raw);

    if (!arr.length) {
      const next = { ...this._config };
      delete next.media_source;
      delete next.media_sources;
      this._config = this._stripAlwaysTrueKeys(next);
      if (commit) {
        this._fire();
        this._scheduleRender();
      }
      return;
    }

    const next = { ...this._config, media_sources: arr };
    delete next.media_source;
    this._config = this._stripAlwaysTrueKeys(next);

    if (commit) {
      this._fire();
      this._scheduleRender();
    }
  }

  _filterSuggestions(list, query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return list.slice(0, 8);
    return list
      .filter((v) => String(v).toLowerCase().includes(q))
      .slice(0, 8);
  }

  _fire() {
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: { ...this._config } },
        bubbles: true,
        composed: true,
      })
    );
  }

  _getDefaultMediaSuggestions() {
    const defaults = [
      "media-source://frigate",
      "media-source://frigate/frigate/event-search/clips",
      "media-source://frigate/frigate/event-search/snapshots",
      "media-source://media_source",
      "media-source://media_source/local",
      "media-source://media_source/local/mac_share",
    ];

    const cfg = Array.isArray(this._config.media_sources)
      ? this._config.media_sources
          .map(String)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const set = new Set([...defaults, ...cfg]);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  _getMediaBrowserRoots() {
    const roots = [
      "media-source://frigate",
      "media-source://media_source",
      "media-source://media_source/local",
    ];

    const configured = Array.isArray(this._config.media_sources)
      ? this._config.media_sources
          .map((x) => this._normalizeMediaSourceValue(x))
          .filter(Boolean)
      : [];

    return this._sortUniqueStrings([...roots, ...configured]);
  }

  _getTextareaLineInfo(el) {
    const value = String(el?.value || "");
    const caret =
      typeof el.selectionStart === "number" ? el.selectionStart : value.length;

    const before = value.slice(0, caret);
    const after = value.slice(caret);

    const lineStart = before.lastIndexOf("\n") + 1;
    const nextNl = after.indexOf("\n");
    const lineEnd = nextNl === -1 ? value.length : caret + nextNl;

    const line = value.slice(lineStart, lineEnd);
    const lineCaret = caret - lineStart;

    return { value, caret, lineStart, lineEnd, line, lineCaret };
  }

  _isFolderNode(node) {
    const cls = String(node?.media_class || "").toLowerCase();
    const type = String(node?.media_content_type || "").toLowerCase();
    const id = String(node?.media_content_id || "");

    if (cls === "app" || cls === "channel" || cls === "directory") return true;
    if (type === "directory") return true;
    if (id.startsWith("media-source://") && !/\.[a-z0-9]{2,6}$/i.test(id)) {
      return true;
    }
    return false;
  }

  _looksLikeFile(relPath) {
    const v = String(relPath || "");
    if (v.startsWith("media-source://")) return false;
    const last = v.split("/").pop() || "";
    return /\.(jpg|jpeg|png|gif|webp|mp4|mov|mkv|avi|m4v|wav|mp3|aac|flac|pdf|txt|json)$/i.test(
      last
    );
  }

  _lastPathSegment(v) {
    const s = String(v || "").replace(/\/+$/, "");
    if (!s) return "";
    const parts = s.split("/");
    return parts[parts.length - 1] || s;
  }

  _mediaBaseAndNeedle(rawLine) {
    const line = this._normalizeMediaSourceValue(rawLine);

    if (!line.startsWith("media-source://")) {
      return { base: "", needle: line };
    }

    const lastSlash = line.lastIndexOf("/");
    if (lastSlash <= "media-source://".length - 1) {
      return { base: line, needle: "" };
    }

    const tail = line.slice(lastSlash + 1);
    const parent = line.slice(0, lastSlash);

    if (!tail) return { base: parent, needle: "" };

    return { base: parent, needle: tail };
  }

  _moveSuggestion(id, dir) {
    const state = this._suggestState[id];
    if (!state?.open || !state.items.length) return;

    let idx = state.index + dir;
    if (idx < 0) idx = state.items.length - 1;
    if (idx >= state.items.length) idx = 0;

    this._suggestState[id] = { ...state, index: idx };
    this._renderSuggestions(id);
  }

  _normalizeMediaSourceValue(v) {
    let s = String(v || "").trim();
    if (!s) return "";
    s = s.replace(/\s+/g, "");
    s = s.replace(/\/{2,}$/g, "");
    return s;
  }

  _normalizeObjectFilters(listOrSingle) {
      const arr = Array.isArray(listOrSingle) ? listOrSingle : (listOrSingle ? [listOrSingle] : []);
      const out = [];
      const seen = new Set();

      for (const item of arr) {
        let key = "";
        if (typeof item === "string") {
          key = item.toLowerCase().trim();
        } else if (typeof item === "object" && item !== null) {
          key = Object.keys(item)[0].toLowerCase().trim();
        }

        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(item); // We bewaren het originele item (string of object)
      }
      return out;
    }

  _numInt(v, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.round(n);
  }

  _objectIcon(v) {
    const map = {
      bicycle: "mdi:bicycle",
      bird: "mdi:bird",
      bus: "mdi:bus",
      car: "mdi:car",
      cat: "mdi:cat",
      dog: "mdi:dog",
      motorcycle: "mdi:motorbike",
      person: "mdi:account",
      truck: "mdi:truck",
      visitor: "mdi:doorbell-video",
    };
    return map[v] || "mdi:shape";
  }

  _objectLabel(v) {
    const s = String(v || "").toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  _openSuggestions(id, items) {
    const prev = this._suggestState[id] || {
      open: false,
      items: [],
      index: -1,
    };

    const sameItems =
      JSON.stringify(prev.items || []) === JSON.stringify(items || []);

    this._suggestState[id] = {
      open: !!items.length,
      items,
      index: sameItems
        ? Math.min(
            prev.index >= 0 ? prev.index : 0,
            Math.max(items.length - 1, 0)
          )
        : items.length
          ? 0
          : -1,
    };

    this._renderSuggestions(id);
  }

  async _openMediaBrowser(startPath = "") {
    const roots = this._getMediaBrowserRoots();

    const wantsRoot = startPath === "" || startPath == null;
    const chosen = wantsRoot ? "" : (this._normalizeMediaSourceValue(startPath) || roots[0] || "");

    this._lockPageScroll();

    this._mediaBrowserOpen = true;
    this._mediaBrowserHistory = [];
    this._mediaBrowserItems = [];
    this._mediaBrowserPath = chosen;
    this._mediaBrowserLoading = true;
    this._scheduleRender();

    await this._loadMediaBrowser(chosen, false);
  }

  async _loadMediaBrowser(path, pushHistory = true) {
    const target = path === null ? null : (path === "" ? "" : this._normalizeMediaSourceValue(path));
    if (target === null || target === undefined) return;

    if (
      pushHistory &&
      this._mediaBrowserPath !== target
    ) {
      this._mediaBrowserHistory.push(this._mediaBrowserPath);
    }

    this._mediaBrowserLoading = true;
    this._mediaBrowserPath = target;
    this._mediaBrowserItems = [];
    this._scheduleRender();

    const items = await this._browseMediaFolderNodes(target);

    if (this._mediaBrowserPath !== target) return;

    this._mediaBrowserItems = items;
    this._mediaBrowserLoading = false;
    this._scheduleRender();
  }

  _closeMediaBrowser() {
    this._unlockPageScroll();

    this._mediaBrowserOpen = false;
    this._mediaBrowserLoading = false;
    this._mediaBrowserPath = "";
    this._mediaBrowserItems = [];
    this._mediaBrowserHistory = [];
    this._scheduleRender();
  }

  async _mediaBrowserGoBack() {
    if (!this._mediaBrowserHistory.length) return;
    const prev = this._mediaBrowserHistory.pop();
    if (prev === undefined) return;

    this._mediaBrowserLoading = true;
    this._mediaBrowserPath = prev;
    this._mediaBrowserItems = [];
    this._scheduleRender();

    const items = await this._browseMediaFolderNodes(prev);
    if (this._mediaBrowserPath !== prev) return;

    this._mediaBrowserItems = items;
    this._mediaBrowserLoading = false;
    this._scheduleRender();
  }

  _appendMediaSourceValue(value) {
    const nextValue = this._normalizeMediaSourceValue(value);
    if (!nextValue) return;

    const current = Array.isArray(this._config.media_sources)
      ? this._config.media_sources.map((x) => String(x).trim()).filter(Boolean)
      : [];

    const set = new Set(current.map((x) => x.toLowerCase()));
    if (!set.has(nextValue.toLowerCase())) {
      current.push(nextValue);
    }

    const mediaEl = this.shadowRoot?.getElementById("mediasources");
    if (mediaEl) {
      mediaEl.value = current.join("\n");
    }

    this._config = this._stripAlwaysTrueKeys({
      ...this._config,
      media_sources: current,
    });
    delete this._config.media_source;

    this._fire();
    this._applyFieldValidation("mediasources");
    this._closeSuggestions("mediasources");
    this._scheduleRender();
  }

  _parseTextList(raw) {
    const s = String(raw || "");
    const parts = s
      .split(/\n|,/g)
      .map((x) => String(x || "").trim())
      .filter(Boolean);

    const out = [];
    const seen = new Set();
    for (const p of parts) {
      const key = String(p).trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(String(p).trim());
    }
    return out;
  }

  _prettyLabel(choiceValue) {
    const v = String(choiceValue || "");
    if (!v) return "";
    if (v.startsWith("media-source://")) return this._toRel(v);
    return v;
  }

  _getStyleVariableValue(variableName) {
    const styleVariables = String(this._config?.style_variables || "");
    const escaped = String(variableName || "").replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );
    const match = styleVariables.match(
      new RegExp(`${escaped}\\s*:\\s*([^;]+)`)
    );

    return match ? match[1].trim() : "";
  }

  _setStyleVariable(variable, value) {
    const current = String(this._config.style_variables || "");

    const lines = current
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !l.startsWith(variable));

    lines.push(`${variable}: ${value};`);

    this._config = this._stripAlwaysTrueKeys({
      ...this._config,
      style_variables: lines.join("\n"),
    });
  }

  _removeStyleVariable(variable) {
    const current = String(this._config.style_variables || "");

    const lines = current
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !l.startsWith(variable));

    this._config = this._stripAlwaysTrueKeys({
      ...this._config,
      style_variables: lines.join("\n"),
    });
  }

  _createColorPicker(hostId, variable, value) {
    const host = this.shadowRoot?.getElementById(hostId);
    if (!host) return;

    host.innerHTML = "";

    const picker = document.createElement("input");
    picker.type = "color";
    picker.className = "cgc-color";

    const isTransparent = value === "transparent";

    picker.value =
      value && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)
        ? value
        : "#000000";

    picker.disabled = isTransparent;

    host.appendChild(picker);

    picker.addEventListener("change", (e) => {
      const color = e.target.value;
      this._setStyleVariable(variable, color);
      this._fire();
      this._scheduleRender();
    });
  }

  _bindColorControls() {
    STYLE_SECTIONS.forEach((section) => {
      section.controls.forEach((ctrl) => {
        if (ctrl.type === "color") {
          this._createColorPicker(
            ctrl.hostId,
            ctrl.variable,
            this._getStyleVariableValue(ctrl.variable)
          );
        }
      });
    });

    this.shadowRoot.querySelectorAll("[data-reset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const variable = btn.dataset.reset;
        this._removeStyleVariable(variable);
        this._fire();
        this._scheduleRender();
      });
    });

    this.shadowRoot.querySelectorAll("[data-transparent]").forEach((el) => {
      const variable = el.dataset.transparent;
      const current = this._getStyleVariableValue(variable);

      el.checked = current === "transparent";

      el.addEventListener("change", (e) => {
        if (e.target.checked) {
          this._setStyleVariable(variable, "transparent");
        } else {
          this._removeStyleVariable(variable);
        }

        this._fire();
        this._scheduleRender();
      });
    });

    this.shadowRoot.querySelectorAll("[data-radius]").forEach((slider) => {
      const variable = slider.dataset.radius;
      const safeId = variable.replace(/[^a-z0-9]/gi, "-");
      const display = this.shadowRoot.getElementById("radius-val-" + safeId);

      slider.addEventListener("input", (e) => {
        if (display) display.textContent = e.target.value + "px";
      });

      slider.addEventListener("change", (e) => {
        this._setStyleVariable(variable, e.target.value + "px");
        this._fire();
        this._scheduleRender();
      });
    });

    this.shadowRoot.querySelectorAll("details.style-section").forEach((det) => {
      det.addEventListener("toggle", () => {
        const id = det.id.replace("style-section-", "");
        if (det.open) {
          this._openStyleSections.add(id);
        } else {
          this._openStyleSections.delete(id);
        }
      });
    });
  }

  _render() {
    const c = this._config || {};

    try {
      const ae = this.shadowRoot?.activeElement;
      if (ae && ae.id) {
        const st =
          typeof ae.selectionStart === "number" ? ae.selectionStart : null;
        const en = typeof ae.selectionEnd === "number" ? ae.selectionEnd : null;
        this._focusState = {
          id: ae.id,
          value: typeof ae.value === "string" ? ae.value : null,
          start: st,
          end: en,
        };
      } else {
        this._focusState = null;
      }
    } catch (_) {
      this._focusState = null;
    }

    const cSourceMode = String(c.source_mode || "sensor");
    const sensorModeOn = cSourceMode === "sensor";
    const mediaModeOn = cSourceMode === "media";

    const entitiesArr = Array.isArray(c.entities)
      ? c.entities.map(String).map((s) => s.trim()).filter(Boolean)
      : [];
    const legacyEntity = String(c.entity || "").trim();
    const effectiveEntities = entitiesArr.length
      ? entitiesArr
      : legacyEntity
        ? [legacyEntity]
        : [];
    const entitiesText = this._sourcesToText(effectiveEntities);

    const invalidEntities = effectiveEntities.filter((id) => {
      const isSensorDomain = /^sensor\./i.test(id);
      const exists = !!this._hass?.states?.[id];
      return !isSensorDomain || !exists;
    });

    const mediaSourcesArr = Array.isArray(c.media_sources)
      ? c.media_sources.map(String).map((s) => s.trim()).filter(Boolean)
      : [];
    const mediaSourcesText = this._sourcesToText(mediaSourcesArr);

    const mediaHasFile = mediaSourcesArr.some((s) =>
      this._looksLikeFile(this._prettyLabel(s))
    );

    const filenameDatetimeFormat = String(
      c.filename_datetime_format || ""
    ).trim();

    const objectFiltersArr = this._normalizeObjectFilters(
      c.object_filters || []
    );
    const selectedCount = objectFiltersArr.length;
    const objectColors = (typeof c.object_colors === "object" && c.object_colors !== null) ? c.object_colors : {};

    const height = Number(c.preview_height) || 320;
    const thumbSize = Number(c.thumb_size) || 140;
    const maxMedia = (() => {
      const n = this._numInt(c.max_media, 20);
      return this._clampInt(n, 1, 100);
    })();

    const tsPos = String(c.bar_position || "top");
    const previewPos = String(c.preview_position || "top");
    const objectFit = String(c.object_fit || "cover");

    const thumbBarPos = (() => {
      const v = String(c.thumb_bar_position || "bottom")
        .toLowerCase()
        .trim();
      if (v === "hidden") return "hidden";
      if (v === "top") return "top";
      return "bottom";
    })();

    const thumbLayout = (() => {
      const v = String(c.thumb_layout || "horizontal").toLowerCase().trim();
      return v === "vertical" ? "vertical" : "horizontal";
    })();

    const thumbSizeMuted = thumbLayout === "vertical";

    const allServices = this._hass?.services || {};
    const shellCmds = Object.keys(allServices.shell_command || {})
      .map((svc) => `shell_command.${svc}`)
      .sort((a, b) => a.localeCompare(b));

    const deleteService = String(
      c.delete_service || c.shell_command || ""
    ).trim();
    const deleteOk =
      !deleteService || /^[a-z0-9_]+\.[a-z0-9_]+$/i.test(deleteService);

    const deleteChoices = (() => {
      const set = new Set(shellCmds);
      if (deleteService) set.add(deleteService);
      return Array.from(set).sort((a, b) => a.localeCompare(b));
    })();

    const barOpacity = (() => {
      const n = Number(c.bar_opacity);
      if (!Number.isFinite(n)) return 45;
      return Math.min(100, Math.max(0, n));
    })();

    const autoplay = c.autoplay === true;
    const autoMuted =
      c.auto_muted !== undefined ? c.auto_muted === true : DEFAULT_AUTOMUTED;
    const liveAutoMuted =
      c.live_auto_muted !== undefined ? c.live_auto_muted === true : DEFAULT_LIVE_AUTO_MUTED;

    const barDisabled = tsPos === "hidden";
    const pillSize = Math.max(10, Math.min(28, Number(c.pill_size) || 14));
    const clickToOpen = c.preview_click_to_open === true;

    const liveEnabled = c.live_enabled === true;
    const liveCameraEntity = String(c.live_camera_entity || "").trim();
    const liveCameraEntities = Array.isArray(c.live_camera_entities) ? c.live_camera_entities : [];
    const liveControlsDisabled = false;

    const cameraEntities = Object.keys(this._hass?.states || {})
      .filter((id) => {
        if (!id.startsWith("camera.")) return false;

        const st = this._hass?.states?.[id];
        if (!st) return false;

        const state = String(st.state || "").toLowerCase();

        return state !== "unavailable" && state !== "unknown";
      })
      .sort((a, b) => {
        const an = String(
          this._hass?.states?.[a]?.attributes?.friendly_name || a
        ).toLowerCase();
        const bn = String(
          this._hass?.states?.[b]?.attributes?.friendly_name || b
        ).toLowerCase();
        return an.localeCompare(bn);
      });

    const rootVars = `
      --ed-radius-panel: 18px;
      --ed-radius-row: 16px;
      --ed-radius-input: 12px;
      --ed-radius-pill: 999px;
      --ed-space-1: 8px;
      --ed-space-2: 12px;
      --ed-space-3: 16px;
      --ed-space-4: 20px;

      --ed-muted: var(--cgc-editor-muted-opacity, 0.60);

      --ed-text: var(--primary-text-color, rgba(0,0,0,0.87));
      --ed-text2: var(--secondary-text-color, rgba(0,0,0,0.60));

      --ed-section-bg: var(--card-background-color, #fff);
      --ed-section-border: color-mix(
        in srgb,
        var(--divider-color, rgba(0,0,0,0.12)) 55%,
        transparent
      );
      --ed-section-glow: var(
        --cgc-editor-section-glow,
        0 1px 0 rgba(255,255,255,0.02) inset
      );

      --ed-row-bg: color-mix(
        in srgb,
        var(--secondary-background-color, rgba(0,0,0,0.03)) 60%,
        transparent
      );
      --ed-row-border: color-mix(
        in srgb,
        var(--divider-color, rgba(0,0,0,0.12)) 48%,
        transparent
      );

      --ed-input-bg: var(--secondary-background-color, rgba(0,0,0,0.04));
      --ed-input-border: color-mix(
        in srgb,
        var(--divider-color, rgba(0,0,0,0.14)) 58%,
        transparent
      );

      --ed-select-bg: var(--secondary-background-color, rgba(0,0,0,0.04));
      --ed-select-border: color-mix(
        in srgb,
        var(--divider-color, rgba(0,0,0,0.14)) 58%,
        transparent
      );

      --ed-seg-bg: var(--secondary-background-color, rgba(0,0,0,0.04));
      --ed-seg-border: color-mix(
        in srgb,
        var(--divider-color, rgba(0,0,0,0.12)) 52%,
        transparent
      );
      --ed-seg-txt: var(--secondary-text-color, rgba(0,0,0,0.60));
      --ed-seg-on-bg: var(--primary-text-color, rgba(0,0,0,0.88));
      --ed-seg-on-txt: var(--primary-background-color, rgba(255,255,255,0.98));

      --ed-tab-bg: var(--secondary-background-color, rgba(0,0,0,0.03));
      --ed-tab-border: color-mix(
        in srgb,
        var(--divider-color, rgba(0,0,0,0.12)) 52%,
        transparent
      );
      --ed-tab-txt: var(--secondary-text-color, rgba(0,0,0,0.60));
      --ed-tab-on-bg: color-mix(
        in srgb,
        var(--primary-color, #03a9f4) 14%,
        var(--secondary-background-color, rgba(0,0,0,0.04))
      );
      --ed-tab-on-border: var(--primary-color, #03a9f4);
      --ed-tab-on-txt: var(--primary-text-color, rgba(0,0,0,0.88));

      --ed-chip-bg: var(--secondary-background-color, rgba(0,0,0,0.03));
      --ed-chip-border: color-mix(
        in srgb,
        var(--divider-color, rgba(0,0,0,0.12)) 52%,
        transparent
      );
      --ed-chip-disabled: 0.50;
      --ed-chip-txt: var(--primary-text-color, rgba(0,0,0,0.88));
      --ed-chip-icon-bg: color-mix(
        in srgb,
        var(--secondary-background-color, rgba(0,0,0,0.03)) 80%,
        transparent
      );
      --ed-chip-on-bg: color-mix(
        in srgb,
        var(--primary-color, #03a9f4) 12%,
        var(--secondary-background-color, rgba(0,0,0,0.03))
      );
      --ed-chip-on-border: var(--primary-color, #03a9f4);
      --ed-chip-on-txt: var(--primary-text-color, rgba(0,0,0,0.92));
      --ed-chip-on-icon-bg: color-mix(
        in srgb,
        var(--primary-color, #03a9f4) 18%,
        transparent
      );

      --ed-pill-bg: var(--secondary-background-color, rgba(0,0,0,0.08));
      --ed-pill-border: color-mix(
        in srgb,
        var(--divider-color, rgba(0,0,0,0.14)) 58%,
        transparent
      );
      --ed-pill-txt: var(--primary-text-color, rgba(0,0,0,0.88));

      --ed-sugg-bg: var(--card-background-color, #fff);
      --ed-sugg-border: color-mix(
        in srgb,
        var(--divider-color, rgba(0,0,0,0.14)) 60%,
        transparent
      );
      --ed-sugg-hover: var(--secondary-background-color, rgba(0,0,0,0.045));
      --ed-sugg-active: color-mix(
        in srgb,
        var(--primary-color, #03a9f4) 10%,
        var(--secondary-background-color, rgba(0,0,0,0.04))
      );

      --ed-arrow: var(--secondary-text-color, rgba(0,0,0,0.58));
      --ed-focus-ring: color-mix(
        in srgb,
        var(--primary-color, #03a9f4) 20%,
        transparent
      );

      --ed-valid: var(--success-color, rgba(46,160,67,0.95));
      --ed-valid-glow: color-mix(
        in srgb,
        var(--success-color, rgba(46,160,67,0.95)) 20%,
        transparent
      );

      --ed-invalid: var(--error-color, rgba(219,68,55,0.92));
      --ed-invalid-glow: color-mix(
        in srgb,
        var(--error-color, rgba(219,68,55,0.92)) 20%,
        transparent
      );

      --ed-warning: var(--warning-color, rgba(245,158,11,0.95));
      --ed-warning-bg: color-mix(
        in srgb,
        var(--warning-color, rgba(245,158,11,0.95)) 10%,
        transparent
      );
      --ed-warning-border: color-mix(
        in srgb,
        var(--warning-color, rgba(245,158,11,0.95)) 24%,
        transparent
      );
      --ed-warning-icon-bg: color-mix(
        in srgb,
        var(--warning-color, rgba(245,158,11,0.95)) 14%,
        transparent
      );

      --ed-success-bg: color-mix(
        in srgb,
        var(--success-color, rgba(46,160,67,0.95)) 10%,
        transparent
      );
      --ed-success-border: color-mix(
        in srgb,
        var(--success-color, rgba(46,160,67,0.95)) 24%,
        transparent
      );
      --ed-success-icon-bg: color-mix(
        in srgb,
        var(--success-color, rgba(46,160,67,0.95)) 14%,
        transparent
      );

      --ed-shadow-soft: var(
        --cgc-editor-shadow-soft,
        0 8px 24px rgba(0,0,0,0.10)
      );
      --ed-shadow-float: var(
        --cgc-editor-shadow-float,
        0 14px 36px rgba(0,0,0,0.18)
      );
      --ed-shadow-press: var(
        --cgc-editor-shadow-press,
        0 6px 16px rgba(0,0,0,0.10)
      );
      --ed-shadow-chip: var(
        --cgc-editor-shadow-chip,
        0 8px 18px rgba(0,0,0,0.08)
      );
      --ed-shadow-modal: var(
        --cgc-editor-shadow-modal,
        0 24px 60px rgba(0,0,0,0.28)
      );
      --ed-backdrop: var(--cgc-editor-backdrop, rgba(0,0,0,0.68));
    `;

    const tabBtn = (key, label, icon) => `
      <button
        type="button"
        class="tabbtn ${this._activeTab === key ? "on" : ""}"
        data-tab="${key}"
      >
        <ha-icon icon="${icon}"></ha-icon>
        <span>${label}</span>
      </button>
    `;

    const panelHead = (icon, title, subtitle) => `
      <div class="panelhead">
        <div class="panelicon">
          <ha-icon icon="${icon}"></ha-icon>
        </div>
        <div class="panelhead-copy">
          <div class="paneltitle">${title}</div>
          ${subtitle ? `<div class="panelsubtitle">${subtitle}</div>` : ``}
        </div>
      </div>
    `;

    const mediaBrowserHtml = this._mediaBrowserOpen
      ? `
        <div class="browser-backdrop" id="browser-backdrop"></div>
        <div class="browser-modal" role="dialog" aria-modal="true" aria-label="Browse media folders">
          <div class="browser-head">
            <div class="browser-head-copy">
              <div class="browser-title">Browse folders</div>
              <div class="browser-path">${this._mediaBrowserPath || "—"}</div>
            </div>
            <button type="button" class="browser-iconbtn" id="browser-close" title="Close">
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>

          <div class="browser-toolbar">
            <button
              type="button"
              class="browser-btn ${this._mediaBrowserHistory.length ? "" : "disabled"}"
              id="browser-back"
              ${this._mediaBrowserHistory.length ? "" : "disabled"}
            >
              <ha-icon icon="mdi:arrow-left"></ha-icon>
              <span>Back</span>
            </button>

            <button
              type="button"
              class="browser-btn primary"
              id="browser-select-current"
              ${this._mediaBrowserPath ? "" : "disabled"}
            >
              <ha-icon icon="mdi:check"></ha-icon>
              <span>Use current folder</span>
            </button>
          </div>

          <div class="browser-body">
            ${
              this._mediaBrowserLoading
                ? `<div class="browser-empty">Loading folders…</div>`
                : this._mediaBrowserItems.length
                  ? `
                    <div class="browser-list">
                      ${this._mediaBrowserItems
                        .map(
                          (item) => `
                            <div class="browser-item">
                              <button
                                type="button"
                                class="browser-open"
                                data-browser-open="${item.id.replace(/"/g, "&quot;")}"
                                title="${item.id.replace(/"/g, "&quot;")}"
                              >
                                <span class="browser-open-icon">
                                  <ha-icon icon="mdi:folder-outline"></ha-icon>
                                </span>
                                <span class="browser-open-copy">
                                  <span class="browser-open-title">${item.title}</span>
                                  <span class="browser-open-sub">${item.id}</span>
                                </span>
                              </button>

                              <button
                                type="button"
                                class="browser-select"
                                data-browser-select="${item.id.replace(/"/g, "&quot;")}"
                                title="Select folder"
                              >
                                Select
                              </button>
                            </div>
                          `
                        )
                        .join("")}
                    </div>
                  `
                  : `<div class="browser-empty">No folders found here.</div>`
            }
          </div>
        </div>
      `
      : ``;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 8px 0;
          color: var(--ed-text);
          box-sizing: border-box;
          min-width: 0;
        }

        .wrap {
          display: grid;
          gap: var(--ed-space-3);
          min-width: 0;
        }

        .desc,
        code {
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .tabs {
          display: grid;
          gap: var(--ed-space-3);
        }

        .tabbar {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 10px;
          padding: 10px;
          border-radius: var(--ed-radius-panel);
          background: var(--ed-section-bg);
          border: 1px solid var(--ed-section-border);
          box-shadow: var(--ed-section-glow);
        }

        .tabbtn {
          appearance: none;
          -webkit-appearance: none;
          border: 1px solid var(--ed-tab-border);
          background: var(--ed-tab-bg);
          color: var(--ed-tab-txt);
          border-radius: 14px;
          min-height: 46px;
          padding: 10px 14px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 900;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          text-align: center;
          transition:
            background 0.18s ease,
            border-color 0.18s ease,
            color 0.18s ease,
            transform 0.18s ease,
            box-shadow 0.18s ease;
          min-width: 0;
          box-shadow: var(--ed-section-glow);
        }

        .tabbtn:hover {
          border-color: var(--ed-tab-border);
        }

        .tabbtn ha-icon {
          --mdc-icon-size: 16px;
          width: 16px;
          height: 16px;
          flex: 0 0 auto;
        }

        .tabbtn.on {
          background: var(--ed-tab-on-bg);
          border-color: var(--ed-tab-on-border);
          color: var(--ed-tab-on-txt);
          box-shadow: var(--ed-shadow-press);
        }

        .tabpanel {
          padding: 16px;
          padding-right: 20px;
          border-radius: var(--ed-radius-panel);
          background: var(--ed-section-bg);
          border: 1px solid var(--ed-section-border);
          display: grid;
          gap: 14px;
          align-content: start;
          box-shadow: var(--ed-section-glow);
          min-height: 420px;
          box-sizing: border-box;
          scrollbar-gutter: stable;
        }

        .panelhead {
          display: flex;
          align-items: center;
          gap: 4px;
          padding-bottom: 6px;
          min-width: 0;
        }

        .panelicon {
          width: 40px;
          height: 40px;
          min-width: 40px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          background: var(--ed-input-bg);
          border: 1px solid var(--ed-input-border);
          box-shadow: var(--ed-section-glow);
        }

        .panelicon ha-icon {
          --mdc-icon-size: 20px;
          width: 20px;
          height: 20px;
          color: var(--ed-text);
        }

        .panelhead-copy {
          min-width: 0;
          display: grid;
          gap: 4px;
        }

        .paneltitle {
          font-size: 16px;
          font-weight: 1000;
          color: var(--ed-text);
          line-height: 1.2;
        }

        .panelsubtitle {
          font-size: 12px;
          color: var(--ed-text2);
          line-height: 1.45;
        }

        .row {
          display: grid;
          gap: 12px;
          padding: 16px;
          border-radius: var(--ed-radius-row);
          background: var(--ed-row-bg);
          border: 1px solid var(--ed-row-border);
          color: var(--ed-text);
          min-width: 0;
          transition:
            background 0.18s ease,
            border-color 0.18s ease,
            box-shadow 0.18s ease;
        }

        .row:hover {
          border-color: var(--ed-row-border);
        }

        .row-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          min-width: 0;
        }

        .row-head > :first-child {
          min-width: 0;
          flex: 1 1 auto;
          display: grid;
          gap: 6px;
        }

        .row-inline {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .row-inline .lbl {
          margin: 0;
        }

        .row-inline #bgcolor-host {
          display: flex;
          align-items: center;
          flex: 0 0 auto;
        }

        #bgcolor {
          width: 42px;
          height: 28px;
          padding: 0;
          border: 1px solid var(--ed-input-border);
          border-radius: 6px;
          background: none;
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
        }

        #bgcolor::-webkit-color-swatch-wrapper {
          padding: 0;
        }

        #bgcolor::-webkit-color-swatch {
          border: none;
          border-radius: 6px;
        }

        .lbl {
          font-size: 13px;
          font-weight: 950;
          color: var(--ed-text);
          line-height: 1.2;
          letter-spacing: 0.01em;
        }

        .desc {
          font-size: 12px;
          opacity: 0.88;
          color: var(--ed-text2);
          line-height: 1.45;
        }

        code {
          opacity: 0.95;
        }

        ha-slider {
          width: 100%;
        }

        .field {
          position: relative;
          min-width: 0;
        }

        .field textarea {
          width: 100%;
          box-sizing: border-box;
          border-radius: var(--ed-radius-input);
          border: 1px solid var(--ed-input-border);
          background: var(--ed-input-bg);
          color: var(--ed-text);
          padding: 13px 14px;
          font-size: 13px;
          font-weight: 800;
          outline: none;
          resize: vertical;
          min-height: 112px;
          line-height: 1.45;
          white-space: pre-wrap;
          font-family:
            ui-monospace,
            SFMono-Regular,
            Menlo,
            Monaco,
            Consolas,
            "Liberation Mono",
            "Courier New",
            monospace;
          transition:
            border-color 0.16s ease,
            box-shadow 0.16s ease,
            background 0.16s ease;
          box-shadow: var(--ed-section-glow);
        }

        #stylevars {
          font-weight: 500;
          cursor: text;
          user-select: text;
          -webkit-user-select: text;
          line-height: 1.5;
        }

        .field textarea::placeholder {
          color: color-mix(in srgb, var(--ed-text2) 82%, transparent);
        }

        .field textarea:focus {
          border-color: color-mix(
            in srgb,
            var(--ed-input-border) 25%,
            var(--primary-color, #03a9f4) 75%
          );
          box-shadow:
            0 0 0 3px var(--ed-focus-ring),
            var(--ed-section-glow);
        }

        .field textarea:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .field.valid textarea {
          border-color: var(--ed-valid);
          box-shadow: 0 0 0 3px var(--ed-valid-glow);
        }

        .field.invalid textarea {
          border-color: var(--ed-invalid);
          box-shadow: 0 0 0 3px var(--ed-invalid-glow);
        }

        .suggestions {
          position: absolute;
          left: 0;
          right: 0;
          top: calc(100% + 8px);
          background: var(--ed-sugg-bg);
          border: 1px solid var(--ed-sugg-border);
          border-radius: 14px;
          box-shadow: var(--ed-shadow-float);
          padding: 8px;
          display: grid;
          gap: 4px;
          z-index: 999;
          max-height: 280px;
          overflow: auto;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }

        .suggestions[hidden] {
          display: none;
        }

        .sugg-label {
          padding: 6px 10px 8px;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--ed-text2);
        }

        .sugg-item {
          appearance: none;
          -webkit-appearance: none;
          border: 0;
          background: transparent;
          color: var(--ed-text);
          text-align: left;
          padding: 11px 12px;
          border-radius: 10px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 800;
          font-family:
            ui-monospace,
            SFMono-Regular,
            Menlo,
            Monaco,
            Consolas,
            "Liberation Mono",
            "Courier New",
            monospace;
          white-space: normal;
          overflow: visible;
          text-overflow: clip;
          word-break: break-word;
          overflow-wrap: anywhere;
          line-height: 1.35;
          transition:
            background 0.14s ease,
            transform 0.14s ease;
        }

        .sugg-item:hover {
          background: var(--ed-sugg-hover);
        }

        .sugg-item.active {
          background: var(--ed-sugg-active);
        }

        .sugg-active-path {
          padding: 9px 10px 4px;
          font-size: 11px;
          opacity: 0.75;
          word-break: break-word;
          overflow-wrap: anywhere;
          border-top: 1px solid var(--ed-sugg-border);
          margin-top: 4px;
          color: var(--ed-text2);
        }

        .selectwrap {
          position: relative;
          min-width: 0;
        }

        .select {
          width: 100%;
          box-sizing: border-box;
          border-radius: var(--ed-radius-input);
          border: 1px solid var(--ed-select-border);
          background: var(--ed-select-bg);
          color: var(--ed-text);
          padding: 12px 42px 12px 14px;
          font-size: 13px;
          font-weight: 800;
          outline: none;
          min-width: 0;
          appearance: none;
          -webkit-appearance: none;
          cursor: pointer;
          transition:
            border-color 0.16s ease,
            box-shadow 0.16s ease,
            background 0.16s ease;
          box-shadow: var(--ed-section-glow);
        }

        .select:hover {
          border-color: color-mix(
            in srgb,
            var(--ed-select-border) 70%,
            var(--ed-text2) 30%
          );
        }

        .color-grid {
          display: grid;
          gap: 10px;
        }

        .color-row {
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
          gap: 12px;
        }

        .color-controls {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .color-row .lbl {
          margin: 0;
        }

        .color-reset {
          appearance: none;
          border: none;
          background: none;
          padding: 0;
          margin-left: 4px;
          width: 20px;
          height: 20px;
          display: grid;
          place-items: center;
          cursor: pointer;
          color: var(--ed-text2);
          opacity: 0.7;
          transition:
            opacity 0.15s ease,
            transform 0.15s ease,
            color 0.15s ease;
        }

        .color-reset:hover {
          opacity: 1;
          border-color: var(--ed-tab-border);
          color: var(--ed-text);
        }

        .color-reset ha-icon {
          --mdc-icon-size: 16px;
        }

        .select:focus {
          border-color: color-mix(
            in srgb,
            var(--ed-select-border) 25%,
            var(--primary-color, #03a9f4) 75%
          );
          box-shadow:
            0 0 0 3px var(--ed-focus-ring),
            var(--ed-section-glow);
        }

        .select:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .selarrow {
          position: absolute;
          top: 50%;
          right: 16px;
          width: 10px;
          height: 10px;
          transform: translateY(-60%) rotate(45deg);
          border-right: 2px solid var(--ed-arrow);
          border-bottom: 2px solid var(--ed-arrow);
          pointer-events: none;
          opacity: 0.9;
        }

        .select.invalid {
          border-color: var(--ed-invalid);
          box-shadow: 0 0 0 3px var(--ed-invalid-glow);
        }

        .segwrap {
          display: flex;
          gap: 8px;
        }

        .seg {
          flex: 1;
          border: 1px solid var(--ed-seg-border);
          background: var(--ed-seg-bg);
          color: var(--ed-seg-txt);
          border-radius: 12px;
          padding: 11px 0;
          font-size: 13px;
          font-weight: 850;
          cursor: pointer;
          min-width: 0;
          transition:
            background 0.16s ease,
            border-color 0.16s ease,
            color 0.16s ease,
            transform 0.16s ease,
            box-shadow 0.16s ease;
        }

        .seg:hover {
          border-color: var(--ed-tab-border);
        }

        .seg.on {
          background: var(--ed-seg-on-bg);
          color: var(--ed-seg-on-txt);
          border-color: transparent;
          box-shadow: var(--ed-shadow-press);
        }

        .togrow {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
          min-width: 0;
          flex: 0 0 auto;
          white-space: nowrap;
        }

        .barrow {
          display: grid;
          gap: 10px;
          min-width: 0;
        }

        .barrow-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .pillval {
          min-width: 56px;
          text-align: center;
          padding: 6px 10px;
          border-radius: var(--ed-radius-pill);
          background: var(--ed-pill-bg);
          border: 1px solid var(--ed-pill-border);
          font-size: 12px;
          font-weight: 1000;
          color: var(--ed-pill-txt);
          box-shadow: var(--ed-section-glow);
        }

        .muted {
          opacity: var(--ed-muted);
        }

        .hint {
          margin: 2px 0 0 0;
          font-size: 12px;
          opacity: 0.92;
          color: var(--ed-text2);
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .hint ha-icon {
          --mdc-icon-size: 14px;
          color: var(--ed-text2);
        }

        .hint a {
          color: var(--primary-color);
          text-decoration: none;
          font-weight: 700;
        }

        .hint a:hover {
          text-decoration: underline;
        }

        .row-actions {
          display: flex;
          gap: 10px;
        }

        .row-actions .actionbtn {
          flex: 1;
          justify-content: center;
        }

        .actionbtn {
          appearance: none;
          -webkit-appearance: none;
          border: 1px solid var(--ed-input-border);
          background: var(--ed-input-bg);
          color: var(--ed-text);
          border-radius: 12px;
          min-height: 40px;
          padding: 0 14px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 900;
          transition:
            background 0.18s ease,
            border-color 0.18s ease,
            transform 0.18s ease,
            box-shadow 0.18s ease;
        }

        .actionbtn:hover {
          border-color: color-mix(
            in srgb,
            var(--ed-input-border) 65%,
            var(--ed-text2) 35%
          );
        }

        .actionbtn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
          transform: none;
        }

        .actionbtn ha-icon {
          --mdc-icon-size: 18px;
          width: 18px;
          height: 18px;
        }

        .livecam-tags {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 6px;
        }
        .livecam-tag {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 6px 4px 6px;
          background: var(--ed-chip-bg);
          border: 1px solid var(--ed-chip-border);
          border-radius: 999px;
          font-size: 12px;
          color: var(--ed-text);
          cursor: grab;
          transition: opacity 0.15s, box-shadow 0.15s;
        }
        .livecam-tag.dnd-dragging { opacity: 0.35; }
        .livecam-tag.dnd-over { box-shadow: -3px 0 0 0 var(--primary-color, #03a9f4); }
        .livecam-tag-grip {
          font-size: 18px; opacity: 0.4; line-height: 1;
          cursor: grab; user-select: none;
          padding: 4px 6px 4px 2px; margin: -4px 0;
          touch-action: none;
        }
        .livecam-tag-num {
          font-size: 10px; font-weight: 700; opacity: 0.5;
          background: var(--ed-text2, #888); color: var(--ed-bg, #fff);
          border-radius: 999px; min-width: 16px; height: 16px;
          display: flex; align-items: center; justify-content: center;
          padding: 0 4px; line-height: 1;
        }
        .livecam-tag-entity {
          opacity: 0.45;
          font-size: 10px;
          font-weight: 500;
        }
        .livecam-tag-del {
          border: none;
          background: none;
          cursor: pointer;
          color: var(--ed-text2);
          padding: 0 2px;
          font-size: 15px;
          line-height: 1;
        }

        .chip-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 4px;
        }

        .objchip {
          display: grid;
          grid-template-columns: 36px 1fr auto;
          align-items: center;
          column-gap: 10px;
          width: 100%;
          min-height: 44px;
          padding: 0 10px;
          border-radius: 12px;
          border: 1px solid var(--ed-chip-border);
          background: var(--ed-chip-bg);
          color: var(--ed-chip-txt);
          cursor: pointer;
          transition:
            background 0.18s ease,
            border-color 0.18s ease,
            color 0.18s ease,
            box-shadow 0.18s ease;
          box-sizing: border-box;
          box-shadow: var(--ed-section-glow);
        }

        .objchip:hover {
          border-color: var(--ed-tab-border);
        }

        .objchip.on {
          background: var(--ed-chip-on-bg);
          border-color: var(--ed-chip-on-border);
          color: var(--ed-chip-on-txt);
          box-shadow: var(--ed-shadow-chip);
        }

        .objchip.disabled {
          opacity: var(--ed-chip-disabled);
          cursor: not-allowed;
          transform: none;
        }

        .objchip-icon {
          width: 36px;
          height: 36px;
          min-width: 36px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          background: var(--ed-chip-icon-bg);
          transition: background 0.18s ease;
        }

        .objchip.on .objchip-icon {
          background: var(--ed-chip-on-icon-bg);
          color: inherit;
        }

        .objchip-icon ha-icon {
          --mdc-icon-size: 18px;
          color: inherit;
          width: 18px;
          height: 18px;
          display: block;
        }

        .objchip-label {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: inherit;
        }

        .objchip-check {
          display: none;
        }

        .objchip ha-checkbox {
          --mdc-checkbox-unchecked-color: var(--ed-chip-border);
          pointer-events: none;
          justify-self: end;
        }

        /* Nieuwe styles voor custom filters */
        .custom-filter-add {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 16px;
        }

        .custom-filter-add .ed-input {
          flex: none;
          width: 100%;
        }

        .custom-filter-add ha-icon-picker {
          width: 100%;
          display: block;
          --mdc-text-field-fill-color: var(--ed-input-bg);
          --mdc-text-field-ink-color: var(--ed-text);
          --mdc-text-field-label-ink-color: var(--ed-text2);
          --mdc-text-field-idle-line-color: var(--ed-input-border);
          --mdc-text-field-hover-line-color: var(--ed-input-border);
          --mdc-theme-primary: var(--primary-color);
        }

        .custom-filter-add .actionbtn {
          width: 100%;
          justify-content: center;
        }

        .custom-filter-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-top: 12px;
        }

        .custom-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 4px 8px 4px 12px;
          background: var(--ed-row-bg);
          border: 1px solid var(--ed-row-border);
          border-radius: 10px;
          min-height: 48px;
        }

        .custom-item-info {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 14px;
          font-weight: 500;
          color: var(--ed-text);
        }

        .custom-item-info ha-icon {
          --mdc-icon-size: 20px;
          color: var(--primary-color);
        }

        .remove-btn {
          color: var(--ed-invalid);
          cursor: pointer;
          background: none;
          border: none;
          padding: 8px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .remove-btn:hover {
          background: color-mix(in srgb, var(--ed-invalid) 12%, transparent);
        }

        .remove-btn ha-icon {
          --mdc-icon-size: 18px;
        }


        .objchip-color {
          display: flex;
          align-items: center;
          justify-self: center;
          gap: 4px;
        }

        .objchip-color .cgc-color {
          width: 26px;
          height: 22px;
          min-width: 26px;
          flex: 0 0 26px;
        }

        .objchip-color .color-reset {
          width: 16px;
          height: 16px;
          margin-left: 0;
        }

        .objchip-color .color-reset ha-icon {
          --mdc-icon-size: 13px;
        }

        .cgc-color {
          width: 42px;
          height: 28px;
          min-width: 42px;
          flex: 0 0 42px;
          padding: 0;
          border: 1px solid var(--ed-input-border);
          border-radius: 6px;
          background: none;
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
          position: relative;
          z-index: 2;
        }

        .cgc-color:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }

        .cgc-color::-webkit-color-swatch-wrapper {
          padding: 0;
        }

        .cgc-color::-webkit-color-swatch {
          border: none;
          border-radius: 6px;
        }

        .subrows {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 8px;
        }

        .lbl.sub {
          font-size: 14px;
          font-weight: 500;
          opacity: 0.95;
        }

        .objmeta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 2px;
        }

        .countpill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          border-radius: var(--ed-radius-pill);
          background: var(--ed-input-bg);
          border: 1px solid var(--ed-input-border);
          color: var(--ed-text);
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.02em;
        }

        .browser-backdrop {
          position: fixed;
          inset: 0;
          background: var(--ed-backdrop);
          backdrop-filter: blur(10px) saturate(120%);
          -webkit-backdrop-filter: blur(10px) saturate(120%);
          z-index: 9998;
        }

        .browser-modal {
          position: fixed;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: min(92vw, 760px);
          max-height: min(84vh, 760px);
          background: var(--card-background-color, #fff);
          color: var(--ed-text);
          border: 1px solid var(--ed-sugg-border);
          border-radius: 20px;
          box-shadow: var(--ed-shadow-modal);
          z-index: 9999;
          display: grid;
          grid-template-rows: auto auto minmax(0, 1fr);
          overflow: hidden;
        }

        .browser-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          padding: 18px 18px 14px;
          border-bottom: 1px solid var(--ed-row-border);
        }

        .browser-head-copy {
          min-width: 0;
          display: grid;
          gap: 6px;
        }

        .browser-title {
          font-size: 16px;
          font-weight: 1000;
          line-height: 1.2;
        }

        .browser-path {
          font-size: 12px;
          color: var(--ed-text2);
          line-height: 1.45;
          word-break: break-word;
          overflow-wrap: anywhere;
        }

        .browser-iconbtn {
          appearance: none;
          -webkit-appearance: none;
          width: 38px;
          height: 38px;
          min-width: 38px;
          border-radius: 12px;
          border: 1px solid var(--ed-input-border);
          background: var(--ed-input-bg);
          color: var(--ed-text);
          display: grid;
          place-items: center;
          cursor: pointer;
        }

        .browser-iconbtn ha-icon {
          --mdc-icon-size: 18px;
          width: 18px;
          height: 18px;
        }

        .browser-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 14px 18px;
          border-bottom: 1px solid var(--ed-row-border);
          flex-wrap: wrap;
        }

        .browser-btn {
          appearance: none;
          -webkit-appearance: none;
          border: 1px solid var(--ed-input-border);
          background: var(--ed-input-bg);
          color: var(--ed-text);
          border-radius: 12px;
          min-height: 40px;
          padding: 0 14px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 900;
        }

        .browser-btn.primary {
          background: var(--ed-seg-on-bg);
          color: var(--ed-seg-on-txt);
          border-color: transparent;
        }

        .browser-btn.disabled,
        .browser-btn:disabled {
          opacity: 0.45;
          cursor: default;
        }

        .browser-btn ha-icon {
          --mdc-icon-size: 18px;
          width: 18px;
          height: 18px;
        }

        .browser-body {
          min-height: 0;
          overflow: auto;
          padding: 14px 18px 18px;
          overscroll-behavior: contain;
        }

        .browser-list {
          display: grid;
          gap: 10px;
        }

        .browser-item {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
          padding: 10px;
          border-radius: 16px;
          background: var(--ed-row-bg);
          border: 1px solid var(--ed-row-border);
        }

        .browser-open {
          appearance: none;
          -webkit-appearance: none;
          border: 0;
          background: transparent;
          color: var(--ed-text);
          text-align: left;
          min-width: 0;
          padding: 0;
          cursor: pointer;
          display: grid;
          grid-template-columns: 40px minmax(0, 1fr);
          gap: 12px;
          align-items: center;
        }

        .browser-open-icon {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          background: var(--ed-input-bg);
          border: 1px solid var(--ed-input-border);
        }

        .browser-open-icon ha-icon {
          --mdc-icon-size: 20px;
          width: 20px;
          height: 20px;
        }

        .browser-open-copy {
          min-width: 0;
          display: grid;
          gap: 4px;
        }

        .hint-block {
          display: grid;
          gap: 8px;
          align-items: start;
        }

        .hint-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: var(--ed-text2);
        }

        .vars-list {
          display: grid;
          gap: 6px;
          padding-left: 22px;
        }

        .vars-list div {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          line-height: 1.45;
        }

        .vars-list code {
          opacity: 1;
        }

        .vars-list span {
          color: var(--ed-text2);
        }

        .browser-open-title {
          font-size: 13px;
          font-weight: 950;
          color: var(--ed-text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .browser-open-sub {
          font-size: 11px;
          color: var(--ed-text2);
          line-height: 1.35;
          word-break: break-word;
          overflow-wrap: anywhere;
        }

        .browser-select {
          appearance: none;
          -webkit-appearance: none;
          border: 1px solid var(--ed-input-border);
          background: var(--ed-input-bg);
          color: var(--ed-text);
          border-radius: 12px;
          min-height: 38px;
          padding: 0 12px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 900;
          white-space: nowrap;
        }

        .color-transparent {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 800;
          color: var(--ed-text2);
          cursor: pointer;
        }

        .color-transparent input {
          cursor: pointer;
        }

        .style-sections {
          display: grid;
          gap: 8px;
        }

        .style-section {
          border: 1px solid var(--ed-row-border);
          border-radius: 12px;
          overflow: hidden;
          background: var(--ed-row-bg);
        }

        .style-section-head {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          cursor: pointer;
          list-style: none;
          font-size: 13px;
          font-weight: 800;
          color: var(--ed-text);
          user-select: none;
        }

        .style-section-head::-webkit-details-marker { display: none; }

        .style-section-head ha-icon:first-child {
          --mdc-icon-size: 18px;
          color: var(--ed-text2);
          flex: 0 0 auto;
        }

        .style-section-head > span {
          flex: 1 1 auto;
        }

        .style-chevron {
          --mdc-icon-size: 18px;
          color: var(--ed-text2);
          flex: 0 0 auto;
          transition: transform 0.2s ease;
        }

        details[open] .style-chevron {
          transform: rotate(180deg);
        }

        .style-section-body {
          padding: 4px 14px 14px;
          border-top: 1px solid var(--ed-row-border);
        }

        .radius-range {
          width: 90px;
          cursor: pointer;
          accent-color: var(--primary-color, #03a9f4);
        }

        .radius-value {
          font-size: 12px;
          font-weight: 800;
          color: var(--ed-text2);
          min-width: 34px;
          text-align: right;
        }

        .browser-empty {
          display: grid;
          place-items: center;
          min-height: 180px;
          font-size: 13px;
          font-weight: 800;
          color: var(--ed-text2);
          text-align: center;
          padding: 20px;
        }

        @media (max-width: 900px) {
          .tabbar {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          .row-head {
            align-items: stretch;
            flex-direction: column;
          }

          .togrow {
            justify-content: space-between;
            width: 100%;
          }

          .panelhead {
            gap: 12px;
          }

          .panelicon {
            width: 38px;
            height: 38px;
            min-width: 38px;
          }

          .browser-modal {
            width: min(96vw, 760px);
            max-height: min(88vh, 760px);
          }

          .browser-item {
            grid-template-columns: 1fr;
          }

          .browser-select {
            width: 100%;
          }


        }

        .cgc-wizard { margin-top: 8px; }
        .cgc-wizard-toggle {
          width: 100%; text-align: left; background: none;
          border: 1px dashed var(--divider-color, #555);
          color: var(--secondary-text-color); border-radius: 6px;
          padding: 5px 10px; cursor: pointer; font-size: 12px;
        }
        .cgc-wizard-toggle:hover { border-color: var(--primary-color); color: var(--primary-color); }
        .cgc-wizard-body { margin-top: 8px; display: flex; flex-direction: column; gap: 8px; }
        .cgc-wizard-row { display: flex; flex-direction: column; gap: 2px; }
        .cgc-wizard-row label { font-size: 12px; font-weight: 500; }
        .cgc-wizard-hint { font-size: 11px; color: var(--secondary-text-color); }
        .cgc-wizard-prefix { font-size: 13px; color: var(--ed-text); white-space: nowrap; }
        .cgc-wizard-folder-row { display: flex; align-items: center; gap: 4px; }
        .ed-input {
          flex: 1;
          height: 36px;
          padding: 0 10px;
          box-sizing: border-box;
          font-size: 13px;
          font-family: inherit;
          font-weight: 800;
          color: var(--ed-text);
          background: var(--ed-input-bg);
          border: 1px solid var(--ed-input-border);
          border-radius: var(--ed-radius-input);
          outline: none;
          width: 100%;
          transition: border-color 0.16s ease, box-shadow 0.16s ease;
          box-shadow: var(--ed-section-glow);
        }
        .ed-input:focus { border-color: color-mix(in srgb, var(--ed-input-border) 25%, var(--primary-color, #03a9f4) 75%); box-shadow: 0 0 0 3px var(--ed-focus-ring), var(--ed-section-glow); }
        .ed-input-row { display: flex; align-items: center; gap: 6px; }
        .ed-suffix { font-size: 12px; color: var(--ed-text2); white-space: nowrap; }
        .cgc-wizard-btn {
          background: var(--primary-color); color: white;
          border: none; border-radius: 6px; padding: 6px 14px;
          cursor: pointer; font-size: 13px; align-self: flex-start;
        }
        .cgc-wizard-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .cgc-wizard-link {
          font-size: 11px; color: var(--primary-color, #03a9f4);
          text-decoration: none; opacity: 0.75; margin-left: 6px;
        }
        .cgc-wizard-link:hover { opacity: 1; text-decoration: underline; }
        .cgc-wizard-success {
          font-size: 12px; color: var(--success-color, #4caf50);
          background: rgba(76,175,80,0.1); border-radius: 6px; padding: 8px;
        }
        .cgc-wizard-error {
          font-size: 12px; color: var(--error-color, #f44336);
          background: rgba(244,67,54,0.1); border-radius: 6px; padding: 8px;
        }
        .cgc-inline-warn {
          font-size: 11.5px; color: var(--ed-warning, rgba(245,158,11,0.95));
          background: var(--ed-warning-bg); border: 1px solid var(--ed-warning-border);
          border-radius: 6px; padding: 6px 8px; margin-top: 6px;
          display: flex; align-items: flex-start; gap: 6px;
        }
        .cgc-inline-warn ha-icon { flex-shrink: 0; --mdc-icon-size: 14px; margin-top: 1px; }
      </style>

      <div class="wrap" style="${rootVars}">
        <div class="tabs">
          <div class="tabbar">
            ${tabBtn("general", "General", "mdi:cog-outline")}
            ${tabBtn("viewer", "Viewer", "mdi:image-outline")}
            ${tabBtn("live", "Live", "mdi:video-outline")}
            ${tabBtn("thumbs", "Thumbnails", "mdi:view-grid-outline")}
            ${tabBtn("styling", "Styling", "mdi:palette-outline")}
          </div>

          ${
            this._activeTab === "general"
              ? `
            <div class="tabpanel" data-panel="general">
              <div class="row">
                <div class="lbl">Source mode</div>
                <div class="segwrap">
                  <button class="seg ${sensorModeOn ? "on" : ""}" data-src="sensor">File sensor</button>
                  <button class="seg ${mediaModeOn ? "on" : ""}" data-src="media">Media folders</button>
                </div>
              </div>

              <div class="row ${sensorModeOn ? "" : "muted"}">
                <div class="lbl">File sensors</div>
                <div class="desc">Enter <b>one</b> sensor per line</div>

                <div class="field" id="entities-field">
                  <textarea
                    id="entities"
                    rows="4"
                    ${sensorModeOn ? "" : "disabled"}
                    placeholder="sensor.gallery_auto&#10;sensor.gallery_muis"
                  ></textarea>
                  <div class="suggestions" id="entities-suggestions" hidden></div>
                </div>

                ${
                  invalidEntities.length
                    ? `<div class="desc">⚠️ Invalid / missing sensor(s): <code>${invalidEntities.join(
                        "</code>, <code>"
                      )}</code></div>`
                    : ``
                }

                ${sensorModeOn ? this._renderFilesWizard() : ""}
              </div>

              ${sensorModeOn ? `
              <div class="row">
                <div class="lbl">Filename datetime format</div>
                <div class="desc">
                  Optional custom parser for date and time found in filenames.
                </div>

                <input type="text" class="ed-input" id="filenamefmt" placeholder="YYYYMMDDHHmmss" />

                <div class="hint">
                  <ha-icon icon="mdi:information-outline"></ha-icon>
                  Examples:
                  <code>YYYYMMDDHHmmss</code>,
                  <code>DD-MM-YYYY_HH-mm-ss</code>,
                  <code>YYYY-MM-DDTHH:mm:ss</code>
                </div>
              </div>
              ` : ""}

              <div class="row ${mediaModeOn ? "" : "muted"}">
                <div class="lbl">Media folders</div>
                <div class="desc">Enter <strong>one</strong> folder per line, or browse and select folders</div>

                <div class="field" id="mediasources-field">
                  <textarea
                    id="mediasources"
                    rows="4"
                    placeholder="media-source://frigate/frigate/event-search/clips"
                    ${mediaModeOn ? "" : "disabled"}
                  ></textarea>
                  <div class="suggestions" id="mediasources-suggestions" hidden></div>
                </div>

                <div class="row-actions">
                  <button
                    type="button"
                    class="actionbtn"
                    id="browse-media-folders"
                    ${mediaModeOn ? "" : "disabled"}
                  >
                    <ha-icon icon="mdi:folder-search-outline"></ha-icon>
                    <span>Browse</span>
                  </button>

                  <button
                    type="button"
                    class="actionbtn"
                    id="clear-media-folders"
                    ${mediaModeOn ? "" : "disabled"}
                  >
                    <ha-icon icon="mdi:delete-outline"></ha-icon>
                    <span>Clear</span>
                  </button>
                </div>

                ${
                  mediaHasFile
                    ? `<div class="desc">⚠️ One of your entries looks like a file (extension). This field expects folders.</div>`
                    : ``
                }
              </div>

              <div class="row">
                <div class="lbl">Delete service</div>
                <div class="hint">
                  <ha-icon icon="mdi:help-circle-outline"></ha-icon>
                  <a
                    href="https://github.com/TheScubadiver/camera-gallery-card?tab=readme-ov-file#delete-setup"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    How to configure the shell command
                  </a>
                </div>

                <div class="selectwrap">
                  <select class="select ${deleteOk ? "" : "invalid"}" id="delservice">
                    ${
                      deleteChoices.length
                        ? `<option value=""></option>` +
                          deleteChoices
                            .map(
                              (id) =>
                                `<option value="${id}" ${
                                  id === deleteService ? "selected" : ""
                                }>${id}</option>`
                            )
                            .join("")
                        : `<option value="" selected>(no shell_command services found)</option>`
                    }
                  </select>
                  <span class="selarrow"></span>
                </div>
              </div>
            </div>
          `
              : ``
          }

          ${
            this._activeTab === "viewer"
              ? `
            <div class="tabpanel" data-panel="viewer">
              <div class="row">
                <div class="lbl">Height</div>
                <div class="ed-input-row"><input type="number" class="ed-input" id="height" /><span class="ed-suffix">px</span></div>
              </div>

              <div class="row">
                <div class="lbl">Image fit</div>
                <div class="segwrap">
                  <button class="seg ${objectFit === "cover" ? "on" : ""}" data-objfit="cover">Cover</button>
                  <button class="seg ${objectFit === "contain" ? "on" : ""}" data-objfit="contain">Contain</button>
                </div>
              </div>

              <div class="row">
                <div class="lbl">Position</div>
                <div class="segwrap">
                  <button class="seg ${previewPos === "top" ? "on" : ""}" data-ppos="top">Top</button>
                  <button class="seg ${previewPos === "bottom" ? "on" : ""}" data-ppos="bottom">Bottom</button>
                </div>
              </div>

              <div class="row">
                <div class="row-head">
                  <div>
                    <div class="lbl">Open-on-click</div>
                    <div class="desc">
                      Only show the main viewer after selecting a thumbnail. Click on the preview to close
                    </div>
                  </div>

                  <div class="togrow">
                    <ha-switch id="clicktoopen" ${clickToOpen ? "checked" : ""}></ha-switch>
                  </div>
                </div>
              </div>

              <div class="row">
                <div class="subrows">
                  <div class="row-head">
                    <div class="lbl">Autoplay</div>
                    <div class="togrow">
                      <ha-switch id="autoplay"></ha-switch>
                    </div>
                  </div>

                  <div class="row-head">
                    <div class="lbl">Auto muted</div>
                    <div class="togrow">
                      <ha-switch id="auto_muted"></ha-switch>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          `
              : ``
          }

          ${
            this._activeTab === "live"
              ? `
            <div class="tabpanel" data-panel="live">
              <div class="row ${liveControlsDisabled ? "muted" : ""}">
                <div class="row-head">
                  <div class="lbl">Live preview</div>

                  <div class="togrow">
                    <ha-switch
                      id="liveenabled"
                      ${liveEnabled ? "checked" : ""}
                      ${liveControlsDisabled ? "disabled" : ""}
                    ></ha-switch>
                  </div>
                </div>

                <div class="desc">
                  Enable live mode in the gallery preview. All available camera entities are detected automatically.
                </div>
              </div>

              ${
                liveEnabled
                  ? `
                ${cameraEntities.length > 1 ? `
                <div class="row">
                  <div class="lbl">Visible cameras in picker</div>
                  <div class="desc">Select cameras for the picker. Leave empty to show all cameras.</div>
                  ${liveCameraEntities.length > 0 ? `
                  <div class="livecam-tags" id="livecam-tags-dnd">
                    ${liveCameraEntities.map((id, i) => {
                      const name = String(this._hass?.states?.[id]?.attributes?.friendly_name || id).trim();
                      return `<div class="livecam-tag" draggable="true" data-dragcam="${id}"><span class="livecam-tag-grip">⠿</span><span class="livecam-tag-num">${i + 1}</span><span>${name}</span><span class="livecam-tag-entity">${id}</span><button type="button" class="livecam-tag-del" data-delcam="${id}">×</button></div>`;
                    }).join("")}
                  </div>
                  ` : ``}
                  <div class="field" style="margin-top:6px;">
                    <input type="text" class="ed-input" id="livecam-input" placeholder="Search cameras..." autocomplete="off" />
                    <div class="suggestions" id="livecam-suggestions" hidden></div>
                  </div>
                </div>
                ` : ``}

                <div class="row ${liveControlsDisabled ? "muted" : ""}">
                  <div class="lbl">Default live camera</div>
                  <div class="desc">Optional. This sets the default camera when live mode opens.</div>
                  ${liveCameraEntity ? `
                  <div class="livecam-tags">
                    <div class="livecam-tag"><span>${String(this._hass?.states?.[liveCameraEntity]?.attributes?.friendly_name || liveCameraEntity).trim()}</span><span class="livecam-tag-entity">${liveCameraEntity}</span><button type="button" class="livecam-tag-del" data-deldefcam="${liveCameraEntity}">×</button></div>
                  </div>
                  ${liveCameraEntities.length > 0 && !liveCameraEntities.includes(liveCameraEntity) ? `
                  <div class="cgc-inline-warn"><ha-icon icon="mdi:alert-outline"></ha-icon><span>This camera is not in the visible cameras list. It will not appear in the picker.</span></div>
                  ` : ``}
                  ` : ``}
                  ${!liveControlsDisabled ? `
                  <div class="field" style="margin-top:6px;">
                    <input type="text" class="ed-input" id="livedefault-input" placeholder="Search cameras..." autocomplete="off" ${liveCameraEntity ? `style="display:none;"` : ``} />
                    <div class="suggestions" id="livedefault-suggestions" hidden></div>
                  </div>
                  ` : ``}
                </div>
              `
                  : ``
              }

              <div class="row">
                <div class="row-head">
                  <div class="lbl">Auto muted</div>
                  <div class="togrow">
                    <ha-switch id="live_auto_muted"></ha-switch>
                  </div>
                </div>
              </div>

            </div>
          `
              : ``
          }

          ${
            this._activeTab === "thumbs"
              ? `
            <div class="tabpanel" data-panel="thumbs">
              <div class="row">
                <div class="lbl">Thumbnail layout</div>
                <div class="desc">Choose how thumbnails are displayed inside the card</div>
                <div class="segwrap">
                  <button class="seg ${thumbLayout === "horizontal" ? "on" : ""}" data-tlayout="horizontal">Horizontal</button>
                  <button class="seg ${thumbLayout === "vertical" ? "on" : ""}" data-tlayout="vertical">Vertical</button>
                </div>
              </div>

              <div class="row ${thumbSizeMuted ? "muted" : ""}">
                <div class="lbl">Thumbnail size</div>
                <div class="desc">Set the size of each thumbnail in pixels</div>
                <div class="ed-input-row"><input type="number" class="ed-input" id="thumb" /><span class="ed-suffix">px</span></div>
              </div>

              <div class="row">
                <div class="lbl">Maximum thumbnails shown</div>
                <div class="desc">Maximum number of media items loaded into the gallery</div>
                <div class="ed-input-row"><input type="number" class="ed-input" id="maxmedia" /><span class="ed-suffix">items</span></div>
              </div>

              <div class="row">
                <div class="lbl">Thumbnail bar position</div>
                <div class="desc">Choose where the info bar on each thumbnail is shown</div>
                <div class="segwrap">
                  <button class="seg ${thumbBarPos === "top" ? "on" : ""}" data-tbpos="top">Top</button>
                  <button class="seg ${thumbBarPos === "bottom" ? "on" : ""}" data-tbpos="bottom">Bottom</button>
                  <button class="seg ${thumbBarPos === "hidden" ? "on" : ""}" data-tbpos="hidden">Hidden</button>
                </div>
              </div>

              <div class="row">
                <div class="lbl">Pill position</div>
                <div class="segwrap">
                  <button class="seg ${tsPos === "top" ? "on" : ""}" data-pos="top">Top</button>
                  <button class="seg ${tsPos === "bottom" ? "on" : ""}" data-pos="bottom">Bottom</button>
                  <button class="seg ${tsPos === "hidden" ? "on" : ""}" data-pos="hidden">Hidden</button>
                </div>
              </div>

              <div class="row ${barDisabled ? "muted" : ""}">
                <div class="lbl">Opacity pill</div>
                <div class="barrow">
                  <div class="barrow-top">
                    <div class="pillval" id="barval">${barOpacity}%</div>
                  </div>
                  <ha-slider id="barop" min="0" max="100" step="1" ${barDisabled ? "disabled" : ""}></ha-slider>
                </div>
              </div>

              <div class="row ${barDisabled ? "muted" : ""}">
                <div class="lbl">Pill size</div>
                <div class="barrow">
                  <div class="barrow-top">
                    <div class="pillval" id="pillsizeval">${pillSize}px</div>
                  </div>
                  <ha-slider id="pillsize" min="10" max="28" step="1" ${barDisabled ? "disabled" : ""}></ha-slider>
                </div>
              </div>

              <div class="row">
                <div class="lbl">Object filters</div>
                <div class="objmeta">
                  <div class="desc">Choose which filter chips are available on the card</div>
                  <div class="countpill">Selected ${selectedCount}/${MAX_VISIBLE_OBJECT_FILTERS}</div>
                </div>

                <div class="chip-grid">
                  ${AVAILABLE_OBJECT_FILTERS
                    .map((obj) => {
                      const isOn = objectFiltersArr.includes(obj);
                      const currentColor = objectColors[obj] || "";
                      const colorVal = currentColor && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(currentColor) ? currentColor : "#ffffff";
                      return `
                      <button
                        type="button"
                        class="objchip ${isOn ? "on" : ""}"
                        data-objchip="${obj}"
                        title="${this._objectLabel(obj)}"
                      >
                        <span class="objchip-icon">
                          <ha-icon icon="${this._objectIcon(obj)}" style="${currentColor ? "color:" + currentColor : ""}"></ha-icon>
                        </span>
                        <span class="objchip-color">
                          <input type="color" class="cgc-color" value="${colorVal}" style="${!currentColor ? "opacity:0.35" : ""}" data-filtercolor="${obj}">
                        </span>
                        <ha-checkbox ${isOn ? "checked" : ""} tabindex="-1" style="pointer-events:none;"></ha-checkbox>
                      </button>
                    `;
                    })
                    .join("")}
                </div>

              <div class="row">
                <div class="lbl">Custom Object Filters</div>
                  <div class="desc">Add custom object filters and icons (e.g., parcel, woman, etc.)</div>
                  
                  <div class="custom-filter-add">
                    <input type="text" class="ed-input" id="new-filter-name" placeholder="e.g. parcel" />
                    <ha-icon-picker id="new-filter-icon" label="Icon"></ha-icon-picker>
                    <button class="actionbtn" id="add-filter-btn">
                      <ha-icon icon="mdi:plus"></ha-icon>
                      Add filter
                    </button>
                  </div>

                <div class="custom-filter-list">
                  ${objectFiltersArr.filter(f => typeof f === 'object').map((f, index) => {
                    const name = Object.keys(f)[0];
                    const icon = f[name];
                    const currentColor = objectColors[name] || "";
                    const colorVal = currentColor && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(currentColor) ? currentColor : "#ffffff";
                    return `
                      <div class="custom-item">
                        <div class="custom-item-info">
                          <ha-icon icon="${icon}" style="${currentColor ? "color:" + currentColor : ""}"></ha-icon>
                          <span class="lbl">${this._objectLabel(name)}</span>
                        </div>
                        <div class="color-controls">
                          <input type="color" class="cgc-color" value="${colorVal}" style="${!currentColor ? "opacity:0.35" : ""}" data-filtercolor="${name}">
                          <button class="remove-btn" data-remove-index="${name}">
                            <ha-icon icon="mdi:delete-outline"></ha-icon>
                          </button>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>

              </div>
            </div>
          `
              : ``
          }

          ${
            this._activeTab === "styling"
              ? `
              <div class="tabpanel" data-panel="styling">
                <div class="style-sections">
                  ${STYLE_SECTIONS.map((section) => `
                    <details
                      class="style-section"
                      id="style-section-${section.id}"
                      ${this._openStyleSections.has(section.id) ? "open" : ""}
                    >
                      <summary class="style-section-head">
                        <ha-icon icon="${section.icon}"></ha-icon>
                        <span>${section.label}</span>
                        <ha-icon class="style-chevron" icon="mdi:chevron-down"></ha-icon>
                      </summary>
                      <div class="style-section-body">
                        <div class="color-grid">
                          ${section.controls.map((ctrl) => {
                            if (ctrl.type === "color") {
                              return `
                                <div class="color-row">
                                  <div class="lbl">${ctrl.label}</div>
                                  <div class="color-controls">
                                    <div id="${ctrl.hostId}"></div>
                                    <label class="color-transparent">
                                      <input type="checkbox" data-transparent="${ctrl.variable}">
                                      Transparent
                                    </label>
                                    <button type="button" class="color-reset" data-reset="${ctrl.variable}" title="Reset to default">
                                      <ha-icon icon="mdi:backup-restore"></ha-icon>
                                    </button>
                                  </div>
                                </div>
                              `;
                            }
                            if (ctrl.type === "radius") {
                              const raw = this._getStyleVariableValue(ctrl.variable);
                              const val = raw ? parseInt(raw) : ctrl.default;
                              const safeId = ctrl.variable.replace(/[^a-z0-9]/gi, "-");
                              return `
                                <div class="color-row">
                                  <div class="lbl">${ctrl.label}</div>
                                  <div class="color-controls">
                                    <input
                                      type="range"
                                      class="radius-range"
                                      data-radius="${ctrl.variable}"
                                      min="${ctrl.min}"
                                      max="${ctrl.max}"
                                      value="${val}"
                                    >
                                    <span class="radius-value" id="radius-val-${safeId}">${val}px</span>
                                    <button type="button" class="color-reset" data-reset="${ctrl.variable}" title="Reset to default">
                                      <ha-icon icon="mdi:backup-restore"></ha-icon>
                                    </button>
                                  </div>
                                </div>
                              `;
                            }
                            return "";
                          }).join("")}
                        </div>
                      </div>
                    </details>
                  `).join("")}
                </div>
              </div>
            `
              : ``
          }

        </div>
      </div>

      ${mediaBrowserHtml}
    `;

    const $ = (id) => this.shadowRoot.getElementById(id);

        // 1. Zoek de elementen op
        const addBtn = $("add-filter-btn");
        const nameInput = $("new-filter-name");
        const iconInput = $("new-filter-icon");
        if (iconInput && this._hass) iconInput.hass = this._hass;

        // 2. Maak een herbruikbare functie voor het toevoegen
        const handleAddFilter = () => {
          const name = nameInput?.value.trim().toLowerCase();
          const icon = iconInput?.value.trim() || "mdi:magnify";

          if (!name) return;

          // Haal huidige filters op
          const currentFilters = this._normalizeObjectFilters(this._config.object_filters || []);
          const newFilter = { [name]: icon };
          
          // Sla op in de config
          this._set("object_filters", [...currentFilters, newFilter]);
          
          // Maak velden leeg
          if (nameInput) nameInput.value = "";
          if (iconInput) iconInput.value = "";
        };

        // 3. Koppel de Click listener aan de knop
        addBtn?.addEventListener("click", handleAddFilter);

        // 4. Enter op naam-veld voegt toe; ha-icon-picker gebruikt value-changed (geen keydown)
        nameInput?.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); handleAddFilter(); }
        });

    // Filter verwijderen
    this.shadowRoot.querySelectorAll("[data-remove-index]").forEach(btn => {
      btn.addEventListener("click", () => {
        const nameToRemove = btn.dataset.removeIndex;
        const currentFilters = this._normalizeObjectFilters(this._config.object_filters || []);
        
        const nextFilters = currentFilters.filter(f => {
           if (typeof f === 'string') return f !== nameToRemove;
           return Object.keys(f)[0] !== nameToRemove;
        });

        this._set("object_filters", nextFilters);
      });
    });

    this.shadowRoot.querySelectorAll("[data-filtercolor]").forEach(input => {
      input.addEventListener("click", (e) => e.stopPropagation());
      input.addEventListener("change", (e) => {
        e.stopPropagation();
        const name = input.dataset.filtercolor;
        const colors = { ...(this._config.object_colors || {}), [name]: e.target.value };
        this._set("object_colors", colors);
      });
    });

    const entitiesEl = $("entities");
    const mediaEl = $("mediasources");
    const filenameFmtEl = $("filenamefmt");
    const delserviceEl = $("delservice");
    const heightEl = $("height");
    const thumbEl = $("thumb");
    const maxmediaEl = $("maxmedia");
    const baropEl = $("barop");
    const barvalEl = $("barval");
    const pillsizeEl = $("pillsize");
    const pillsizevalEl = $("pillsizeval");

    const autoplayEl = $("autoplay");
    const autoMutedEl = $("auto_muted");
    const liveAutoMutedEl = $("live_auto_muted");

    this._setControlValue(entitiesEl, entitiesText);
    this._setControlValue(mediaEl, mediaSourcesText);
    this._setControlValue(filenameFmtEl, filenameDatetimeFormat);
    this._setControlValue(heightEl, String(height));
    this._setControlValue(thumbEl, String(thumbSize));
    this._setControlValue(maxmediaEl, String(maxMedia));
    this._setControlValue(baropEl, barOpacity);
    this._setControlValue(pillsizeEl, pillSize);
    if (autoplayEl) autoplayEl.checked = autoplay;
    if (autoMutedEl) autoMutedEl.checked = autoMuted;
    if (liveAutoMutedEl) liveAutoMutedEl.checked = liveAutoMuted;

    if (delserviceEl) delserviceEl.value = deleteService;

    this._applyFieldValidation("entities");
    this._applyFieldValidation("mediasources");

    this._bindColorControls();
    this._bindWizardEvents();

    this.shadowRoot.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => this._setActiveTab(btn.dataset.tab));
    });

    this.shadowRoot.querySelectorAll("[data-src]").forEach((btn) => {
      btn.addEventListener("click", () =>
        this._set("source_mode", btn.dataset.src)
      );
    });

    const browseBtn = $("browse-media-folders");
    browseBtn?.addEventListener("click", async () => {
      await this._openMediaBrowser("");
    });

    const clearBtn = $("clear-media-folders");
    clearBtn?.addEventListener("click", () => {
      const mediaElInner = $("mediasources");
      if (mediaElInner) mediaElInner.value = "";

      const next = { ...this._config };
      delete next.media_sources;
      delete next.media_source;

      this._config = this._stripAlwaysTrueKeys(next);
      this._fire();
      this._applyFieldValidation("mediasources");
      this._scheduleRender();
    });

    const bindTextarea = (id, commitFn) => {
      const el = $(id);
      if (!el) return;

      el.addEventListener("focus", () => {
        this._updateSuggestions(id);
      });

      el.addEventListener("input", () => {
        commitFn(false);
        this._applyFieldValidation(id);
        this._updateSuggestions(id);
      });

      el.addEventListener("change", () => {
        commitFn(true);
        this._applyFieldValidation(id);
        this._closeSuggestions(id);
      });

      el.addEventListener("blur", () => {
        setTimeout(() => {
          const active = this.shadowRoot?.activeElement;
          const suggBox = this.shadowRoot?.getElementById(`${id}-suggestions`);

          if (active && suggBox && suggBox.contains(active)) return;

          commitFn(true);
          this._applyFieldValidation(id);
          this._closeSuggestions(id);
        }, 120);
      });

      el.addEventListener("keydown", (e) => {
        const state = this._suggestState[id];

        if (state?.open && e.key === "ArrowDown") {
          e.preventDefault();
          this._moveSuggestion(id, 1);
          return;
        }

        if (state?.open && e.key === "ArrowUp") {
          e.preventDefault();
          this._moveSuggestion(id, -1);
          return;
        }

        if (state?.open && e.key === "Tab") {
          if (this._acceptSuggestion(id)) {
            e.preventDefault();
            return;
          }
        }

        if (state?.open && e.key === "Escape") {
          e.preventDefault();
          this._closeSuggestions(id);
          return;
        }
      });
    };

    bindTextarea("entities", this._commitEntities.bind(this));
    bindTextarea("mediasources", this._commitMediaSources.bind(this));

    this.shadowRoot.querySelectorAll("[data-objchip]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._toggleObjectFilter(btn.dataset.objchip);
      });
    });

    const commitDeleteService = () => {
      const v = String(delserviceEl?.value || "").trim();

      if (!v) {
        const next = { ...this._config };
        delete next.delete_service;
        delete next.preview_close_on_tap;
        this._config = this._stripAlwaysTrueKeys(next);
        this._fire();
        this._scheduleRender();
        return;
      }

      this._set("delete_service", v);
    };

    delserviceEl?.addEventListener("change", commitDeleteService);

    const commitNumberField = (key, el, fallback, commit = false) => {
      const raw = String(el?.value ?? "").trim();

      if (raw === "") {
        if (commit) {
          this._set(key, fallback);
        } else {
          this._config = this._stripAlwaysTrueKeys({
            ...this._config,
            [key]: fallback,
          });
        }
        return;
      }

      const n = Number(raw);
      const v = Number.isFinite(n) ? n : fallback;

      if (commit) {
        this._set(key, v);
      } else {
        this._config = this._stripAlwaysTrueKeys({
          ...this._config,
          [key]: v,
        });
      }
    };

    const commitFilenameFormat = (commit = false) => {
      const raw = String(filenameFmtEl?.value ?? "").trim();

      if (!raw) {
        const next = { ...this._config };
        delete next.filename_datetime_format;
        this._config = this._stripAlwaysTrueKeys(next);

        if (commit) {
          this._fire();
          this._scheduleRender();
        }
        return;
      }

      this._config = this._stripAlwaysTrueKeys({
        ...this._config,
        filename_datetime_format: raw,
      });

      if (commit) {
        this._fire();
        this._scheduleRender();
      }
    };

    filenameFmtEl?.addEventListener("input", () => commitFilenameFormat(false));
    filenameFmtEl?.addEventListener("change", () => commitFilenameFormat(true));
    filenameFmtEl?.addEventListener("blur", () => commitFilenameFormat(true));

    heightEl?.addEventListener("input", () =>
      commitNumberField("preview_height", heightEl, 320, false)
    );
    heightEl?.addEventListener("change", () =>
      commitNumberField("preview_height", heightEl, 320, true)
    );
    heightEl?.addEventListener("blur", () =>
      commitNumberField("preview_height", heightEl, 320, true)
    );

    this.shadowRoot.querySelectorAll(".seg[data-objfit]").forEach((btn) => {
      btn.addEventListener("click", () =>
        this._set("object_fit", btn.dataset.objfit)
      );
    });

    this.shadowRoot.querySelectorAll(".seg[data-ppos]").forEach((btn) => {
      btn.addEventListener("click", () =>
        this._set("preview_position", btn.dataset.ppos)
      );
    });

    thumbEl?.addEventListener("input", () =>
      commitNumberField("thumb_size", thumbEl, 140, false)
    );
    thumbEl?.addEventListener("change", () =>
      commitNumberField("thumb_size", thumbEl, 140, true)
    );
    thumbEl?.addEventListener("blur", () =>
      commitNumberField("thumb_size", thumbEl, 140, true)
    );

    const pushMaxMedia = (commit = false) => {
      const raw = String(maxmediaEl?.value ?? "").trim();

      if (raw === "") {
        if (commit) {
          this._set("max_media", 1);
        } else {
          this._config = this._stripAlwaysTrueKeys({
            ...this._config,
            max_media: 1,
          });
        }
        return;
      }

      const n = this._numInt(raw, 1);
      const v = this._clampInt(n, 1, 100);

      if (commit) {
        this._set("max_media", v);
      } else {
        this._config = this._stripAlwaysTrueKeys({
          ...this._config,
          max_media: v,
        });
      }
    };

    maxmediaEl?.addEventListener("input", () => pushMaxMedia(false));
    maxmediaEl?.addEventListener("change", () => pushMaxMedia(true));
    maxmediaEl?.addEventListener("blur", () => pushMaxMedia(true));

    this.shadowRoot.querySelectorAll(".seg[data-tbpos]").forEach((btn) => {
      btn.addEventListener("click", () =>
        this._set("thumb_bar_position", btn.dataset.tbpos)
      );
    });

    this.shadowRoot.querySelectorAll(".seg[data-tlayout]").forEach((btn) => {
      btn.addEventListener("click", () =>
        this._set("thumb_layout", btn.dataset.tlayout)
      );
    });

    $("clicktoopen")?.addEventListener("change", (e) => {
      this._set("preview_click_to_open", !!e.target.checked);
    });

    autoplayEl?.addEventListener("change", (e) => {
      this._set("autoplay", !!e.target.checked);
    });

    autoMutedEl?.addEventListener("change", (e) => {
      this._set("auto_muted", !!e.target.checked);
    });

    liveAutoMutedEl?.addEventListener("change", (e) => {
      this._set("live_auto_muted", !!e.target.checked);
    });

    $("liveenabled")?.addEventListener("change", (e) => {
      const enabled = !!e.target.checked;

      if (enabled) {
        this._set("live_enabled", true);
        return;
      }

      const next = { ...this._config };
      delete next.live_default;
      delete next.live_camera_entity;
      delete next.live_enabled;
      delete next.live_provider;

      this._config = this._stripAlwaysTrueKeys(next);
      this._fire();
      this._scheduleRender();
    });

    // Default live camera tag input (single select)
    const livedefaultInput = $("livedefault-input");
    const livedefaultSugg = $("livedefault-suggestions");

    if (livedefaultInput && livedefaultSugg) {
      const renderDefSuggestions = (items) => {
        if (!items.length) { livedefaultSugg.hidden = true; livedefaultSugg.innerHTML = ""; return; }
        livedefaultSugg.hidden = false;
        livedefaultSugg.innerHTML = `
          <div class="sugg-label">Cameras</div>
          ${items.map((id) => {
            const name = String(this._hass?.states?.[id]?.attributes?.friendly_name || id).trim();
            return `<button type="button" class="sugg-item" data-setdefcam="${id}">${name}<span style="opacity:0.45;font-weight:500;margin-left:6px;">${id}</span></button>`;
          }).join("")}
        `;
        livedefaultSugg.querySelectorAll("[data-setdefcam]").forEach((btn) => {
          btn.addEventListener("mousedown", (e) => {
            e.preventDefault();
            setDefCam(btn.dataset.setdefcam);
          });
        });
      };

      const setDefCam = (id) => {
        if (!id) return;
        this._set("live_camera_entity", id);
        livedefaultInput.value = "";
        livedefaultSugg.hidden = true;
        livedefaultSugg.innerHTML = "";
        this._scheduleRender();
      };

      const getDefSuggestions = () => {
        const q = livedefaultInput.value.trim().toLowerCase();
        return cameraEntities.filter((id) => {
          if (!q) return true;
          const name = String(this._hass?.states?.[id]?.attributes?.friendly_name || id).toLowerCase();
          return name.includes(q) || id.includes(q);
        });
      };

      livedefaultInput.addEventListener("focus", () => renderDefSuggestions(getDefSuggestions()));
      livedefaultInput.addEventListener("input", () => renderDefSuggestions(getDefSuggestions()));
      livedefaultInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const first = livedefaultSugg.querySelector("[data-setdefcam]");
          if (first) setDefCam(first.dataset.setdefcam);
        } else if (e.key === "Escape") {
          livedefaultSugg.hidden = true;
        }
      });
      livedefaultInput.addEventListener("blur", () => {
        setTimeout(() => { livedefaultSugg.hidden = true; }, 150);
      });
    }

    // Camera tag input voor live picker
    const livecamInput = $("livecam-input");
    const livecamSugg = $("livecam-suggestions");

    if (livecamInput && livecamSugg) {
      const renderCamSuggestions = (items) => {
        if (!items.length) { livecamSugg.hidden = true; livecamSugg.innerHTML = ""; return; }
        livecamSugg.hidden = false;
        livecamSugg.innerHTML = `
          <div class="sugg-label">Cameras</div>
          ${items.map((id) => {
            const name = String(this._hass?.states?.[id]?.attributes?.friendly_name || id).trim();
            return `<button type="button" class="sugg-item" data-addcam="${id}">${name}<span style="opacity:0.45;font-weight:500;margin-left:6px;">${id}</span></button>`;
          }).join("")}
        `;
        livecamSugg.querySelectorAll("[data-addcam]").forEach((btn) => {
          btn.addEventListener("mousedown", (e) => {
            e.preventDefault();
            addCam(btn.dataset.addcam);
          });
        });
      };

      const addCam = (id) => {
        if (!id) return;
        const current = Array.isArray(this._config.live_camera_entities)
          ? [...this._config.live_camera_entities] : [];
        if (!current.includes(id)) {
          current.push(id);
          this._set("live_camera_entities", current);
        }
        livecamInput.value = "";
        livecamSugg.hidden = true;
        livecamSugg.innerHTML = "";
        this._scheduleRender();
      };

      const getCamSuggestions = () => {
        const q = livecamInput.value.trim().toLowerCase();
        const selected = Array.isArray(this._config.live_camera_entities) ? this._config.live_camera_entities : [];
        return cameraEntities.filter((id) => {
          if (selected.includes(id)) return false;
          if (!q) return true;
          const name = String(this._hass?.states?.[id]?.attributes?.friendly_name || id).toLowerCase();
          return name.includes(q) || id.includes(q);
        });
      };

      livecamInput.addEventListener("focus", () => renderCamSuggestions(getCamSuggestions()));
      livecamInput.addEventListener("input", () => renderCamSuggestions(getCamSuggestions()));
      livecamInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const first = livecamSugg.querySelector("[data-addcam]");
          if (first) addCam(first.dataset.addcam);
        } else if (e.key === "Escape") {
          livecamSugg.hidden = true;
        }
      });
      livecamInput.addEventListener("blur", () => {
        setTimeout(() => { livecamSugg.hidden = true; }, 150);
      });
    }

    // Default live camera verwijderen
    this.shadowRoot.querySelectorAll("[data-deldefcam]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = { ...this._config };
        delete next.live_camera_entity;
        this._config = this._stripAlwaysTrueKeys(next);
        this._fire();
        this._scheduleRender();
      });
    });

    // Camera tag verwijderen
    this.shadowRoot.querySelectorAll("[data-delcam]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.delcam;
        const current = Array.isArray(this._config.live_camera_entities)
          ? [...this._config.live_camera_entities] : [];
        const idx = current.indexOf(id);
        if (idx >= 0) current.splice(idx, 1);
        if (current.length === 0) {
          const next = { ...this._config };
          delete next.live_camera_entities;
          this._config = next;
          this._fire();
        } else {
          this._set("live_camera_entities", current);
        }
        this._scheduleRender();
      });
    });

    // Drag-and-drop reorder voor live_camera_entities chips (mouse + touch)
    const dndContainer = this.shadowRoot.getElementById("livecam-tags-dnd");
    if (dndContainer) {
      let dragSrcId = null;

      const clearOver = () => dndContainer.querySelectorAll(".dnd-over").forEach((el) => el.classList.remove("dnd-over"));

      const doReorder = (targetId) => {
        if (!dragSrcId || dragSrcId === targetId) return;
        const current = Array.isArray(this._config.live_camera_entities)
          ? [...this._config.live_camera_entities] : [];
        const fromIdx = current.indexOf(dragSrcId);
        const toIdx = current.indexOf(targetId);
        if (fromIdx < 0 || toIdx < 0) return;
        current.splice(fromIdx, 1);
        current.splice(toIdx, 0, dragSrcId);
        this._set("live_camera_entities", current);
        this._scheduleRender();
      };

      dndContainer.querySelectorAll("[data-dragcam]").forEach((chip) => {
        // Mouse drag
        chip.addEventListener("dragstart", (e) => {
          dragSrcId = chip.dataset.dragcam;
          chip.classList.add("dnd-dragging");
          e.dataTransfer.effectAllowed = "move";
        });
        chip.addEventListener("dragend", () => {
          chip.classList.remove("dnd-dragging");
          clearOver();
          dragSrcId = null;
        });
        chip.addEventListener("dragover", (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (chip.dataset.dragcam !== dragSrcId) { clearOver(); chip.classList.add("dnd-over"); }
        });
        chip.addEventListener("dragleave", () => chip.classList.remove("dnd-over"));
        chip.addEventListener("drop", (e) => {
          e.preventDefault();
          clearOver();
          doReorder(chip.dataset.dragcam);
        });

        // Touch drag — alleen starten via grip
        const grip = chip.querySelector(".livecam-tag-grip");
        if (grip) {
          grip.addEventListener("touchstart", (e) => {
            e.preventDefault();
            dragSrcId = chip.dataset.dragcam;
            chip.classList.add("dnd-dragging");
          }, { passive: false });

          grip.addEventListener("touchmove", (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const el = this.shadowRoot.elementFromPoint
              ? this.shadowRoot.elementFromPoint(touch.clientX, touch.clientY)
              : document.elementFromPoint(touch.clientX, touch.clientY);
            const target = el?.closest?.("[data-dragcam]");
            clearOver();
            if (target && target.dataset.dragcam !== dragSrcId) target.classList.add("dnd-over");
          }, { passive: false });

          grip.addEventListener("touchend", (e) => {
            e.preventDefault();
            chip.classList.remove("dnd-dragging");
            const over = dndContainer.querySelector(".dnd-over");
            const targetId = over?.dataset?.dragcam;
            clearOver();
            if (targetId) doReorder(targetId);
            dragSrcId = null;
          }, { passive: false });
        }
      });
    }

    this.shadowRoot.querySelectorAll(".seg[data-pos]").forEach((btn) => {
      btn.addEventListener("click", () =>
        this._set("bar_position", btn.dataset.pos)
      );
    });

    const updateBarVal = (v) => {
      if (barvalEl) barvalEl.textContent = `${v}%`;
    };

    baropEl?.addEventListener("input", (e) => {
      const v = Number(e.target.value);
      updateBarVal(v);
    });

    baropEl?.addEventListener("change", (e) => {
      const v = Number(e.target.value);
      updateBarVal(v);
      this._set("bar_opacity", Number.isFinite(v) ? v : 45);
    });

    const updatePillSizeVal = (v) => {
      if (pillsizevalEl) pillsizevalEl.textContent = `${v}px`;
    };

    pillsizeEl?.addEventListener("input", (e) => {
      updatePillSizeVal(Number(e.target.value));
    });

    pillsizeEl?.addEventListener("change", (e) => {
      const v = Number(e.target.value);
      updatePillSizeVal(v);
      this._set("pill_size", Number.isFinite(v) ? v : 14);
    });

    $("browser-backdrop")?.addEventListener("click", () => {
      this._closeMediaBrowser();
    });

    $("browser-close")?.addEventListener("click", () => {
      this._closeMediaBrowser();
    });

    $("browser-back")?.addEventListener("click", async () => {
      await this._mediaBrowserGoBack();
    });

    $("browser-select-current")?.addEventListener("click", () => {
      if (!this._mediaBrowserPath) return;
      this._appendMediaSourceValue(this._mediaBrowserPath);
      this._closeMediaBrowser();
    });

    this.shadowRoot.querySelectorAll("[data-browser-open]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const nextPath = btn.dataset.browserOpen || "";
        if (!nextPath) return;
        await this._loadMediaBrowser(nextPath, true);
      });
    });

    this.shadowRoot.querySelectorAll("[data-browser-select]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.browserSelect || "";
        if (!value) return;
        this._appendMediaSourceValue(value);
        this._closeMediaBrowser();
      });
    });

    try {
      const fs = this._focusState;
      if (fs && fs.id) {
        const el = $(fs.id);
        if (el && typeof el.focus === "function") {
          if (
            fs.value != null &&
            typeof el.value === "string" &&
            el.value !== fs.value
          ) {
            el.value = fs.value;
          }

          el.focus({ preventScroll: true });

          if (
            fs.start != null &&
            fs.end != null &&
            typeof el.setSelectionRange === "function"
          ) {
            el.setSelectionRange(fs.start, fs.end);
          }
        }
      }
    } catch (_) {}

    this._renderSuggestions("entities");
    this._renderSuggestions("mediasources");
  }

  _renderSuggestions(id) {
    const box = this.shadowRoot?.getElementById(`${id}-suggestions`);
    if (!box) return;

    const state = this._suggestState[id] || {
      open: false,
      items: [],
      index: -1,
    };

    if (!state.open || !state.items.length) {
      box.innerHTML = "";
      box.hidden = true;
      return;
    }

    const activeItem =
      state.index >= 0 && state.items[state.index] ? state.items[state.index] : "";

    box.hidden = false;
    box.innerHTML = `
      <div class="sugg-label">Suggestions</div>
      ${state.items
        .map(
          (item, idx) => `
            <button
              type="button"
              class="sugg-item ${idx === state.index ? "active" : ""}"
              data-sugg-id="${id}"
              data-sugg-value="${item.replace(/"/g, "&quot;")}"
              title="${item.replace(/"/g, "&quot;")}"
            >
              ${item}
            </button>
          `
        )
        .join("")}
      ${
        activeItem
          ? `<div class="sugg-active-path">${activeItem}</div>`
          : ""
      }
    `;

    box.querySelectorAll("[data-sugg-id]").forEach((btn) => {
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this._applySuggestion(id, btn.dataset.suggValue || "");
      });
    });
  }

  _replaceCurrentLine(el, newLine) {
    const info = this._getTextareaLineInfo(el);
    const before = info.value.slice(0, info.lineStart);
    const after = info.value.slice(info.lineEnd);
    const nextValue = before + newLine + after;

    el.value = nextValue;

    const pos = before.length + newLine.length;
    try {
      el.setSelectionRange(pos, pos);
      el.focus({ preventScroll: true });
    } catch (_) {}
  }

  _scheduleRender() {
    this._captureScrollState();

    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => {
      this._render();
      this._restoreScrollState();
    });
  }

  _set(key, value) {
    if (key === "live_provider") return;
    if (key === "preview_close_on_tap") return;

    this._config = { ...this._config, [key]: value };
    this._config = this._stripAlwaysTrueKeys(this._config);

    if (key !== "shell_command" && "shell_command" in this._config) {
      const next = { ...this._config };
      delete next.shell_command;
      this._config = next;
    }

    this._fire();
    this._scheduleRender();
  }

  _setActiveTab(tab) {
    this._activeTab = String(tab || "general");
    this._scheduleRender();
  }

  _setControlValue(el, value) {
    if (!el) return;
    try {
      el.value = value;
    } catch (_) {}
    try {
      if ("_value" in el) el._value = value;
    } catch (_) {}
  }

  setConfig(config) {
    this._config = this._stripAlwaysTrueKeys({ ...(config || {}) });

    if (typeof this._config.autoplay === "undefined") {
      this._config.autoplay = DEFAULT_AUTOPLAY;
    }

    if (typeof this._config.auto_muted === "undefined") {
      this._config.auto_muted = DEFAULT_AUTOMUTED;
    }

    if (typeof this._config.live_auto_muted === "undefined") {
      this._config.live_auto_muted = DEFAULT_LIVE_AUTO_MUTED;
    }

    if ("shell_command" in this._config) {
      const next = { ...this._config };
      delete next.shell_command;
      this._config = next;
    }

    try {
      const cfg = { ...(config || {}) };

      const normArr = (arr) =>
        (arr || [])
          .map(String)
          .map((s) => s.trim())
          .filter(Boolean);

      const entArr = Array.isArray(cfg.entities) ? cfg.entities : null;
      const singleEntity = String(cfg.entity || "").trim();

      const pickedEntities =
        (entArr && normArr(entArr)) || (singleEntity ? [singleEntity] : []);

      const hasEntities =
        Array.isArray(this._config.entities) && this._config.entities.length;

      if (
        !hasEntities &&
        pickedEntities.length &&
        ("entity" in cfg || singleEntity)
      ) {
        const next = { ...this._config, entities: pickedEntities };
        delete next.entity;
        this._config = this._stripAlwaysTrueKeys(next);
        this._fire();
      }

      const msArr = Array.isArray(cfg.media_sources) ? cfg.media_sources : null;
      const favArr = Array.isArray(cfg.media_folders_fav)
        ? cfg.media_folders_fav
        : null;
      const single = String(cfg.media_source || "").trim();

      const pickedMedia =
        (msArr && normArr(msArr)) ||
        (favArr && normArr(favArr)) ||
        (single ? [single] : []);

      const hasMediaSources =
        Array.isArray(this._config.media_sources) &&
        this._config.media_sources.length;

      const hasLegacyMedia =
        "media_folder_favorites" in cfg ||
        "media_folders_fav" in cfg ||
        "media_source" in cfg;

      if (
        !hasMediaSources &&
        pickedMedia.length &&
        (hasLegacyMedia || single)
      ) {
        const next = { ...this._config, media_sources: pickedMedia };
        delete next.media_folder_favorites;
        delete next.media_folders_fav;
        delete next.media_source;
        this._config = this._stripAlwaysTrueKeys(next);
        this._fire();
      }

      const rawObjectFilters = Array.isArray(cfg.object_filters)
        ? cfg.object_filters
        : String(cfg.object_filters || "").trim()
          ? [cfg.object_filters]
          : [];

      const normObjectFilters = this._normalizeObjectFilters(rawObjectFilters);
      const currentObjectFilters = Array.isArray(this._config.object_filters)
        ? this._normalizeObjectFilters(this._config.object_filters)
        : [];

      if (
        JSON.stringify(normObjectFilters) !==
        JSON.stringify(currentObjectFilters)
      ) {
        const next = { ...this._config };
        if (normObjectFilters.length) next.object_filters = normObjectFilters;
        else delete next.object_filters;
        this._config = this._stripAlwaysTrueKeys(next);
        this._fire();
      }

      const thumbLayout = String(cfg.thumb_layout || "").toLowerCase().trim();
      if (thumbLayout === "horizontal" || thumbLayout === "vertical") {
        if (this._config.thumb_layout !== thumbLayout) {
          this._config = this._stripAlwaysTrueKeys({
            ...this._config,
            thumb_layout: thumbLayout,
          });
          this._fire();
        }
      }
    } catch (_) {}

    this._scheduleRender();
  }

  set hass(hass) {
    const prev = this._hass;
    this._hass = hass;

    if (this._mediaBrowserOpen) return;

    const ae = this.shadowRoot?.activeElement;
    const tag = String(ae?.tagName || "").toLowerCase();
    const id = String(ae?.id || "");

    const interacting = !!(
      ae &&
      (tag === "input" ||
        tag === "textarea" ||
        tag === "ha-slider" ||
        id === "entities" ||
        id === "mediasources" ||
        id === "filenamefmt" ||
        id === "height" ||
        id === "thumb" ||
        id === "maxmedia" ||
        id === "new-filter-name" ||
        id === "new-filter-icon")
    );

    if (interacting) return;

    // Alleen renderen als relevante hass-data echt veranderd is
    if (prev) {
      const relevantChanged =
        prev.themes?.darkMode !== hass.themes?.darkMode ||
        JSON.stringify(Object.keys(prev.states).filter(k => k.startsWith("camera.") || k.startsWith("sensor."))) !==
        JSON.stringify(Object.keys(hass.states).filter(k => k.startsWith("camera.") || k.startsWith("sensor.")));

      if (!relevantChanged) return;
    }

    this._scheduleRender();
  }

  _sortUniqueStrings(arr) {
    const out = [];
    const seen = new Set();
    for (const v of arr || []) {
      const s = String(v || "").trim();
      if (!s) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
    return out.sort((a, b) => a.localeCompare(b));
  }

  _sourcesToText(arr) {
    const list = Array.isArray(arr)
      ? arr.map(String).map((s) => s.trim()).filter(Boolean)
      : [];
    return list.join("\n");
  }

  _stripAlwaysTrueKeys(cfg) {
    const next = { ...(cfg || {}) };

    if ("filter_folders_enabled" in next) delete next.filter_folders_enabled;
    if ("live_provider" in next) delete next.live_provider;
    if ("media_folder_favorites" in next) delete next.media_folder_favorites;
    if ("media_folder_filter" in next) delete next.media_folder_filter;
    if ("media_folders_fav" in next) delete next.media_folders_fav;
    if ("preview_close_on_tap" in next) delete next.preview_close_on_tap;

    return next;
  }

  _toRel(media_content_id) {
    return String(media_content_id || "")
      .replace(/^media-source:\/\/media_source\//, "")
      .replace(/^media-source:\/\/media_source/, "")
      .replace(/^media-source:\/\/frigate\//, "frigate/")
      .replace(/^media-source:\/\/frigate/, "frigate")
      .replace(/^media-source:\/\//, "")
      .replace(/^\/+/, "")
      .trim();
  }

  _toggleObjectFilter(value) {
    const v = String(value || "").toLowerCase().trim();
    if (!v) return;
    if (!AVAILABLE_OBJECT_FILTERS.includes(v)) return;

    const current = this._normalizeObjectFilters(
      this._config.object_filters || []
    );
    const set = new Set(current);

    if (set.has(v)) {
      set.delete(v);
    } else {
      set.add(v);
    }

    const nextArr = Array.from(set);
    const next = { ...this._config };

    if (nextArr.length) next.object_filters = nextArr;
    else delete next.object_filters;

    this._config = this._stripAlwaysTrueKeys(next);
    this._fire();
    this._scheduleRender();
  }

  async _updateSuggestions(id) {
    const el = this.shadowRoot?.getElementById(id);
    if (!el) return;

    const info = this._getTextareaLineInfo(el);
    const query = String(info.line || "").trim();

    if (id === "entities") {
      const source = this._collectEntitySuggestions();
      const items = this._filterSuggestions(source, query).filter(
        (v) => String(v).trim() !== query
      );

      const fingerprint = JSON.stringify(items);
      if (this._lastSuggestFingerprint[id] === fingerprint) return;
      this._lastSuggestFingerprint[id] = fingerprint;

      if (!items.length) {
        this._closeSuggestions(id);
        return;
      }

      this._openSuggestions(id, items);
      return;
    }

    if (id === "mediasources") {
      clearTimeout(this._mediaSuggestTimer);

      this._mediaSuggestTimer = setTimeout(async () => {
        const reqId = ++this._mediaSuggestReq;
        const items = (await this._collectMediaSuggestionsDynamic(query)).filter(
          (v) => String(v).trim() !== query
        );

        if (reqId !== this._mediaSuggestReq) return;

        const fingerprint = JSON.stringify(items);
        if (this._lastSuggestFingerprint[id] === fingerprint) return;
        this._lastSuggestFingerprint[id] = fingerprint;

        if (!items.length) {
          this._closeSuggestions(id);
          return;
        }

        this._openSuggestions(id, items);
      }, 120);
    }
  }

  _validateMediaFolders(raw) {
    if (!raw) return "neutral";

    const lines = raw
      .split(/\n|,/g)
      .map((v) => v.trim())
      .filter(Boolean);

    if (!lines.length) return "neutral";

    for (const path of lines) {
      if (!path.startsWith("media-source://")) return "invalid";
      if (/\.(jpg|jpeg|png|mp4|mov|mkv|avi|json|txt)$/i.test(path)) {
        return "invalid";
      }
    }

    return "valid";
  }

  _validateSensors(raw) {
    if (!raw) return "neutral";

    const lines = raw
      .split(/\n|,/g)
      .map((v) => v.trim())
      .filter(Boolean);

    if (!lines.length) return "neutral";

    for (const id of lines) {
      if (!id.startsWith("sensor.")) return "invalid";
      if (!this._hass?.states?.[id]) return "invalid";
    }

    return "valid";
  }

  _renderFilesWizard() {
    const s = this._wizardStatus;
    const loading = s === "loading";
    return `
      <div class="cgc-wizard">
        <button class="cgc-wizard-toggle" id="cgc-wizard-toggle">
          ${this._wizardOpen ? "▾" : "▸"} Create new FileTrack sensor
        </button>
        <a class="cgc-wizard-link" href="https://github.com/TheScubadiver/FileTrack" target="_blank" rel="noopener">FileTrack op GitHub</a>
        ${this._wizardOpen ? `
          <div class="cgc-wizard-body">
            <div class="cgc-wizard-row">
              <div class="cgc-wizard-folder-row">
                <span class="cgc-wizard-prefix">/config/www/</span>
                <input type="text" class="ed-input" id="cgc-wizard-folder" value="${this._wizardFolder}" />
              </div>
            </div>
            <div class="cgc-wizard-row">
              <div class="cgc-wizard-folder-row">
                <span class="cgc-wizard-prefix">sensor.</span>
                <input type="text" class="ed-input" id="cgc-wizard-name" value="${this._wizardName}" />
              </div>
            </div>
            <button class="cgc-wizard-btn" id="cgc-wizard-create" ${!this._wizardFolder || !this._wizardName || loading ? "disabled" : ""}>
              ${loading ? "Creating…" : "Create sensor"}
            </button>
            ${s?.ok === true ? `
              <div class="cgc-wizard-success">
                ✓ Sensor created! Select <code>${s.entityId}</code> in the sensor field above.
              </div>
            ` : ""}
            ${s?.ok === false ? `
              <div class="cgc-wizard-error">✗ ${s.error}</div>
            ` : ""}
          </div>
        ` : ""}
      </div>
    `;
  }

  _bindWizardEvents() {
    const root = this.shadowRoot;
    const toggle = root?.getElementById("cgc-wizard-toggle");
    const folderInput = root?.getElementById("cgc-wizard-folder");
    const nameInput = root?.getElementById("cgc-wizard-name");
    const createBtn = root?.getElementById("cgc-wizard-create");

    if (toggle) {
      toggle.onclick = () => {
        this._wizardOpen = !this._wizardOpen;
        this._scheduleRender();
      };
    }
    if (folderInput) {
      folderInput.oninput = (e) => {
        this._wizardFolder = e.target.value;
        this._wizardStatus = null;
        this._updateWizardButton();
      };
    }
    if (nameInput) {
      nameInput.oninput = (e) => {
        const normalized = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_");
        this._wizardName = normalized;
        e.target.value = normalized;
        this._wizardStatus = null;
        this._updateWizardButton();
      };
    }
    if (createBtn) {
      createBtn.onclick = () => this._createFilesSensor();
    }
  }

  _updateWizardButton() {
    const btn = this.shadowRoot?.getElementById("cgc-wizard-create");
    if (!btn) return;
    btn.disabled = !this._wizardFolder || !this._wizardName;
  }

  async _createFilesSensor() {
    const folderInput = this.shadowRoot?.getElementById("cgc-wizard-folder");
    const nameInput = this.shadowRoot?.getElementById("cgc-wizard-name");
    const createBtn = this.shadowRoot?.getElementById("cgc-wizard-create");

    const folder = (folderInput?.value || this._wizardFolder).trim().replace(/^\//, "").replace(/\/$/, "");
    const name = (nameInput?.value || this._wizardName).trim();

    if (!folder || !name) return;
    this._wizardFolder = folder;
    this._wizardName = name;

    if (createBtn) { createBtn.disabled = true; createBtn.textContent = "Bezig…"; }

    try {
      await this._hass.callService("filetrack", "add_sensor", {
        name,
        folder: "/config/www/" + folder,
        filter: "*",
        sort: "date",
        recursive: false,
      });

      const entityId = "sensor." + name
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");

      this._wizardStatus = { ok: true, entityId };
    } catch (e) {
      const msg = (e?.message || String(e)).toLowerCase();
      const folderExists = msg.includes("exist") || msg.includes("already") || msg.includes("fileexist");
      if (folderExists) {
        const entityId = "sensor." + name
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, "_")
          .replace(/_+/g, "_")
          .replace(/^_|_$/g, "");
        this._wizardStatus = { ok: true, entityId };
      } else {
        this._wizardStatus = { ok: false, error: e?.message || String(e) };
      }
    }
    this._scheduleRender();
  }
}

if (!customElements.get("camera-gallery-card-editor")) {
  customElements.define(
    "camera-gallery-card-editor",
    CameraGalleryCardEditor
  );
}