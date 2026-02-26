# Camera Gallery Card

Camera Gallery Card is a fast and interactive media gallery card for Home Assistant.  
Browse doorbell snapshots and recordings in a clean timeline view, filter by day, scrub through events, preview media instantly, and manage files with built-in download and delete controls — directly from the card.

---

## ✨ Features

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

## 🖼 Preview

The card displays:

- A large preview area for images and videos
- A timeline with event distribution
- Timeline thumbnails for quick navigation
- Media controls for download and deletion

Everything is optimized for speed and smooth interaction.

---

## 🚀 Installation (HACS - Recommended)

1. Open **HACS → Frontend**
2. Click **⋮ → Custom repositories**
3. Add your repository URL
4. Select **Frontend**
5. Install the card
6. Reload Home Assistant
7. Hard refresh your browser (Ctrl+F5)

---

## ⚙ Example Configuration

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
