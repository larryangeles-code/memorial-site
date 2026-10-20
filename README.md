# memorial-site

Static memorial website with a photo slideshow controlled by `photos.js`.

## Adding client photos

1. Create a new, date-labeled folder under `photos/`, for example `photos/2026-10-20/`. Keep the original photo filenames and files intact.
2. Copy that client's newly received images into the folder. Existing photos can stay where they are.
3. Ask for the new folder to be scanned, duplicate photos to be skipped in the slideshow, `photos.js` to be updated, and the changes to be verified and pushed to GitHub.

You can also add more files to an existing batch folder. We can compare the folder against `photos.js` to find which ones have not yet been included.

**Important:** Simply adding image files to a folder will not make them appear on the website. This is a static site; `photos.js` lists the exact image paths shown in the slideshow. The slideshow code in `script.js` reads that list.

For clarity, use a fresh dated folder for each future delivery rather than reusing `photos/New/`. The existing `photos/New/` folder contains an earlier batch and remains supported.

## Cinematic design

The full-page redesign lives on `feature/cinematic-slideshow`. It includes an integrated photo hero, music player, family quotation, four biography chapters, Memory Wall and closing tribute. The original biography, dates, quote, image order and audio file are preserved.

- `index.html`: semantic page structure, native audio and no-JavaScript photo fallback.
- `style.css`: responsive charcoal/champagne/ivory theme and restrained motion.
- `script.js`: photo loading, parallax, liquid ripple, navigation and pause/resume.
- `site-effects.js`: scroll reveals, offscreen animation suspension and custom audio controls.
- `memory-wall.js`: existing Apps Script integration, unchanged.

Desktop has the name and photo side by side. On smaller screens, the entire photo is above the introduction rather than underneath its text. Reduced-motion visitors start with the slideshow paused. The photo dwell time is 6.5 seconds; audio only plays after a visitor presses Play.

## Local review and tests

Open `index.html` in a browser to review the local checkout. No build step or package installation is required for the website. A local static HTTP server is also suitable.

With Node.js 22.4+ installed, run:

```text
node --test tests/site.test.cjs
node tests/browser-smoke.cjs
```

The browser checks use an installed Chrome or Edge; set `BROWSER_EXE` to override its location. They start a temporary loopback-only server and a separate headless browser profile, then close both when finished. Screenshots and `report.json` are saved under the OS temporary directory printed by the test. They are not deployed with the site. Content-preservation checks use the immutable pre-redesign commit `4a5abbcf2cc47313bae4a45836449c98f9dc9a8c`.

**Test safety:** The automated browser suite intercepts the Memory Wall API and uses local fixtures. It never submits a real memory. A regular browser preview, however, uses the real Apps Script endpoint: do not submit test messages unless you intend to send them to the live moderation system.

Before client review, also check an actual phone, audio volume, scrolling and the preferred animation intensity. Automated mobile viewport checks are not a substitute for Safari/physical-device testing.

## Publishing caution

A feature branch is not automatically a separate preview website. GitHub Pages publishes whichever branch is selected under **Settings > Pages**. If that source is `feature/cinematic-slideshow`, pushing this branch updates the public website even while `main` remains unchanged.

Check the current source before pushing. This redesign does not itself change Pages settings, merge into `main`, or isolate the live Memory Wall backend. To restore the original published site, choose `main` as the Pages source and wait for that deployment to complete before deleting the feature branch.
