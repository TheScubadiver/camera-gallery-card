# Camera Gallery Card

A lightweight, swipeable media gallery card for [Home Assistant](https://www.home-assistant.io/) Lovelace.  
Browse `.jpg` snapshots and `.mp4` clips stored on your system — sorted by date, with day-by-day navigation, bulk selection, download, and delete support.

Now fully compatible with Frigate Media Source (images + video) with improved performance and light mode readability.

<table>
  <tr>
    <td><img src="https://github.com/user-attachments/assets/49a8f360-185a-4e8d-bd4d-3ae464a2ac1e" width="280" /></td>
    <td><img src="https://github.com/user-attachments/assets/b62eb219-43fc-4238-af55-20d5ddf746ba" width="280" /></td>
  </tr>
</table>

> **Current version:** 1.1.0

---

## Features

- 🖼️ Full-width preview with swipe navigation  
- 📍 Configurable preview position (top / bottom)  
- 👆 Optional preview-on-click behavior  
- 🎬 Inline video playback (MP4 supported)  
- ⚡ Optimized thumbnail loading (fixes lag with Frigate Media Source)  
- 📅 Day-by-day filtering with date navigation  
- 🔄 Dual source mode (File sensor or Media folder)  
- 📁 Folder favorites selector (Media Mode, compact checkbox picker)  
- 📦 Maximum thumbnail option to control how many items are loaded  
- ✅ Bulk select & delete mode (sensor mode only)  
- ⬇️ One-tap download for any file  
- 🕒 Configurable timestamp bar (top / bottom / hidden)  
- 🔆 Adjustable timestamp bar opacity  
- 🎨 Smart visual editor with improved light mode readability  
- 📱 Fully responsive, touch-friendly design  

---

## Installation

### HACS (recommended)

1. Open HACS in Home Assistant.
2. Go to **Frontend** → click the **⋮** menu → **Custom repositories**.
3. Add this repository URL:  
   `https://github.com/TheScubadiver/camera-gallery-card`
4. Select **Dashboard** as the category and click **Add**.
5. Search for **Camera Gallery Card** and click **Install**.
6. Restart Home Assistant.

### Manual

1. Download `camera-gallery-card.js` and `camera-gallery-card-editor.js` from the latest release.
2. Copy both files to `/config/www/camera-gallery-card/`.
3. Add the resource in **Settings → Dashboards → Resources**:
   - **URL:** `/local/camera-gallery-card/camera-gallery-card.js`
   - **Type:** JavaScript Module
4. Restart Home Assistant.

---

## Source Modes

### File Sensor Mode

Uses a `sensor` entity with a `fileList` attribute.  
This mode supports delete functionality.

### Media Folder Mode

Loads files directly from Home Assistant’s Media Source browser.

✔ Fully compatible with Frigate Media Source  
✔ Supports images and video files  
✖ Delete functionality is not available in this mode  

---

## Folder Favorites (Media Mode)

When using **Media Folder Mode**, you can optionally limit the dropdown to selected folders.

- Click **Choose folders**
- Select folders using checkboxes
- Use **Search**, **All**, or **None**
- Clean YAML: the key is removed automatically when empty

Optional configuration:

```yaml
media_folders_fav:
  - frigate/clips
  - frigate/snapshots
