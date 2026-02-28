/* camera-gallery-card-editor.js
 * v1.0.0
 */

console.warn("CAMERA GALLERY EDITOR LOADED v1.0.0");

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

    // legacy cleanup always
    if (key !== "shell_command" && "shell_command" in this._config) {
      const next = { ...this._config };
      delete next.shell_command;
      this._config = next;
    }

    this._fire();
    this._render();
  }

  _render() {
    const c = this._config || {};

    const fileSensor = String(c.entity || "");
    const height = Number(c.preview_height) || 320;
    const thumbSize = Number(c.thumb_size) || 140;
    const tsPos = String(c.bar_position || "top");

    // ✅ REQUIRED key with legacy fallback (read only)
    const deleteService = String(c.delete_service || c.shell_command || "");
    const deleteOk = /^[a-z0-9_]+\.[a-z0-9_]+$/i.test(deleteService);

    // ✅ NEW: bar opacity (0-100)
    const barOpacity = (() => {
      const n = Number(c.bar_opacity);
      if (!Number.isFinite(n)) return 45;
      return Math.min(100, Math.max(0, n));
    })();

    const barDisabled = tsPos === "hidden";

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; padding:8px 0; }
        .wrap { display:grid; gap:14px; }

        .input::placeholder{
          color: rgba(255,255,255,0.45);
          opacity: 1; /* Safari */
        }
        .input::-webkit-input-placeholder{
          color: rgba(255,255,255,0.45);
        }

        .numwrap {
          position: relative;
          display: flex;
          align-items: center;
        }

        .numwrap .input {
          padding-right: 38px;
        }

        .suffix {
          position: absolute;
          right: 12px;
          font-size: 10px;
          font-weight: 500;
          opacity: 0.40;
          pointer-events: none;
        }

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

        .input.invalid{
          border-color: rgba(255, 77, 77, 0.85);
          box-shadow: 0 0 0 2px rgba(255, 77, 77, 0.18);
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

        /* ===== Slider row ===== */
        .row.disabled {
          opacity: 0.55;
        }

        .sliderline{
          display:flex;
          align-items:center;
          gap:10px;
        }

        .slider {
          width:100%;
          accent-color: #ffffff; /* simple + ok in modern browsers */
        }

        .pillval{
          flex: 0 0 auto;
          min-width: 52px;
          text-align: center;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(255,255,255,0.10);
          border: 1px solid rgba(255,255,255,0.10);
          font-size: 12px;
          font-weight: 900;
        }

        code { font-weight:900; }
      </style>

      <div class="wrap">

        <!-- FILE SENSOR -->
        <div class="row">
          <div class="lbl">File sensor</div>
          <div class="desc">
            Sensor entity that contains the <code>fileList</code> attribute
          </div>
          <input
            class="input"
            id="entity"
            type="text"
            inputmode="text"
            autocomplete="off"
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            enterkeyhint="done"
            placeholder="example: sensor.gallery_persoon"
            value="${fileSensor}"
          />
        </div>

        <!-- DELETE SERVICE (REQUIRED) -->
        <div class="row">
          <div class="lbl">Delete service</div>
          <div class="desc">
            Service to call for deletion (<code>domain.service</code>)
          </div>
          <input
            class="input ${deleteOk ? "" : "invalid"}"
            id="delservice"
            type="text"
            inputmode="text"
            autocomplete="off"
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            enterkeyhint="done"
            placeholder="example: shell_command.gallery_delete"
            value="${deleteService}"
          />
        </div>

        <!-- PREVIEW HEIGHT -->
        <div class="row">
          <div class="lbl">Preview height</div>
          <div class="numwrap">
            <input
              class="input"
              id="height"
              type="number"
              min="120"
              step="1"
              inputmode="numeric"
              value="${height}"
            />
            <span class="suffix">px</span>
          </div>
        </div>

        <!-- THUMB SIZE -->
        <div class="row">
          <div class="lbl">Thumbnail size</div>
          <div class="numwrap">
            <input
              class="input"
              id="thumb"
              type="number"
              min="40"
              max="220"
              step="1"
              inputmode="numeric"
              value="${thumbSize}"
            />
            <span class="suffix">px</span>
          </div>
        </div>

        <!-- TIMESTAMP POSITION -->
        <div class="row">
          <div class="lbl">Timestamp position</div>
          <div class="desc">Position of the date/time bar</div>
          <div class="segwrap">
            <button class="seg ${tsPos === "top" ? "on" : ""}" data-pos="top">Top</button>
            <button class="seg ${tsPos === "bottom" ? "on" : ""}" data-pos="bottom">Bottom</button>
            <button class="seg ${tsPos === "hidden" ? "on" : ""}" data-pos="hidden">Hidden</button>
          </div>
        </div>

        <!-- BAR OPACITY (SLIDER) -->
        <div class="row ${barDisabled ? "disabled" : ""}">
          <div class="lbl">Bar opacity</div>
          <div class="desc">Opacity of the timestamp bar (0–100)</div>
          <div class="sliderline">
            <input
              class="slider"
              id="barop"
              type="range"
              min="0"
              max="100"
              step="1"
              value="${barOpacity}"
              ${barDisabled ? "disabled" : ""}
            />
            <div class="pillval" id="baropVal">${barOpacity}%</div>
          </div>
        </div>

      </div>
    `;

    const $ = (id) => this.shadowRoot.getElementById(id);

    $("entity")?.addEventListener("change", (e) => {
      this._set("entity", String(e.target.value || "").trim());
    });

    $("delservice")?.addEventListener("change", (e) => {
      const v = String(e.target.value || "").trim();

      const next = { ...this._config };

      // legacy cleanup
      delete next.shell_command;

      if (!v) {
        delete next.delete_service;
        this._config = next;
        this._fire();
        this._render();
        return;
      }

      next.delete_service = v;
      this._config = next;
      this._fire();
      this._render();
    });

    $("height")?.addEventListener("change", (e) => {
      this._set("preview_height", Number(e.target.value) || 320);
    });

    $("thumb")?.addEventListener("change", (e) => {
      this._set("thumb_size", Number(e.target.value) || 140);
    });

    const barop = $("barop");
    const baropVal = $("baropVal");
    if (barop && baropVal) {
      barop.addEventListener("input", (e) => {
        const v = Math.min(100, Math.max(0, Number(e.target.value) || 0));
        baropVal.textContent = `${v}%`;
      });
      barop.addEventListener("change", (e) => {
        const v = Math.min(100, Math.max(0, Number(e.target.value) || 0));
        this._set("bar_opacity", v);
      });
    }

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
