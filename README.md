# Camera Gallery Card

Camera Gallery Card is a fast and interactive media gallery card for Home Assistant.  
Browse doorbell snapshots and recordings in a clean timeline view, filter by day, scrub through events, preview media instantly, and manage files with built-in download and delete controls — directly from the card.

---

## Features

- Timeline-based media browsing
- Instant preview of images and videos
- Day filtering for quick navigation
- Smooth timeline scrubbing
- Download recordings directly from the card
- Delete media with immediate UI update
- Mode indicators (Home / Away / Night)
- Lightweight and fast rendering
- Fully local — no external services required

---

## Preview

The card displays:

- A large preview area for images and videos
- A timeline with event distribution
- Timeline thumbnails for quick navigation
- Media controls for download and deletion

Everything is optimized for speed and smooth interaction.

---

## Installation

1. Open **HACS → Frontend**
2. Click **⋮ → Custom repositories**
3. Add your repository URL
4. Select **Frontend**
5. Install the card
6. Reload Home Assistant
7. Hard refresh your browser (Ctrl+F5)

---

## Example Configuration

```yaml
type: custom:camera-gallery-card
entity: sensor.doorbell_media
media_path: /config/www/doorbell
mode_entity: input_select.house_mode
preview_height: 320
timeline: true
thumbs: true
thumbs_count: 12
thumb_size: 72
```

## File Sensor Setup

The card requires a **file sensor** that scans a directory and exposes the file list as an attribute.
This sensor is provided by a custom integration that you need to install first.

### 1. Install the Files integration

Install the **Files** custom component via [HACS](https://hacs.xyz/) or manually:

- **HACS:** Search for "Files" in the Integrations tab and install it.
- **Manual:** Copy the `files` folder to your `/config/custom_components/` directory.

> After installing, restart Home Assistant.

### 2. Create the sensor

Add the following to your `configuration.yaml`:

```yaml
sensor:
  - platform: files
    folder: /config/www/your_camera_folder
    name: your_camera_gallery
    sort: date
```

| Option   | Description                                                    |
|----------|----------------------------------------------------------------|
| `folder` | Path to the directory where your camera saves `.jpg` / `.mp4` files. Must be inside `/config/www/` so Home Assistant can serve them. |
| `name`   | Name of the sensor. This determines the entity ID (e.g. `sensor.your_camera_gallery`). |
| `sort`   | Sort order for the file list. Use `date` to show the most recent files first. |

**Example** for a doorbell camera:

```yaml
sensor:
  - platform: files
    folder: /config/www/doorbell/auto
    name: doorbell_gallery
    sort: date
```

### 3. Restart & verify

1. Restart Home Assistant (or reload the configuration).
2. Open **Developer Tools → States** and search for your sensor (e.g. `sensor.doorbell_gallery`).
3. Confirm the `fileList` attribute contains an array of file paths.

### 4. Add the card

In your Lovelace dashboard, add the **Camera Gallery Card** and set the **File sensor** to your sensor entity:

```yaml
type: custom:camera-gallery-card
entity: sensor.doorbell_gallery
```

> **Important:** Files must be inside `/config/www/` — Home Assistant serves this directory at the `/local/` URL path.
