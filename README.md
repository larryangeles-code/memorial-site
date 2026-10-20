# memorial-site

Static memorial website with a photo slideshow controlled by `photos.js`.

## Adding client photos

1. Create a new, date-labeled folder under `photos/`, for example `photos/2026-10-20/`. Keep the original photo filenames and files intact.
2. Copy that client's newly received images into the folder. Existing photos can stay where they are.
3. Ask for the new folder to be scanned, duplicate photos to be skipped in the slideshow, `photos.js` to be updated, and the changes to be verified and pushed to GitHub.

You can also add more files to an existing batch folder. We can compare the folder against `photos.js` to find which ones have not yet been included.

**Important:** Simply adding image files to a folder will not make them appear on the website. This is a static site; `photos.js` lists the exact image paths shown in the slideshow. The slideshow code in `script.js` reads that list.

For clarity, use a fresh dated folder for each future delivery rather than reusing `photos/New/`. The existing `photos/New/` folder contains an earlier batch and remains supported.
