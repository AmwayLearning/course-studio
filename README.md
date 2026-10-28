# Course Studio

A Rise-style authoring tool for xAPI (Tin Can) courses, plus a shared library of every course you make or upload.

- **Build** courses with blocks: headings, text, images, image & text, video, quotes, callouts, lists, accordions, tabs, flip cards, process steps, knowledge checks, dividers and continue buttons.
- **Preview** any course on desktop, tablet or phone, and watch the xAPI statements it sends, live.
- **Export** a standard xAPI zip (`tincan.xml` + `index.html`) that works in any xAPI LMS.
- **Upload** xAPI zips you already have (Articulate Rise, Storyline and others). Open their files, read and edit the code, and download them.
- **Share** a link to any course.

Courses are saved in a Google Sheet + Google Drive (see `SETUP-STEPS.md`), or only in your browser until you connect one.

## Files

| File | What it does |
|---|---|
| `index.html` | The studio page. The `STUDIO_API_URL` line connects it to your Google Sheet. |
| `app.js`, `app.css` | Library, course pages, files & code viewer, upload, preview, sharing |
| `editor.js` | The block editor |
| `package.js` | Builds the xAPI zip from a course |
| `runtime/` | The course player that goes inside every exported course |
| `sw.js` | Lets the studio play courses straight from a zip, with a test LRS for previews |
| `vendor/` | JSZip, CodeMirror and a QR code library |
| `apps-script/Code.gs` | The Google Apps Script that stores courses in your Sheet and Drive |
