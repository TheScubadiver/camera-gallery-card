# Camera Gallery Card

A lightweight, swipeable media gallery card for [Home Assistant](https://www.home-assistant.io/) Lovelace.  
Browse `.jpg` snapshots and `.mp4` clips stored on your system — sorted by date, with day-by-day navigation, bulk selection, download, and delete support.

<table>
  <tr>
    <td><img src="https://github.com/user-attachments/assets/49a8f360-185a-4e8d-bd4d-3ae464a2ac1e" width="280" /></td>
    <td><img src="https://github.com/user-attachments/assets/b62eb219-43fc-4238-af55-20d5ddf746ba" width="280" /></td>
  </tr>
</table>

> **Current version:** 1.0.3

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [File Sensor Setup](#file-sensor-setup)
- [Automation Example](#automation-example)
- [Card Configuration](#card-configuration)
- [Delete Setup](#delete-setup)
- [File Naming Convention](#file-naming-convention)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

<a id="features"></a>
## Features

- 🖼️ Full-width preview with swipe navigation
- 🎬 Inline video playback with auto-generated poster thumbnails
- 📅 Day-by-day filtering with date navigation
- ✅ Bulk select & delete mode
- ⬇️ One-tap download for any file
- 🕒 Configurable timestamp bar (top / bottom / hidden)
- 🔆 Adjustable timestamp bar opacity
- 🎨 Visual editor — no YAML needed
- 📱 Fully responsive, touch-friendly design

---

<a id="installation"></a>
## Installation

### HACS (recommended)

1. Open HACS in Home Assistant.
2. Go to **Frontend** → click the **⋮** menu → **Custom repositories**.
3. Add this repository URL: `https://github.com/TheScubadiver/camera-gallery-card`
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

<a id="file-sensor-setup"></a>
## File Sensor Setup

The card requires a **file sensor** that scans a directory and exposes the file list as an attribute.

Add the following to your `configuration.yaml`:

```yaml
sensor:
  - platform: files
    folder: /config/www/your_camera_folder
    name: your_camera_gallery
    sort: date
```

---

<a id="automation-example"></a>
## Automation Example

```yaml
automation:
  - alias: "Camera snapshot on motion"
    trigger:
      - platform: state
        entity_id: binary_sensor.motion
        to: "on"
    action:
      - service: camera.snapshot
        target:
          entity_id: camera.doorbell
        data:
          filename: "/config/www/doorbell/{{ now().strftime('%Y%m%d_%H%M%S') }}.jpg"
```

---

<a id="card-configuration"></a>
## Card Configuration

```yaml
type: custom:camera-gallery-card
entity: sensor.doorbell_gallery
delete_service: shell_command.delete
preview_height: 320
thumb_size: 140
bar_position: top
bar_opacity: 45
allow_delete: true
allow_bulk_delete: true
delete_confirm: true
```

---

<a id="delete-setup"></a>
## Delete Setup

```yaml
shell_command:
  delete: "rm -f '{{ path }}'"
```

Use in the card:

```yaml
delete_service: shell_command.delete
```

---

<a id="file-naming-convention"></a>
## File Naming Convention

```
YYYYMMDD-HHMMSS.jpg
YYYYMMDD_HHMMSS.mp4
```

---

<a id="troubleshooting"></a>
## Troubleshooting

**Card not showing**

- Verify resource is added correctly
- Hard refresh browser

**No media found**

- Verify sensor exists
- Confirm `fileList` contains file paths

---

<a id="license"></a>
## License

MIT © [TheScubadiver](https://github.com/TheScubadiver)
