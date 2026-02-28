/**
 * Camera Gallery Card
 * Version: 1.0.0
 */

const CARD_VERSION = "1.0.0";

// -------- HARD CODED SETTINGS --------
const ATTR_NAME = "fileList";
const PREVIEW_WIDTH = "100%";

const THUMBS_ENABLED = true;
const THUMBS_COUNT = 8;
const THUMB_SIZE = 86;
const THUMB_RADIUS = 14;
const THUMB_GAP = 12;

// defaults (can be overridden via config)
const DEFAULT_ALLOW_DELETE = true;
const DEFAULT_ALLOW_BULK_DELETE = true;
const DEFAULT_DELETE_CONFIRM = true;

// ✅ delete_service is REQUIRED now (no default)
const DEFAULT_DELETE_SERVICE = "";

// ✅ hard safety prefix (NOT configurable)
const DEFAULT_DELETE_PREFIX = "/config/www/"; // only allow deleting within www by default

// ✅ bar opacity default (0-100)
const DEFAULT_BAR_OPACITY = 45;

const STYLE = {
  card_background: "rgba(255,255,255,0.06)",
  card_padding: "10px 12px",
  topbar_padding: "0px",
  topbar_margin: "0px",
  preview_background: "rgba(255,255,255,0.06)",
};
// ------------------------------------

// ─── Resolve Lit from HA ─────────────────────────────────────────────
let LitElement, html, css;

(() => {
  const candidates = [
    "hui-masonry-view",
    "hui-view",
    "ha-panel-lovelace",
    "hc-lovelace",
    "hui-entities-card",
    "ha-card",
  ];
  for (const tag of candidates) {
    const klass = customElements.get(tag);
    if (!klass) continue;
    let proto = klass;
    while (proto && proto !== HTMLElement && proto !== Object) {
      if (proto.prototype?.html && proto.prototype?.css) {
        LitElement = proto;
        html = proto.prototype.html;
        css = proto.prototype.css;
        return;
      }
      proto = Object.getPrototypeOf(proto);
    }
  }
})();

if (!LitElement) {
  console.error("CAMERA-GALLERY-CARD: Could not resolve LitElement from HA");
}

class CameraGalleryCard extends LitElement {
  static get properties() {
    return {
      _hass: {},
      config: {},
      _selectedIndex: { type: Number },
      _selectedDay: { type: String },
      _filterAll: { type: Boolean },
      _scrubMinute: { type: Number },
      _swipeStartX: { type: Number },
      _swipeStartY: { type: Number },
      _swiping: { type: Boolean },
      _selectMode: { type: Boolean },
      _selectedSet: { type: Object },
      _pendingScrollToI: { type: Number },
    };
  }

  static async getConfigElement() {
    await import("./camera-gallery-card-editor.js");
    return document.createElement("camera-gallery-card-editor");
  }

  // ✅ Stub contains only supported keys (no legacy shell_command)
  static getStubConfig() {
    return {
      entity: "",
      delete_service: "", // REQUIRED

      preview_height: 320,
      bar_position: "top",
      thumb_size: 140,

      // ✅ new
      bar_opacity: DEFAULT_BAR_OPACITY,

      allow_delete: DEFAULT_ALLOW_DELETE,
      allow_bulk_delete: DEFAULT_ALLOW_BULK_DELETE,
      delete_confirm: DEFAULT_DELETE_CONFIRM,
    };
  }

  connectedCallback() {
    super.connectedCallback();
    this._posterCache = new Map();
    this._posterPending = new Set();
    this._deleted = new Set();
    this._selectMode = false;
    this._selectedSet = new Set();
    this._pendingScrollToI = null;
  }

  set hass(hass) {
    this._hass = hass;
    this.requestUpdate();
  }
  get hass() {
    return this._hass;
  }

  // ✅ NEW: force thumbs scroller back to start
  _resetThumbScrollToStart() {
    requestAnimationFrame(() => {
      const wrap = this.renderRoot?.querySelector(".tthumbs");
      if (!wrap) return;
      wrap.scrollLeft = 0;
    });
  }

  // hardcoded safety prefix normalizer
  _normPrefixHardcoded() {
    const lead = DEFAULT_DELETE_PREFIX.startsWith("/") ? DEFAULT_DELETE_PREFIX : "/" + DEFAULT_DELETE_PREFIX;
    const noMulti = lead.replace(/\/{2,}/g, "/");
    return noMulti.endsWith("/") ? noMulti : noMulti + "/";
  }

  setConfig(config) {
    if (!config?.entity) throw new Error("camera-gallery-card: 'entity' is required");

    const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
    const num = (v, d) => {
      if (v === null || v === undefined) return d;
      const n = Number(String(v).trim().replace("px", "").replace("%", ""));
      return Number.isFinite(n) ? n : d;
    };

    const posRaw = String(config.bar_position ?? "top").toLowerCase().trim();
    const bar_position = posRaw === "bottom" ? "bottom" : posRaw === "hidden" ? "hidden" : "top";
    const thumb_size = Math.max(40, Math.min(220, num(config.thumb_size, THUMB_SIZE)));

    const allow_delete = config.allow_delete !== undefined ? !!config.allow_delete : DEFAULT_ALLOW_DELETE;
    const allow_bulk_delete = config.allow_bulk_delete !== undefined ? !!config.allow_bulk_delete : DEFAULT_ALLOW_BULK_DELETE;

    // ✅ REQUIRED delete_service:
    // - delete_service wins
    // - shell_command allowed ONLY as legacy fallback (read-only)
    const delete_service =
      (config.delete_service && String(config.delete_service).trim()) ||
      (config.shell_command && String(config.shell_command).trim()) ||
      DEFAULT_DELETE_SERVICE;

    if (!delete_service) {
      throw new Error("camera-gallery-card: 'delete_service' is required");
    }
    if (!/^[a-z0-9_]+\.[a-z0-9_]+$/i.test(delete_service)) {
      throw new Error("camera-gallery-card: 'delete_service' must be 'domain.service'");
    }

    const delete_confirm = config.delete_confirm !== undefined ? !!config.delete_confirm : DEFAULT_DELETE_CONFIRM;

    // ✅ new: bar opacity (0-100)
    const bar_opacity = clamp(num(config.bar_opacity, DEFAULT_BAR_OPACITY), 0, 100);

    this.config = {
      entity: config.entity,
      preview_height: Number(config.preview_height) || 320,
      bar_position,
      thumb_size,

      // ✅ new
      bar_opacity,

      allow_delete,
      allow_bulk_delete,

      delete_service,
      delete_confirm,
    };

    if (this._selectedIndex === undefined) this._selectedIndex = 0;
    if (this._filterAll === undefined) this._filterAll = false;
    if (this._scrubMinute === undefined) this._scrubMinute = NaN;
    if (this._swipeStartX === undefined) this._swipeStartX = 0;
    if (this._swipeStartY === undefined) this._swipeStartY = 0;
    if (this._swiping === undefined) this._swiping = false;
    if (this._selectMode === undefined) this._selectMode = false;
    if (!this._selectedSet) this._selectedSet = new Set();
  }

  updated(changedProps) {
    // 1️⃣ Scroll selected thumb into view
    if (this._pendingScrollToI != null) {
      const i = this._pendingScrollToI;
      this._pendingScrollToI = null;
      this._scrollThumbIntoView(i);
    }

    // 2️⃣ Alleen resetten als dag of filter écht veranderd is
    const dayChanged = changedProps.has("_selectedDay");
    const filterChanged = changedProps.has("_filterAll");

    if (dayChanged || filterChanged) {
      this._resetThumbScrollToStart();
    }
  }

  _scrollThumbIntoView(filteredIndexI) {
    requestAnimationFrame(() => {
      const wrap = this.renderRoot?.querySelector(".tthumbs");
      if (!wrap) return;

      const btn = wrap.querySelector(`button.tthumb[data-i="${filteredIndexI}"]`);
      if (!btn) return;

      const max = Math.max(0, wrap.scrollWidth - wrap.clientWidth);
      const target = Math.min(
        max,
        Math.max(0, btn.offsetLeft - wrap.clientWidth / 2 + btn.clientWidth / 2)
      );

      // ✅ 1 duidelijke actie – geen smooth, geen dubbele scroll
      wrap.scrollLeft = target;
    });
  }

  _toWebPath(p) {
    if (!p) return "";
    const v = String(p).trim();
    if (v.startsWith("/config/www/")) return "/local/" + v.slice("/config/www/".length);
    if (v === "/config/www") return "/local";
    return v;
  }

  _isVideo(src) {
    return /\.(mp4|webm|mov|m4v)$/i.test(String(src || ""));
  }

  _playPreviewIfVideo() {
    requestAnimationFrame(() => {
      const v = this.renderRoot?.querySelector(".preview video.pimg");
      if (!v) return;
      try {
        const p = v.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch (_) {}
    });
  }

  async _downloadSrc(src) {
    if (!src) return;

    const url = String(src);
    const base = url.split("?")[0].split("#")[0];
    const name = (() => {
      try {
        return decodeURIComponent(base.split("/").pop() || "download");
      } catch (_) {
        return base.split("/").pop() || "download";
      }
    })();

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    } catch (_) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  _toFsPath(src) {
    if (!src) return "";
    let clean = String(src).trim();
    clean = clean.split("?")[0].split("#")[0];
    try {
      if (clean.startsWith("http://") || clean.startsWith("https://")) clean = new URL(clean).pathname;
    } catch (_) {}
    try {
      clean = decodeURIComponent(clean);
    } catch (_) {}
    if (clean.startsWith("/local/")) return "/config/www/" + clean.slice("/local/".length);
    if (clean.startsWith("/config/www/")) return clean;
    return "";
  }

  _serviceParts() {
    const full = String(this.config?.delete_service || "");
    const [domain, service] = full.split(".");
    if (!domain || !service) return null;
    return { domain, service };
  }

  _exitSelectMode() {
    this._selectMode = false;
    this._selectedSet.clear();
    this.requestUpdate();
  }

  _toggleSelectMode() {
    this._selectMode = !this._selectMode;
    this._selectedSet.clear();
    this.requestUpdate();
  }

  _toggleSelected(src) {
    if (!src) return;
    if (this._selectedSet.has(src)) this._selectedSet.delete(src);
    else this._selectedSet.add(src);
    this.requestUpdate();
  }

  async _bulkDelete(selectedSrcList) {
    if (!this.config?.allow_delete || !this.config?.allow_bulk_delete) return;
    const sp = this._serviceParts();
    if (!sp) return;

    const prefix = this._normPrefixHardcoded();

    const srcs = Array.from(selectedSrcList || []);
    if (!srcs.length) return;

    if (this.config?.delete_confirm) {
      const ok = window.confirm(`Are you sure you want to delete ${srcs.length} file(s)?`);
      if (!ok) return;
    }

    for (const src of srcs) {
      const fsPath = this._toFsPath(src);
      if (!fsPath || !fsPath.startsWith(prefix)) continue;

      try {
        await this._hass.callService(sp.domain, sp.service, { path: fsPath });
        this._deleted.add(src);
      } catch (_) {}
    }

    this._selectedSet.clear();
    this._selectMode = false;
    this.requestUpdate();
  }

  async _ensurePoster(src) {
    if (!src || this._posterCache.has(src) || this._posterPending.has(src)) return;
    this._posterPending.add(src);
    try {
      const dataUrl = await this._captureFirstFrame(src);
      if (dataUrl) this._posterCache.set(src, dataUrl);
    } catch (_) {
    } finally {
      this._posterPending.delete(src);
      this.requestUpdate();
    }
  }

  _captureFirstFrame(src) {
    return new Promise((resolve, reject) => {
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.preload = "metadata";
      v.controls = false;

      const cleanup = () => {
        try {
          v.pause();
        } catch (_) {}
        v.removeAttribute("src");
        try {
          v.load();
        } catch (_) {}
      };
      const fail = (err) => {
        cleanup();
        reject(err ?? new Error("poster fail"));
      };
      const draw = () => {
        try {
          const w = v.videoWidth || 0,
            h = v.videoHeight || 0;
          if (!w || !h) return fail(new Error("no video dimensions"));
          const c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          c.getContext("2d").drawImage(v, 0, 0, w, h);
          cleanup();
          resolve(c.toDataURL("image/jpeg", 0.72));
        } catch (e) {
          fail(e);
        }
      };

      v.addEventListener("error", () => fail(new Error("video load error")), { once: true });
      v.addEventListener(
        "loadedmetadata",
        () => {
          try {
            v.currentTime = 0.01;
          } catch (_) {
            draw();
          }
        },
        { once: true }
      );
      v.addEventListener("seeked", () => draw(), { once: true });

      v.src = src;
      try {
        v.load();
      } catch (_) {}
    });
  }

  _items() {
    const st = this._hass?.states?.[this.config.entity];
    const raw = st?.attributes?.[ATTR_NAME];
    if (!raw) return [];

    let list = [];
    if (Array.isArray(raw)) {
      list = raw.map((x) => this._toWebPath(x)).filter(Boolean);
    } else if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed.map((x) => this._toWebPath(x)).filter(Boolean);
        else list = [this._toWebPath(raw)].filter(Boolean);
      } catch (_) {
        list = [this._toWebPath(raw)].filter(Boolean);
      }
    }

    if (this._deleted?.size) list = list.filter((src) => !this._deleted.has(src));
    return list;
  }

  _extractDayKey(src) {
    const m = String(src).match(/(\d{8})/);
    if (!m) return null;
    return `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`;
  }

  _extractDateTimeKey(src) {
    const m = String(src || "").match(/(\d{8})[_-](\d{6})/);
    if (!m) return null;
    return `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}T${m[2].slice(0, 2)}:${m[2].slice(2, 4)}:${m[2].slice(4, 6)}`;
  }

  _dtMsFromSrc(src) {
    const dtKey = this._extractDateTimeKey(src);
    if (!dtKey) return NaN;
    const ms = new Date(dtKey).getTime();
    return Number.isFinite(ms) ? ms : NaN;
  }

  _formatDateTime(dtKey) {
    if (!dtKey) return "";
    try {
      const dt = new Date(dtKey);
      const date = new Intl.DateTimeFormat("en", { day: "2-digit", month: "short" }).format(dt).replace(".", "");
      const time = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(dt);
      return `${date} • ${time}`;
    } catch (_) {
      return "";
    }
  }

  _uniqueDays(itemsWithDay) {
    const set = new Set();
    for (const it of itemsWithDay) if (it.dayKey) set.add(it.dayKey);
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }

  _formatDay(dayKey) {
    if (!dayKey) return "";
    try {
      return new Intl.DateTimeFormat("en", { day: "2-digit", month: "long" })
        .format(new Date(`${dayKey}T00:00:00`))
        .replace(".", "");
    } catch (_) {
      return dayKey;
    }
  }

  _stepDay(delta, days, activeDay) {
    if (!days?.length) return;
    const current = activeDay && days.includes(activeDay) ? activeDay : days[0];
    const i = days.indexOf(current);
    const next = days[Math.min(Math.max(i + delta, 0), days.length - 1)];
    this._selectedDay = next;
    this._filterAll = false;
    this._selectedIndex = 0;
    this._scrubMinute = NaN;
    this._pendingScrollToI = 0;
    this._exitSelectMode();

    // ✅ ensure start from first thumb visually
    this._resetThumbScrollToStart();

    this.requestUpdate();
  }

  _isInsideTsbar(e) {
    const path = e.composedPath?.() || [];
    return path.some((el) => el?.classList?.contains("tsicon") || el?.classList?.contains("tsbar"));
  }

  _onPreviewPointerDown(e) {
    if (e?.isPrimary === false) return;
    if (this._isInsideTsbar(e)) return;
    this._swiping = true;
    this._swipeStartX = e.clientX;
    this._swipeStartY = e.clientY;
    try {
      e.currentTarget?.setPointerCapture?.(e.pointerId);
    } catch (_) {}
  }

  _onPreviewPointerUp(e, listLen, selectedSrcGetter) {
    if (!this._swiping) return;
    this._swiping = false;
    const dx = e.clientX - this._swipeStartX;
    const dy = e.clientY - this._swipeStartY;
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (Math.abs(dx) < 45) return;
    if (this._selectMode) return;

    if (dx < 0) {
      if ((this._selectedIndex ?? 0) < listLen - 1) this._selectedIndex = (this._selectedIndex ?? 0) + 1;
    } else {
      if ((this._selectedIndex ?? 0) > 0) this._selectedIndex = (this._selectedIndex ?? 0) - 1;
    }

    this._scrubMinute = NaN;
    this._pendingScrollToI = this._selectedIndex ?? 0;
    this.requestUpdate();

    requestAnimationFrame(() => {
      const src = typeof selectedSrcGetter === "function" ? selectedSrcGetter() : null;
      if (src && this._isVideo(src)) this._playPreviewIfVideo();
    });
  }

  render() {
    if (!this._hass || !this.config) return html``;

    const rawItems = this._items();
    if (!rawItems.length) return html`<div class="empty">No media found.</div>`;

    const withDt = rawItems.map((src, idx) => ({
      src,
      idx,
      dtMs: this._dtMsFromSrc(src),
      dayKey: this._extractDayKey(src),
    }));

    withDt.sort((a, b) => {
      const aOk = Number.isFinite(a.dtMs),
        bOk = Number.isFinite(b.dtMs);
      if (aOk && bOk && b.dtMs !== a.dtMs) return b.dtMs - a.dtMs;
      if (aOk && !bOk) return -1;
      if (!aOk && bOk) return 1;
      return b.idx - a.idx;
    });

    const allWithDay = withDt.map((x) => ({ src: x.src, dayKey: x.dayKey }));
    const days = this._uniqueDays(allWithDay);
    const newestDay = days[0] ?? null;
    const activeDay = this._filterAll ? null : this._selectedDay ?? newestDay;

    if (!this._filterAll && activeDay && days.length > 0) {
      const stillHasMedia = allWithDay.some((x) => x.dayKey === activeDay);

      if (!stillHasMedia) {
        const currentIndex = days.indexOf(activeDay);
        const nextDay = days[currentIndex + 1] ?? days[currentIndex - 1] ?? days[0] ?? null;

        if (nextDay && nextDay !== activeDay) {
          this._selectedDay = nextDay;
          this._selectedIndex = 0;
          this._scrubMinute = NaN;
          this._pendingScrollToI = 0;
          this._exitSelectMode();

          // ✅ ensure start from first thumb visually
          this._resetThumbScrollToStart();

          this.requestUpdate();
          return html``;
        }
      }
    }

    const filteredAll = !activeDay || this._filterAll ? allWithDay : allWithDay.filter((x) => x.dayKey === activeDay);

    if (!filteredAll.length) return html`<div class="empty">No media for this day.</div>`;
    if ((this._selectedIndex ?? 0) >= filteredAll.length) this._selectedIndex = 0;

    const idx = Math.min(Math.max(this._selectedIndex ?? 0, 0), filteredAll.length - 1);
    const selected = filteredAll[idx]?.src;
    if (this._isVideo(selected)) this._ensurePoster(selected);

    let thumbs = [];
    if (THUMBS_ENABLED && filteredAll.length) {
      const count = Math.min(THUMBS_COUNT, filteredAll.length);
      const step = filteredAll.length / count;
      for (let k = 0; k < count; k++) {
        const ii = Math.floor(k * step);
        const it = filteredAll[ii];
        if (it?.src) thumbs.push({ ...it, i: ii });
      }
    }
    for (const it of thumbs) if (this._isVideo(it.src)) this._ensurePoster(it.src);

    const tsKey = this._extractDateTimeKey(selected);
    const tsText = this._formatDateTime(tsKey);

    const currentForNav = activeDay ?? newestDay;
    const dayIdx = currentForNav ? days.indexOf(currentForNav) : -1;
    const canPrev = dayIdx >= 0 && dayIdx < days.length - 1;
    const canNext = dayIdx > 0;
    const isAll = this._filterAll === true;
    const isToday = !isAll && currentForNav === newestDay;

    const rootVars = `
      --gap:10px; --r:18px;
      --cardBg:${STYLE.card_background}; --cardPad:${STYLE.card_padding};
      --topbarPad:${STYLE.topbar_padding}; --topbarMar:${STYLE.topbar_margin};
      --previewBg:${STYLE.preview_background};
      --uiBg:rgba(255,255,255,0.06); --uiStroke:rgba(255,255,255,0.10);
      --uiTxt:rgba(255,255,255,0.92); --uiTxt2:rgba(255,255,255,0.78);
      --uiDis:rgba(255,255,255,0.35);

      /* ✅ new */
      --barOpacity:${this.config.bar_opacity};
    `;

    const sp = this._serviceParts();
    const canDelete = !!this.config?.allow_delete && !!sp;
    const canBulkDelete = !!this.config?.allow_bulk_delete && !!sp;
    const showBulkToggle = canDelete && canBulkDelete && (thumbs?.length ?? 0) > 0;

    const tsPosClass =
      this.config.bar_position === "bottom" ? "bottom" : this.config.bar_position === "hidden" ? "hidden" : "top";

    return html`
      <div class="root" style="${rootVars}">
        <div class="panel" style="width:${PREVIEW_WIDTH}; margin:0 auto;">
          <div
            class="preview"
            style="height:${this.config.preview_height}px;"
            @pointerdown=${(e) => this._onPreviewPointerDown(e)}
            @pointerup=${(e) =>
              this._onPreviewPointerUp(e, filteredAll.length, () => filteredAll[this._selectedIndex ?? 0]?.src)}
            @pointercancel=${() => (this._swiping = false)}
          >
            ${this._isVideo(selected)
              ? html`<video
                  class="pimg"
                  src=${selected}
                  controls
                  playsinline
                  preload="auto"
                  poster=${this._posterCache.get(selected) || ""}
                ></video>`
              : html`<img class="pimg" src=${selected} alt="" />`}

            ${tsText && tsPosClass !== "hidden"
              ? html`
                  <div class="tsbar ${tsPosClass}">
                    <div class="tsleft">${tsText}</div>
                    <div class="tspill">
                      <span class="tspill-val">${idx + 1}/${filteredAll.length}</span>
                    </div>
                  </div>
                `
              : html``}
          </div>

          <div class="divider"></div>

          <div class="topbar">
            <div class="seg" role="tablist" aria-label="Filter">
              <button
                class="segbtn ${isToday ? "on" : ""}"
                @click=${() => {
                  this._selectedDay = newestDay;
                  this._filterAll = false;
                  this._selectedIndex = 0;
                  this._scrubMinute = NaN;
                  this._pendingScrollToI = 0;
                  this._exitSelectMode();

                  // ✅ ensure start from first thumb visually
                  this._resetThumbScrollToStart();

                  this.requestUpdate();
                }}
                title="Today"
                role="tab"
                aria-selected=${isToday}
              >
                <span>Today</span>
              </button>
            </div>

            <div class="datepill" role="group" aria-label="Day navigation">
              <button
                class="iconbtn"
                ?disabled=${!canPrev}
                @click=${() => this._stepDay(+1, days, currentForNav)}
                aria-label="Previous day"
                title="Previous day"
              >
                <ha-icon icon="mdi:chevron-left"></ha-icon>
              </button>
              <div class="dateinfo" title="Selected day">
                <span class="txt">${isAll ? "All" : currentForNav ? this._formatDay(currentForNav) : "—"}</span>
              </div>
              <button
                class="iconbtn"
                ?disabled=${!canNext}
                @click=${() => this._stepDay(-1, days, currentForNav)}
                aria-label="Next day"
                title="Next day"
              >
                <ha-icon icon="mdi:chevron-right"></ha-icon>
              </button>
            </div>

            ${showBulkToggle
              ? html`
                  <button
                    class="bulkbtn ${this._selectMode ? "on" : ""}"
                    title=${this._selectMode ? "Stop selecting" : "Select"}
                    @pointerdown=${(e) => {
                      // voorkom dat er iets anders (swipe/ha-card) mee aan de haal gaat
                      e.preventDefault();
                      e.stopPropagation();
                      e.stopImmediatePropagation?.();
                    }}
                    @click=${(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.stopImmediatePropagation?.();
                      e.currentTarget.blur();

                      // ultra-direct: flip state, leeg selectie, force rerender
                      this._selectMode = !this._selectMode;
                      this._selectedSet?.clear?.();
                      this.requestUpdate();
                    }}
                  >
                    <ha-icon icon="mdi:checkbox-multiple-marked-outline"></ha-icon>
                  </button>
                `
              : html``}

            <button
              class="bulkbtn"
              title="Download"
              @click=${(e) => {
                e.preventDefault();
                e.stopPropagation();
                this._downloadSrc(selected);
              }}
            >
              <ha-icon icon="mdi:download"></ha-icon>
            </button>
          </div>

          <div class="divider"></div>

          <div class="timeline">
            ${this._selectMode && (this._selectedSet?.size ?? 0)
              ? html`
                  <div class="bulkbar topbulk">
                    <span class="bulkcount">${this._selectedSet.size} selected</span>
                    <div class="bulkactions">
                      <button
                        type="button"
                        class="bulkicon bulkcancel"
                        title="Cancel"
                        aria-label="Cancel"
                        @click=${(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          this._exitSelectMode();
                        }}
                      >
                        <ha-icon icon="mdi:close"></ha-icon>
                      </button>
                      <button
                        type="button"
                        class="bulkicon bulkdelete"
                        title="Delete"
                        aria-label="Delete"
                        ?disabled=${!canDelete}
                        @click=${async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          await this._bulkDelete(this._selectedSet);
                        }}
                      >
                        <ha-icon icon="mdi:trash-can"></ha-icon>
                      </button>
                    </div>
                  </div>
                  <div class="divider"></div>
                `
              : html``}

            ${thumbs.length
              ? html`
                  <div class="tthumbs" style="--tgap:${THUMB_GAP}px;">
                    ${thumbs.map((it) => {
                      const isVid = this._isVideo(it.src);
                      const poster = isVid ? this._posterCache.get(it.src) : it.src;
                      const isOn = it.i === idx;
                      const isSel = this._selectedSet?.has(it.src);
                      return html`
                        <button
                          class="tthumb ${isOn ? "on" : ""} ${this._selectMode && isSel ? "sel" : ""}"
                          data-i="${it.i}"
                          style="width:${this.config.thumb_size}px;height:${this.config.thumb_size}px;border-radius:${THUMB_RADIUS}px;"
                          @click=${(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (this._selectMode) {
                              this._toggleSelected(it.src);
                              return;
                            }
                            this._selectedIndex = it.i;
                            this._scrubMinute = NaN;
                            this._pendingScrollToI = it.i;
                            this.requestUpdate();
                            this._playPreviewIfVideo();
                          }}
                        >
                          ${poster
                            ? html`<img class="timg" src="${poster}" alt="" loading="lazy" />`
                            : html`<div class="tph" aria-hidden="true"></div>`}
                          ${this._selectMode
                            ? html`
                                <div class="selOverlay ${isSel ? "on" : ""}">
                                  <ha-icon icon="mdi:check"></ha-icon>
                                </div>
                              `
                            : html``}
                        </button>
                      `;
                    })}
                  </div>
                `
              : html``}
          </div>
        </div>
      </div>
    `;
  }

  static get styles() {
    return css`
      :host { display:block; }
      .root { display:block; background:transparent; padding:0; border-radius:0; min-height:0; }

      .panel {
        background: var(--cardBg); border-radius: var(--r);
        padding: var(--cardPad); box-sizing: border-box;
      }

      .divider { height:1px; background:rgba(255,255,255,0.1); margin:10px 0; }

      .preview {
        position:relative;
        -webkit-mask-image: -webkit-radial-gradient(white, black);
        transform: translateZ(0);
        background:var(--previewBg);
        width:100%;
        border-radius: var(--r);
        overflow: hidden;
      }
        
      .pimg { width:100%; height:100%; object-fit:cover; display:block; }

      .tsbar {
        position:absolute; left:0; right:0; height:40px; padding:0 10px 0 12px;

        /* alpha */
        background: rgba(0,0,0, calc(var(--barOpacity, 45) / 100));

        color:rgba(255,255,255,0.92);
        font-size:12px; font-weight:700;
        display:flex; align-items:center; justify-content:space-between;
        box-sizing:border-box;
        pointer-events:none; z-index:2;

        /* ✅ blur alleen als opacity > 0 */
        backdrop-filter: blur(calc(8px * min(1, var(--barOpacity, 45))));
        -webkit-backdrop-filter: blur(calc(8px * min(1, var(--barOpacity, 45))));
      }

      /* ✅ bij 0: geen balk, geen blur, geen layout “ghost” */
      .tsbar[style*="--barOpacity:0"], 
      .tsbar[style*="--barOpacity: 0"] {
        display: none !important;
      }

      .tsbar.top { top:0; }
      .tsbar.bottom { bottom:0; }
      .tsleft { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

      .tspill {
        display:inline-flex; align-items:center; gap:4px;
        padding:4px 12px; border-radius:999px;
        background:rgba(255,255,255,0.15); backdrop-filter:blur(6px);
        color:rgba(255,255,255,0.95); font-size:11px; font-weight:800;
        white-space:nowrap; pointer-events:auto; flex-shrink:0;
      }
      .tspill-val { letter-spacing:0.02em; }

      .topbar {
        display:flex; align-items:center; justify-content:space-between;
        gap:12px; padding:var(--topbarPad); margin:var(--topbarMar); overflow:hidden; min-width:0;
      }

      .seg {
        display:inline-flex; align-items:center; height:30px;
        background:var(--uiBg); border-radius:10px; overflow:hidden; flex:0 0 auto;
      }
      .segbtn {
        border:0; height:100%; padding:0 12px; border-radius:10px;
        display:inline-flex; align-items:center; justify-content:center;
        color:var(--uiTxt2); background:transparent;
        font-size:13px; font-weight:700; white-space:nowrap;
        cursor:pointer; -webkit-tap-highlight-color:transparent;
      }
      .segbtn.on { background:#ffffff; color:rgba(0,0,0,0.98); border-radius:8px; }

      .datepill {
        display:flex; align-items:center; height:30px;
        background:var(--uiBg);
        border-radius:10px; overflow:hidden; flex:1 1 auto; min-width:0;
      }
      .iconbtn {
        width:44px; height:44px; border:0; background:transparent; color:var(--uiTxt);
        display:grid; place-items:center; cursor:pointer;
        -webkit-tap-highlight-color:transparent; flex:0 0 auto;
      }
      .iconbtn[disabled] { color:var(--uiDis); cursor:default; }
      .dateinfo {
        flex:1 1 auto; min-width:0; display:flex; align-items:center; justify-content:center;
        padding:10px 14px; color:var(--uiTxt); font-size:13px; font-weight:800;
      }
      .dateinfo .txt { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

      .bulkbtn {
        --bsize:30px; width:var(--bsize); height:var(--bsize);
        border-radius:999px; border:1px solid var(--uiStroke);
        background:var(--uiBg); color:var(--uiTxt);
        display:grid; place-items:center; cursor:pointer;
        pointer-events:auto; position:relative; z-index:3;
        flex:0 0 auto; -webkit-tap-highlight-color:transparent;
        padding:0; line-height:0; box-sizing:border-box; border:0;
      }
      .bulkbtn.on { background:#ffffff; border-color:rgba(255,255,255,0.18); color:#000000; }
      .bulkbtn ha-icon {
        --ha-icon-size:calc(var(--bsize)*0.55); --mdc-icon-size:var(--ha-icon-size);
        width:var(--ha-icon-size); height:var(--ha-icon-size); display:block; margin:auto; transform:translateY(-0.5px);
      }

      .timeline { padding:0; margin:0; }

      .tthumbs {
        display:flex; align-items:center; gap:var(--tgap,12px);
        margin-bottom:0px; min-width:0; overflow-x:auto; overflow-y:hidden;
        -webkit-overflow-scrolling:touch;
        padding-bottom:2px; scrollbar-width:none; -ms-overflow-style:none;
      }
      .tthumbs::-webkit-scrollbar { display:none; }

      .tthumb:focus {
        outline: none;
      }

      .tthumb {
        border:0; padding:0; overflow:hidden; background:rgba(255,255,255,0.06);
        outline: none;
        cursor:pointer; position:relative; flex:0 0 auto;
        scroll-snap-align:start; box-shadow:0 4px 10px rgba(0,0,0,0.25);
      }
      .tthumb::after {
        content:""; position:absolute; inset:0; border-radius:inherit;
        pointer-events:none; box-shadow:inset 0 0 0 1px rgba(255,255,255,0.18);
      }
      .tthumb.on::after { box-shadow:inset 0 0 0 2px rgba(64,148,255,0.95); }
      .tthumb.sel::after { box-shadow:inset 0 0 0 2px rgba(255,192,203,0.95); }

      .timg { width:100%; height:100%; object-fit:cover; display:block; }
      .tph { width:100%; height:100%; background:rgba(255,255,255,0.06); }

      .selOverlay {
        position:absolute; inset:0; background:rgba(0,0,0,0.35);
        display:flex; align-items:center; justify-content:center;
        opacity:0; transition:0.12s ease; pointer-events:none;
      }
      .selOverlay.on { opacity:1; background:rgba(0,0,0,0.55); }
      .selOverlay ha-icon {
        color:rgba(255,255,255,0.98); --mdc-icon-size:22px; --ha-icon-size:22px; width:22px; height:22px;
      }

      .bulkbar {
        margin:8px 0 0 0; padding:10px 12px; border-radius:14px;
        background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1);
        display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;
      }
      .bulkcount { font-size:13px; font-weight:900; color:var(--uiTxt); white-space:nowrap; flex:1 1 auto; min-width:0; }
      .bulkactions { display:flex; align-items:center; gap:10px; flex:0 0 auto; }
      .bulkicon {
        --asize:40px; width:var(--asize); height:var(--asize); border-radius:999px;
        display:grid; place-items:center; cursor:pointer;
        -webkit-tap-highlight-color:transparent; padding:0; line-height:0; box-sizing:border-box;
        opacity:1;
      }
      .bulkicon[disabled] { opacity:0.45; cursor:default; }
      .bulkcancel { border:0; background:#2e7d32; color:rgba(255,255,255,0.98); }
      .bulkdelete { border:0; background:#ff0000; color:rgba(255,255,255,0.98); }
      .bulkicon ha-icon {
        --ha-icon-size:calc(var(--asize)*0.55); --mdc-icon-size:var(--ha-icon-size);
        width:var(--ha-icon-size); height:var(--ha-icon-size); display:block; margin:auto; transform:translateY(-0.5px);
      }
      .bulkbar,.bulkactions,.bulkicon { pointer-events:auto; position:relative; z-index:2; }

      .empty { padding:12px; border-radius:14px; background:rgba(255,255,255,0.06); }

      @media (max-width:420px) {
        .segbtn { padding:9px 12px; }
        .iconbtn { width:40px; height:40px; }
        .dateinfo { padding:9px 12px; }
      }
    `;
  }
}

customElements.define("camera-gallery-card", CameraGalleryCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "camera-gallery-card",
  name: "Camera Gallery Card",
  description: "Media gallery for Home Assistant",
});

console.info(`Camera Gallery Card v${CARD_VERSION}`);
