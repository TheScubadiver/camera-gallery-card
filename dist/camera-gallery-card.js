/**
 * Camera Gallery Card
 * Version: 1.0.2
 *
 * A media gallery card for Home Assistant.
 * - Image & video preview
 * - Swipe navigation
 * - Day filtering
 * - Timeline thumbnails
 * - Bulk select & delete (optional)
 * - Download support
 *
 * Lovelace config:
 *  entity: required (sensor with fileList attribute)
 *  preview_height: number (px)
 *  bar_position: "top" | "bottom" | "hidden"
 *  thumb_size: number (px)
 *
 * Delete (optional):
 *  allow_delete: boolean (default true)
 *  allow_bulk_delete: boolean (default true)
 *  delete_confirm: boolean (default true)
 *
 *  delete_service: "domain.service" (default "")
 *  shell_command: "domain.service" (alias for delete_service)
 *
 * Safety:
 *  Deletion is only allowed within /config/www/ (hardcoded safety prefix).
 *
 * Author: TheScubaDiver
 * License: MIT
 */

const CARD_VERSION = "1.0.2";

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

// ✅ no default service shown anywhere — user must configure if they want delete
const DEFAULT_DELETE_SERVICE = "";

// ✅ hard safety prefix (NOT configurable)
const DEFAULT_DELETE_PREFIX = "/config/www/"; // only allow deleting within www by default

const STYLE = {
  card_background: "rgba(255,255,255,0.06)",
  card_padding: "10px 12px",
  topbar_padding: "0px",
  topbar_margin: "0px",
  preview_background: "rgba(255,255,255,0.06)",
};
// ------------------------------------

// ─── i18n ────────────────────────────────────────────────────────────
const I18N = {
  en: {
    today: "Today",
    all: "All",
    no_media: "No media found.",
    no_media_day: "No media for this day.",
    event: "event",
    events: "events",
    selected: "selected",
    delete: "Delete",
    cancel: "Cancel",
    select: "Select",
    stop_select: "Stop selecting",
    download: "Download",
    prev_day: "Previous day",
    next_day: "Next day",
    selected_day: "Selected day",
    confirm_delete: (n) => `Are you sure you want to delete ${n} file(s)?`,
  },
  nl: {
    today: "Vandaag",
    all: "Alles",
    no_media: "Geen beelden gevonden.",
    no_media_day: "Geen beelden voor deze dag.",
    event: "event",
    events: "events",
    selected: "geselecteerd",
    delete: "Verwijderen",
    cancel: "Annuleren",
    select: "Selecteren",
    stop_select: "Selectie stoppen",
    download: "Download",
    prev_day: "Vorige dag",
    next_day: "Volgende dag",
    selected_day: "Geselecteerde dag",
    confirm_delete: (n) => `Weet je zeker dat je ${n} bestand(en) wilt verwijderen?`,
  },
  de: {
    today: "Heute",
    all: "Alle",
    no_media: "Keine Medien gefunden.",
    no_media_day: "Keine Medien für diesen Tag.",
    event: "Ereignis",
    events: "Ereignisse",
    selected: "ausgewählt",
    delete: "Löschen",
    cancel: "Abbrechen",
    select: "Auswählen",
    stop_select: "Auswahl beenden",
    download: "Herunterladen",
    prev_day: "Vorheriger Tag",
    next_day: "Nächster Tag",
    selected_day: "Ausgewählter Tag",
    confirm_delete: (n) => `Möchten Sie ${n} Datei(en) wirklich löschen?`,
  },
  fr: {
    today: "Aujourd'hui",
    all: "Tout",
    no_media: "Aucun média trouvé.",
    no_media_day: "Aucun média pour ce jour.",
    event: "événement",
    events: "événements",
    selected: "sélectionné(s)",
    delete: "Supprimer",
    cancel: "Annuler",
    select: "Sélectionner",
    stop_select: "Arrêter la sélection",
    download: "Télécharger",
    prev_day: "Jour précédent",
    next_day: "Jour suivant",
    selected_day: "Jour sélectionné",
    confirm_delete: (n) => `Voulez-vous vraiment supprimer ${n} fichier(s) ?`,
  },
};

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

  static getStubConfig() {
    return {
      entity: "",
      preview_height: 320,
      bar_position: "top",
      thumb_size: 140,

      // delete defaults (optional)
      allow_delete: DEFAULT_ALLOW_DELETE,
      allow_bulk_delete: DEFAULT_ALLOW_BULK_DELETE,
      delete_service: DEFAULT_DELETE_SERVICE,
      delete_confirm: DEFAULT_DELETE_CONFIRM,

      // ✅ alias (optional)
      shell_command: "",
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

  get _lang() {
    const l = (this._hass?.language || "en").split("-")[0].toLowerCase();
    return I18N[l] ? l : "en";
  }

  _t(key) {
    return (I18N[this._lang] || I18N.en)[key] ?? (I18N.en[key] ?? key);
  }

  set hass(hass) {
    this._hass = hass;
    this.requestUpdate();
  }
  get hass() {
    return this._hass;
  }

  // ✅ hardcoded safety prefix normalizer
  _normPrefixHardcoded() {
    const lead = DEFAULT_DELETE_PREFIX.startsWith("/") ? DEFAULT_DELETE_PREFIX : "/" + DEFAULT_DELETE_PREFIX;
    const noMulti = lead.replace(/\/{2,}/g, "/");
    return noMulti.endsWith("/") ? noMulti : noMulti + "/";
  }

  setConfig(config) {
    if (!config?.entity) throw new Error("camera-gallery-card: 'entity' is required");

    const num = (v, d) => {
      if (v === null || v === undefined) return d;
      const n = Number(String(v).trim().replace("px", ""));
      return Number.isFinite(n) ? n : d;
    };

    const posRaw = String(config.bar_position ?? "top").toLowerCase().trim();
    const bar_position = posRaw === "bottom" ? "bottom" : posRaw === "hidden" ? "hidden" : "top";
    const thumb_size = Math.max(40, Math.min(220, num(config.thumb_size, THUMB_SIZE)));

    const allow_delete = config.allow_delete !== undefined ? !!config.allow_delete : DEFAULT_ALLOW_DELETE;
    const allow_bulk_delete = config.allow_bulk_delete !== undefined ? !!config.allow_bulk_delete : DEFAULT_ALLOW_BULK_DELETE;

    // ✅ ALIAS:
    // - shell_command -> delete_service
    const delete_service =
      (config.shell_command && String(config.shell_command).trim()) ||
      (config.delete_service && String(config.delete_service).trim()) ||
      DEFAULT_DELETE_SERVICE;

    const delete_confirm = config.delete_confirm !== undefined ? !!config.delete_confirm : DEFAULT_DELETE_CONFIRM;

    this.config = {
      entity: config.entity,
      preview_height: Number(config.preview_height) || 320,
      bar_position,
      thumb_size,

      allow_delete,
      allow_bulk_delete,

      delete_service, // ← configured service (no default label)
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

  updated() {
    if (this._pendingScrollToI != null) {
      const i = this._pendingScrollToI;
      this._pendingScrollToI = null;
      this._scrollThumbIntoView(i);
    }
  }

  _scrollThumbIntoView(filteredIndexI) {
    requestAnimationFrame(() => {
      const wrap = this.renderRoot?.querySelector(".tthumbs");
      if (!wrap) return;
      const btn = wrap.querySelector(`button.tthumb[data-i="${filteredIndexI}"]`);
      if (!btn) return;
      const left = btn.offsetLeft - wrap.clientWidth / 2 + btn.clientWidth / 2;
      try {
        wrap.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
      } catch (_) {
        btn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
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
      const ok = window.confirm((I18N[this._lang] || I18N.en).confirm_delete(srcs.length));
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
    return `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}T${m[2].slice(0, 2
