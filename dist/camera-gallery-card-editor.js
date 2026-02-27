/* camera-gallery-card-editor.js
 * v1.0.6
 * - FIX: shell_command input shows shell_command OR delete_service (alias)
 * - FIX: clearing shell_command removes BOTH shell_command + delete_service (prevents "zombie" values)
 * - FIX: setting shell_command writes BOTH keys for consistent alias behavior
 * - file sensor + shell_command moved to top
 * - preview_height
 * - thumb_size
 * - bar_position
 */

console.warn("CAMERA GALLERY EDITOR LOADED v1.0.6");

class CameraGalleryCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) {
    this._config = { ...(config || {}) };
    this._render();
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

  _set(key, value) {
    this._config = { ...this._config, [key]: value };
    this._fire();
    this._render();
  }

  _render() {
    const c = this._config || {};

    const fileSensor = String(c.entity || "");
    const height = Number(c.preview_height) || 320;
    const thumbSize = Number(c.thumb_size) || 140;
    const tsPos = String(c.bar_position || "top");

    // ✅ Alias-aware: show shell_command if set, else delete_service
    const shellCommand = String(c.shell_command || c.delete_service || "");

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; padding:8px 0; }
        .wrap { display:grid; gap:14px; }

        .row {
          display:grid;
          gap:8px;
          padding:14px;
          border-radius:14px;
          background:rgba(0,0,0,0.08);
          border:1px solid rgba(255,255,255,0.06);
        }

        .lbl { font-size:13px; font-weight:900; }
        .desc { font-size:12px; opacity:0.7; }

        .input {
          width:100%;
          box-sizing:border-box;
          border-radius:10px;
          border:1px solid rgba(255,255,255,0.08);
          background:rgba(255,255,255,0.06);
          color:inherit;
          padding:10px 12px;
          font-size:13px;
          font-weight:800;
          outline:none;
        }

        .segwrap { display:flex; gap:8px; }
        .seg {
          flex:1;
          border:1px solid rgba(255,255,255,0.10);
          background:rgba(255,255,255,0.06);
          color:rgba(255,255,255,0.78);
          border-radius:10px;
          padding:10px 0;
          font-size:13px;
          font-weight:700;
          cursor:pointer;
        }
        .seg.on {
          background:#ffffff;
          color:rgba(0,0,0,0.95);
          border-color:transparent;
        }
      </style>

      <div class="wrap">

        <!-- FILE SENSOR -->
        <div class="row">
          <div class="lbl">File sensor</div>
          <div class="desc">
            Sensor entity that contains the <code>fileList</code> attribute.
            See the GitHub repository for installation instructions.
          </div>
          <input class="input" id="entity"
            type="text"
            placeholder=""
            value="${fileSensor}" />
        </div>
        
        <!-- SHELL COMMAND -->
        <div class="row">
          <div class="lbl">Shell command</div>
          <div class="desc">Service to call for deletion (domain.service).</div>
          <input class="input" id="shell"
            type="text"
            placeholder=""
            value="${shellCommand}" />
        </div>

        <!-- PREVIEW HEIGHT -->
        <div class="row">
          <div class="lbl">Preview height</div>
          <div class="desc">Height of the preview area (px).</div>
          <input class="input" id="height"
            type="number"
            value="${height}" />
        </div>

        <!-- THUMB SIZE -->
        <div class="row">
          <div class="lbl">Thumb size</div>
          <div class="desc">Thumbnail size (px).</div>
          <input class="input" id="thumb"
            type="number"
            value="${thumbSize}" />
        </div>

        <!-- TIMESTAMP POSITION -->
        <div class="row">
          <div class="lbl">Timestamp position</div>
          <div class="desc">Position of the date/time bar.</div>
          <div class="segwrap">
            <button class="seg ${tsPos === "top" ? "on" : ""}" data-pos="top">Top</button>
            <button class="seg ${tsPos === "bottom" ? "on" : ""}" data-pos="bottom">Bottom</button>
            <button class="seg ${tsPos === "hidden" ? "on" : ""}" data-pos="hidden">Hidden</button>
          </div>
        </div>

      </div>
    `;

    const $ = (id) => this.shadowRoot.getElementById(id);

    $("entity")?.addEventListener("change", (e) => {
      this._set("entity", e.target.value.trim());
    });

    // ✅ Alias-proof shell input:
    // - if empty => remove BOTH keys (prevents old HA stored values from reappearing)
    // - if filled => write BOTH keys (keeps alias consistent)
    $("shell")?.addEventListener("change", (e) => {
      const v = String(e.target.value || "").trim();

      if (!v) {
        const next = { ...this._config };
        delete next.shell_command;
        delete next.delete_service;
        this._config = next;
        this._fire();
        this._render();
        return;
      }

      this._config = { ...this._config, shell_command: v, delete_service: v };
      this._fire();
      this._render();
    });

    $("height")?.addEventListener("change", (e) => {
      this._set("preview_height", Number(e.target.value) || 320);
    });

    $("thumb")?.addEventListener("change", (e) => {
      this._set("thumb_size", Number(e.target.value) || 140);
    });

    this.shadowRoot.querySelectorAll(".seg").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._set("bar_position", btn.dataset.pos);
      });
    });
  }
}

if (!customElements.get("camera-gallery-card-editor")) {
  customElements.define("camera-gallery-card-editor", CameraGalleryCardEditor);
}

console.info("CAMERA GALLERY EDITOR: registered OK");
