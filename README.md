# Camera Gallery Card

A lightweight, swipeable media gallery card for [Home Assistant](https://www.home-assistant.io/) Lovelace.
Browse `.jpg` snapshots and `.mp4` clips stored on your system — sorted by date, with day-by-day navigation, bulk selection, download, and delete support.

> **Current version:** 1.0.2

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

## Features

- 🖼️ Full-width preview with swipe navigation
- 🎬 Inline video playback with auto-generated poster thumbnails
- 📅 Day-by-day filtering with date navigation
- ✅ Bulk select & delete mode
- ⬇️ One-tap download for any file
- 🕒 Configurable timestamp bar (top / bottom / hidden)
- 🎨 Visual editor — no YAML needed
- 📱 Fully responsive, touch-friendly design

---

## Installation

### HACS (recommended)

1. Open HACS in Home Assistant.
2. Go to **Frontend** → click the **⋮** menu → **Custom repositories**.
3. Add this repository URL: `https://github.com/TheScubadiver/camera-gallery-card`
4. Select **Dashboard** as the category and click **Add**.
5. Search for **Camera Gallery Card** and click **Install**.
6. Restart Home Assistant.

### Manual

1. Download `camera-gallery-card.js` and `camera-gallery-card-editor.js` from the [latest release](https://github.com/TheScubadiver/camera-gallery-card/releases).
2. Copy both files to `/config/www/camera-gallery-card/`.
3. Add the resource in **Settings → Dashboards → Resources**:
   - **URL:** `/local/camera-gallery-card/camera-gallery-card.js`
   - **Type:** JavaScript Module
4. Restart Home Assistant.

---

## File Sensor Setup

The card requires a **file sensor** that scans a directory and exposes the file list as an attribute.
This sensor is provided by a custom integration that you need to install first.

### 1. Install the Files integration

Install the **Files** custom component via [HACS](https://hacs.xyz/) or manually:

- **HACS:** Search for **Files** in the Integrations tab and install it.
- **Manual:** Copy the `files` folder to your `/config/custom_components/` directory.

After installing, restart Home Assistant.

### 2. Create the sensor

Add the following to your `configuration.yaml`:

```yaml
sensor:
  - platform: files
    folder: /config/www/your_camera_folder
    name: your_camera_gallery
    sort: date
```

| Option   | Description |
|----------|-------------|
| `folder` | Path to the directory where your camera saves `.jpg` / `.mp4` files. **Must be inside `/config/www/`** so Home Assistant can serve them. |
| `name`   | Name of the sensor. Determines the entity ID (e.g. `sensor.your_camera_gallery`). |
| `sort`   | Sort order for the file list. Use `date` to show the most recent files first. |

**Example** for a doorbell camera:

```yaml
sensor:
  - platform: files
    folder: /config/www/doorbell/auto
    name: doorbell_gallery
    sort: date
```

### 3. Verify the sensor

1. Restart Home Assistant (or reload the configuration).
2. Go to **Developer Tools → States** and search for your sensor (e.g. `sensor.doorbell_gallery`).
3. Confirm the `fileList` attribute contains an array of file paths.

---

## Automation Example

To populate the gallery, create an automation that saves a snapshot when motion is detected (or any other trigger). The key is the **action** — it saves the file with the correct naming pattern so the card can extract dates and times.

### Snapshot (`.jpg`)

```yaml
automation:
  - alias: "Camera snapshot on motion"
    trigger:
      - platform: state
        entity_id: binary_sensor.your_motion_sensor
        to: "on"
    action:
      - service: camera.snapshot
        target:
          entity_id: camera.your_camera
        data:
          filename: "/config/www/your_camera_folder/{{ now().strftime('%Y%m%d_%H%M%S') }}.jpg"
```

### Video clip (`.mp4`)

If your camera integration supports recording clips:

```yaml
automation:
  - alias: "Camera clip on motion"
    trigger:
      - platform: state
        entity_id: binary_sensor.your_motion_sensor
        to: "on"
    action:
      - service: camera.record
        target:
          entity_id: camera.your_camera
        data:
          filename: "/config/www/your_camera_folder/{{ now().strftime('%Y%m%d_%H%M%S') }}.mp4"
          duration: 10
```

> **Important:** Make sure the `filename` path matches the `folder` in your [file sensor](#file-sensor-setup). The `%Y%m%d_%H%M%S` format produces filenames like `20250227_143022.jpg` which the card uses for date filtering and timestamps.

---

## Card Configuration

### Visual editor

The card has a built-in visual editor. Add the card to your dashboard and configure it through the UI — no YAML required.

### YAML

```yaml
type: custom:camera-gallery-card
entity: sensor.doorbell_gallery
preview_height: 320
thumb_size: 140
bar_position: top
shell_command: shell_command.delete
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `entity` | string | **required** | Entity ID of your file sensor (must have a `fileList` attribute). |
| `preview_height` | number | `320` | Height of the preview area in pixels. |
| `thumb_size` | number | `140` | Thumbnail size in pixels (min: 40, max: 220). |
| `bar_position` | string | `top` | Position of the timestamp bar: `top`, `bottom`, or `hidden`. |
| `shell_command` | string | `shell_command.delete` | Service to call when deleting files (format: `domain.service`). |

---

## Delete Setup

The card can delete files by calling a shell command service. To enable this:

### 1. Create the shell command

Add the following to your `configuration.yaml`:

```yaml
shell_command:
  delete: "rm -f '{{ path }}'"
```

> ⚠️ **Warning:** This permanently deletes files. Make sure your camera folder path is correct and consider adding backups.

### 2. Configure the card

Set the `shell_command` option to match the service name:

```yaml
shell_command: shell_command.delete
```

### 3. Restart Home Assistant

The delete and bulk delete buttons will now be active.

---

## File Naming Convention

The card extracts dates and times from filenames to enable day filtering and timestamp display. Files should follow this naming pattern:

```
YYYYMMDD-HHMMSS.jpg
YYYYMMDD_HHMMSS.mp4
```

**Examples:**
- `20250227-143022.jpg` → February 27, 2025 at 14:30:22
- `20250227_090000.mp4` → February 27, 2025 at 09:00:00

If filenames do not contain a date pattern, the card still works but day filtering and timestamps will not be available.

---

## Troubleshooting

**Card not showing up after installation**
- Make sure the resource is added correctly in **Settings → Dashboards → Resources**.
- Clear your browser cache or do a hard refresh (`Ctrl + Shift + R`).

**"No media found" message**
- Check that your file sensor entity exists in **Developer Tools → States**.
- Verify the `fileList` attribute contains an array of file paths.
- Make sure your files are inside `/config/www/` (served at `/local/`).

**Delete not working**
- Verify the shell command exists: check **Developer Tools → Services** for your service.
- Make sure the file paths start with `/config/www/`.
- Check your Home Assistant logs for permission errors.

**Videos not playing**
- Ensure your `.mp4` files are encoded with H.264 video and AAC audio for maximum browser compatibility.

---

## License

MIT © [TheScubadiver](https://github.com/TheScubadiver)
