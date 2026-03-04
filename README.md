# Camera Gallery Card

A lightweight, swipeable media gallery card for Home Assistant Lovelace. Browse `.jpg` snapshots and `.mp4` clips stored on your system — sorted by date, with day-by-day navigation, bulk selection, download, and delete support.

Now fully compatible with **Frigate Media Source** (images + video) with improved performance and light mode readability.

<table>
<tr>
<td><img src="https://github.com/user-attachments/assets/49a8f360-185a-4e8d-bd4d-3ae464a2ac1e" width="280"/></td>
<td><img src="https://github.com/user-attachments/assets/b62eb219-43fc-4238-af55-20d5ddf746ba" width="280"/></td>
</tr>
</table>

> **Current version:** 1.1.0

---

# Features

- Full-width preview with swipe navigation  
- Configurable preview position (top / bottom)  
- Optional preview-on-click behavior  
- Inline video playback (MP4 supported)  
- Optimized thumbnail loading (fixes lag with Frigate Media Source)  
- Day-by-day filtering with date navigation  
- Dual source mode (File sensor or Media folder)  
- Folder favorites selector (Media Mode)  
- Maximum thumbnail option to control how many items are loaded  
- Bulk select & delete mode (Sensor mode only)  
- One-tap download for any file  
- Configurable timestamp bar (top / bottom / hidden)  
- Adjustable timestamp bar opacity  
- Smart visual editor with improved light mode readability  
- Fully responsive, touch-friendly design  

---

# Installation

## HACS (recommended)

1. Open **HACS** in Home Assistant  
2. Go to **Frontend**  
3. Click the **⋮ menu → Custom repositories**  
4. Add this repository:

https://github.com/TheScubadiver/camera-gallery-card

5. Select **Dashboard** as the category  
6. Click **Add**  
7. Search for **Camera Gallery Card**  
8. Click **Install**  
9. Restart Home Assistant  

---

## Manual Installation

1. Download the latest release files:

camera-gallery-card.js  
camera-gallery-card-editor.js  

2. Copy both files to:

/config/www/camera-gallery-card/

3. Add the resource in **Settings → Dashboards → Resources**

URL: /local/camera-gallery-card/camera-gallery-card.js  
Type: JavaScript Module  

4. Restart Home Assistant

---

# Source Modes

The card supports two different ways to load media.

---

# File Sensor Mode

Uses a `sensor` entity with a `fileList` attribute containing file paths.

Example sensor output:

/config/www/camera-gallery/clip1.mp4  
/config/www/camera-gallery/snapshot1.jpg  

Example card configuration:

type: custom:camera-gallery-card  
source_mode: sensor  
entity: sensor.camera_files  

Advantages

✔ Full delete support  
✔ Works with any folder structure  
✔ Very fast loading  

Disadvantages

✖ Requires a sensor that provides file paths  

---

# Media Folder Mode

Loads files directly from Home Assistant **Media Source**.

This is the recommended method when using **Frigate**.

Example configuration:

type: custom:camera-gallery-card  
source_mode: media  
media_folder: frigate  

Advantages

✔ Works directly with Media Source  
✔ Perfect for Frigate clips and snapshots  
✔ No sensors required  

Disadvantages

✖ Delete functionality is not available  

---

# Frigate Media Source

The card is fully compatible with **Frigate Media Source**.

Typical folders:

frigate/clips  
frigate/snapshots  

Recommended configuration:

type: custom:camera-gallery-card  
source_mode: media  
media_folders_fav:  
  - frigate/clips  
  - frigate/snapshots  

In the editor you can also select folders using the **Choose folders** button.

---

# Folder Favorites (Media Mode)

When using **Media Folder Mode**, you can optionally limit the dropdown to selected folders.

Features

- Checkbox folder picker  
- Search field  
- All / None buttons  
- Clean YAML (key removed when empty)

Example:

media_folders_fav:  
  - frigate/clips  
  - frigate/snapshots  

---

# Delete Setup

In **File Sensor Mode**, the card can delete items. Home Assistant itself cannot delete arbitrary files, so you must provide a delete service.

The easiest way is using a `shell_command`.

Step 1 — Create a shell command

Add this to `configuration.yaml`:

shell_command:  
  camera_gallery_delete: 'bash -lc "rm -f -- \"{{ filepath }}\""'  

Restart Home Assistant after adding it.

Step 2 — Configure the card

type: custom:camera-gallery-card  
source_mode: sensor  
entity: sensor.camera_files  
delete_service: shell_command.camera_gallery_delete  

Safety note

For safety reasons the card only allows deleting files inside:

/config/www/

Your sensor should therefore output file paths like:

/config/www/camera-gallery/clip1.mp4  

Files outside this path will not be deleted.

---

# Example Configurations

Basic sensor example

type: custom:camera-gallery-card  
source_mode: sensor  
entity: sensor.camera_files  
preview_position: top  

Frigate example

type: custom:camera-gallery-card  
source_mode: media  
media_folders_fav:  
  - frigate/clips  
  - frigate/snapshots  
preview_position: top  

---

# Notes

- Supports `.jpg`, `.jpeg`, `.png`, `.webp`, `.mp4`  
- Automatically sorts files by timestamp  
- Designed for touch interaction  
- Works great on tablets and wall dashboards  

---

# License

MIT License
