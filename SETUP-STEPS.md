# Course Studio — setup steps

Course Studio is completely separate from your W.I.S.E LMS. It gets its own GitHub repository, its own link and its own Google Sheet. Nothing in your LMS changes.

Your studio will live at:
**https://muhamadnadjmi98-byte.github.io/course-studio/**

- **Part 1** puts the studio online. You can try everything straight away, but courses are saved only in the browser you use.
- **Part 2** connects a Google Sheet + Drive, so everyone sees the same courses and editors use a PIN.

---

## Part 1 — Put the studio online (about 10 minutes)

### A. Make a new repository in GitHub Desktop
1. Unzip **Course-Studio.zip**. You get a folder called **course-studio**.
2. Open **GitHub Desktop**.
3. Click **File → New repository…**
4. Fill in:
   - **Name:** `course-studio`
   - **Local path:** choose a place you'll remember, e.g. your **Documents** folder
   - Leave everything else as it is.
5. Click **Create repository**.
6. Click **Repository → Show in Explorer**. An empty **course-studio** folder opens (it may have a `.gitattributes` file — that's fine).
7. Open the **course-studio** folder from the zip, select **everything inside it** (`index.html`, `app.js`, the `runtime` and `vendor` folders, and so on) and copy it into the folder that just opened.
   - ✅ Check: `index.html` is directly inside the folder, not inside another `course-studio` folder.

### B. Publish it
8. Go back to GitHub Desktop. The files show on the left under **Changes**.
9. In **Summary** (bottom left) type `Add Course Studio`, then click **Commit to main**.
10. Click **Publish repository** (top right).
11. **Untick "Keep this code private"** (free GitHub Pages only works for public repositories), then click **Publish repository**.
    - The code becomes public. Your courses don't — they're stored in your Google Drive after Part 2.

### C. Switch on GitHub Pages
12. In GitHub Desktop, click **Repository → View on GitHub**. Your repository opens in the browser.
13. Click **Settings** (top row) → **Pages** (left side).
14. Under **Build and deployment → Source**, choose **Deploy from a branch**.
15. Under **Branch**, choose **main** and **/(root)**, then click **Save**.
16. Wait 1–2 minutes, then refresh the page. A box appears saying *Your site is live at …*
17. Open **https://muhamadnadjmi98-byte.github.io/course-studio/**
    - ✅ Check: you see **Build courses. Share the code.** and an orange *Saved in this browser* label at the top.

Try it now: click **New course → Sample course**, then **Preview**.

---

## Part 2 — Connect a Google Sheet + Drive (about 10 minutes)

### A. Make the Google Sheet
1. Go to **sheets.new**.
2. Name it `Course Studio` (click *Untitled spreadsheet* at the top left).
3. Click **Extensions → Apps Script**.

### B. Paste the script and choose your PIN
4. Delete everything in `Code.gs`.
5. Open **apps-script/Code.gs** from the zip with Notepad, copy everything and paste it in.
6. Near the top, change
   `const EDITOR_PIN = 'CHANGE-ME';`
   to your own PIN (at least 4 characters), e.g. `const EDITOR_PIN = 'studio2026';`
7. Click **Save** (💾).

### C. Run setup once
8. In the toolbar, pick **setup** in the function list and click **Run**.
9. Google asks for permission. Click **Review permissions** → your account → **Advanced** → **Go to … (unsafe)** → **Allow**.
   - It asks for **Sheets** (the course list) and **Drive** (the course files). It says "unsafe" only because you wrote the script yourself.
10. ✅ Check: the Sheet now has a **Courses** tab and a **Change log** tab, and your Google Drive has a new folder called **Course Studio files**.

### D. Publish it as a Web app
11. Click **Deploy → New deployment**.
12. Click the gear ⚙ next to *Select type* → **Web app**.
13. **Execute as: Me**, **Who has access: Anyone**.
14. Click **Deploy** and **Copy** the **Web app URL** (it ends in `/exec`).

### E. Connect the studio
15. In GitHub Desktop: **Repository → Show in Explorer**, then open **index.html** with Notepad.
16. Find `window.STUDIO_API_URL = '';` and paste your URL between the quotes:
    `window.STUDIO_API_URL = 'https://script.google.com/macros/s/AKfy…/exec';`
17. Save. In GitHub Desktop: **Summary** `Connect Google Sheet` → **Commit to main** → **Push origin**.
18. Wait 1–2 minutes, open the studio and press **Ctrl+Shift+R**.
    - ✅ Check: the orange *Saved in this browser* label is gone and you see **Unlock editing**.
19. Click **Unlock editing**, type your name and PIN.
    - ✅ Check: your name appears at the top right.

Courses you made in Part 1 stayed in that browser. To move one across: open it, click **Download xAPI zip**, then after Part 2 click **Upload xAPI zip** and choose **Import as editable**.

---

## Everyday use

**Make a course:** **New course** → *Blank* or *Sample*. Hover between blocks and click **+** to add one. Select text to make it bold, add links or lists. Drag blocks by the ⋮⋮ handle. Everything saves by itself (watch the dot next to the title). **Ctrl+Z** undoes.

**Course look and rules:** **Settings** in the editor → cover picture, colour, font, pass mark, navigation (free or restricted), and when the course counts as complete.

**Try it as a learner:** **Preview**. Switch between desktop, tablet and phone. Click **xAPI** to see each statement the course sends.

**Put it in an LMS:** **Export xAPI** (in the editor) or **Download xAPI zip** (on the course page). Upload that zip to any LMS that supports xAPI / Tin Can, including your W.I.S.E LMS (copy the unzipped folder into its `courses` folder like your other courses).

**Upload an existing course:** **Upload xAPI zip**. Rise, Storyline and other xAPI packages work. SCORM packages don't — re-export them as xAPI.

**Read or change the code:** open a course → **Files & code**. Click any file to read it. On uploaded packages you can type straight into the code and click **Save**; a new version is stored.

**Share:** **Share** on a course page → copy the link, WhatsApp, Email or QR code.

---

## Good to know

- **Who can see what:** anyone with the studio link can view, preview and download every course, including drafts. Only people with the PIN can create, edit or delete. Don't put material here that must stay private (for example the internal-only ABO PDFs).
- **Big packages:** files are stored in 3 MB pieces, so an 80 MB Rise course takes about a minute to upload. Each person's browser downloads a package once, then remembers it.
- **History:** click the clock icon next to your name, or open the **Change log** tab in the Sheet.
- **Change the PIN:** edit `EDITOR_PIN`, save and run **setup** again. No redeploy needed.
- **10 wrong PINs** lock editing for 10 minutes.
- **Deleted courses** go to the Google Drive bin, so you can recover the files for 30 days.
