# Camera Gallery Card
Camera Gallery Card is a fast and interactive media gallery card for Home Assistant. Browse doorbell snapshots and recordings in a clean timeline view, filter by day, scrub through events, preview media instantly, and manage files with built-in download and delete controls — all directly from the card.

Features

Timeline-based media browsing

Instant preview of images and videos

Day filtering for quick navigation

Smooth timeline scrubbing

Download recordings directly from the card

Delete media with immediate UI update

Mode indicators (e.g. Home / Away / Night)

Lightweight and fast rendering

Fully local — no external services required

Preview

The card displays:

A large preview area for images and videos

A timeline with event distribution

Timeline thumbnails for quick navigation

Media controls for download and deletion

Everything is optimized for speed and smooth interaction.

Installation
HACS (Recommended)

Open HACS → Frontend

Click ⋮ → Custom repositories

Add your repository URL

Select Frontend

Install the card

Reload Home Assistant

Hard refresh your browser (Ctrl+F5)

After installation, the card will be available in the Lovelace card picker.

Manual Installation

Download doorbell-timeline-gallery.js

Place it in:

/config/www/doorbell-card/

Add resource in Home Assistant:

url: /local/doorbell-card/doorbell-timeline-gallery.js
type: module

Reload Home Assistant

Hard refresh browser

Usage

Add the card to your dashboard:

type: custom:doorbell-timeline-gallery
entity: sensor.doorbell_files
media_path: /config/www/doorbell
Configuration
Option	Description
entity	Sensor providing media file list
media_path	Path to stored media files
mode_entity	Optional mode indicator (home/away/night)
preview_height	Preview height in pixels
timeline	Enable/disable timeline
thumbs	Enable/disable thumbnails
thumbs_count	Number of timeline thumbnails
thumb_size	Thumbnail size in pixels
Example Configuration
type: custom:doorbell-timeline-gallery
entity: sensor.doorbell_media
mode_entity: input_select.house_mode
media_path: /config/www/doorbell
preview_height: 320
timeline: true
thumbs: true
thumbs_count: 12
thumb_size: 72
Requirements

Home Assistant (latest recommended)

Media stored locally (images or MP4)

Sensor providing file list

Modern browser (Chrome / Safari / Edge)

Performance

The card is optimized for:

Fast rendering

Large media collections

Instant preview switching

Minimal memory usage

Media is loaded only when needed to keep the UI smooth.

Troubleshooting

Card not visible

Clear browser cache (Ctrl+F5)

Check resource path

Reload Home Assistant

No media shown

Verify media_path

Check sensor output

Confirm file permissions

Editor not loading

Hard refresh browser

Ensure correct JS version is loaded

Roadmap

Possible future improvements:

Multi-camera support

Search & filtering

Event tagging

Auto cleanup / retention control

Mobile gesture improvements

Contributing

Pull requests and ideas are welcome.
If you find bugs or have feature requests, open an issue.

License

MIT License
