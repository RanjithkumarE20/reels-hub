# Cloud + phone app setup (PC can be off)

How it works after setup:

| Time (IST) | What happens | Who |
|---|---|---|
| 10:00 · 13:30 · 20:00 | A new silent quote reel + 3 film songs that match the quote are ready | GitHub cloud |
| A few minutes later | 🔔 Pop-up on your phone: "New reel ready · Song idea: …" | Reels Picks app |
| When you're free (~1 min) | Pick a song → **Open in Instagram** → add the song → paste caption → Share or Schedule | You |
| 12:00 · 16:30 · 22:00 | Quote story posted to Instagram | GitHub cloud, automatic |

GitHub's free scheduler can start 5–30 minutes late. Your YouTube Shorts tasks keep running on the PC as before.

---

## Part A: GitHub (computer, 10 min)

### A1. Create a free GitHub account
- [ ] Go to https://github.com/signup and sign up (email → password → username → verify).

### A2. Create the repository
- [ ] Click **+** (top right) → **New repository**.
- [ ] Repository name: `reels-hub`
- [ ] **Public** (needed for the free website. Your token is stored as a secret and is never visible.)
- [ ] Leave "Add a README" **unticked** → **Create repository**.
- [ ] Copy the address shown, e.g. `https://github.com/YOURNAME/reels-hub.git`, and send it to Claude. Claude uploads the code; a GitHub sign-in window opens on your PC once, so sign in there.

### A3. Add your Instagram details as secrets
Repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Add three:

| Name | Value |
|---|---|
| `IG_ACCESS_TOKEN` | the token from `C:\Users\USER\reels-hub\.env` (the line `IG_ACCESS_TOKEN=`, everything after `=`) |
| `IG_USER_ID` | `17841415556616901` |
| `IG_HANDLE` | `rk.vlog.studio` |

### A4. Allow the workflows to save results
- [ ] **Settings** → **Actions** → **General** → scroll to **Workflow permissions** → **Read and write permissions** → **Save**.

### A5. First runs
- [ ] **Actions** tab → if asked, click **I understand my workflows, go ahead and enable them**.
- [ ] Click **apk** (left) → **Run workflow** → **Run workflow**. Wait about 5 minutes for the green ✓.
- [ ] Click **content** → **Run workflow** → job **pick** → **Run workflow**. Wait about 3 minutes for the green ✓.

### A6. Turn on the website
- [ ] **Settings** → **Pages** → Source: **Deploy from a branch** → Branch: **gh-pages** / **(root)** → **Save**.
- [ ] After 1–2 minutes it shows: *Your site is live at `https://YOURNAME.github.io/reels-hub/`*.

---

## Part B: Phone app (phone, 5 min)

### B1. Install
- [ ] On your phone, open `https://YOURNAME.github.io/reels-hub/ReelsPicks.apk` → **Download**.
- [ ] Open the downloaded file. If asked, allow **Install unknown apps** for your browser → **Install**.
  (Play Protect may warn that it's an unknown app; tap **More details → Install anyway**. It's your own app.)

### B2. First start
- [ ] Open **Reels Picks** → **Allow** notifications.
- [ ] You'll see the first reel with its 3 songs.

### B3. Make the pop-ups reliable
- [ ] Phone **Settings → Apps → Reels Picks → Battery → Unrestricted** (or "Don't optimise").
- [ ] **Notifications → Reel ready → Pop on screen / Show as pop-up**: on.
  (Samsung, Xiaomi, Vivo and Oppo also have **Autostart** or **Background activity** settings; turn them on for Reels Picks.)

---

## Part C: Switch the PC off duty (1 min)

The cloud now posts the stories, so the PC must stop posting them, or they'd be posted twice:
- [ ] In `C:\Users\USER\reels-hub\.env` set `IG_ENABLED=false` → save → restart Reels Hub
  (or ask Claude to do it).

---

## Part D (optional): hand-drawn AI pictures for the sketch-art reels (5 min, free)

The reels take turns between styles: **sketch art** (English or Tamil), **minimal** (moody photo + short stanza, English or Tamil) and **photo** (full-screen photo + English quote).
Without this part, the sketch-art reels use a real photo turned into a pencil sketch. With it, each one gets a new hand-drawn illustration made for the quote (couples, mothers, friends, lighthouses and so on).

1. Sign up free at https://dash.cloudflare.com/sign-up and verify your email.
2. **Account ID:** on the dashboard home, click **⋯** next to your account name → **Copy account ID**. (It is also shown in the right column under **Workers & Pages → Overview**.)
3. **API token:** go to https://dash.cloudflare.com/profile/api-tokens → **Create Token** → **Create Custom Token** → **Get started**.
   - Token name: `reels-ai`
   - Permissions: **Account** · **Workers AI** · **Read**
   - **Continue to summary** → **Create Token** → copy it (it's shown only once).
4. In GitHub, repository → **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
|---|---|
| `CF_ACCOUNT_ID` | the account ID |
| `CF_API_TOKEN` | the token |

The free daily allowance is many times more than 3 pictures a day. If it's ever used up or fails, that reel falls back to a sketched photo.

**Better background photos (optional, 2 min, free):** sign up at https://www.pexels.com/api/ → **Your API key** → copy it → add a GitHub secret named `PEXELS_API_KEY`. The photo and minimal reels then use Pexels photos (better quality, more people and moody scenes) instead of Wikimedia.

**Choosing styles:** GitHub → **Settings → Secrets and variables → Actions → Variables** tab → **New repository variable** → name `PICK_STYLES`, value e.g. `art-en,art-ta` (sketch only) or `minimal-ta,art-ta` (Tamil only). Default: `art-en,minimal-ta,photo,art-ta,minimal-en,minimal-ta`. Styles: `art-en`, `art-ta`, `photo`, `minimal-en`, `minimal-ta`.

---

## Daily use: about 1 minute per reel

1. 🔔 Tap the pop-up.
2. Press ▶ to hear the 3 songs → tap the one you like.
3. **Open in Instagram** → choose **Reels**.
4. Tap **🎵 Audio** → search the song name shown in the app → choose the part → **Next**.
5. Long-press the caption box → **Paste** (already copied) → **Share** (or **More options → Schedule**).
6. Back in Reels Picks → **✓ I posted it**.

If you don't post a reel within 2 hours, you get one reminder.

## Good to know
- **Updating the app:** each new build may ask you to uninstall the old one first, because it's a personal app not signed with a store key. Your settings are lost; nothing else is. The song screen itself updates by itself with no reinstall.
- **GitHub's rules:** the free cloud runners are meant for software projects. Small personal automations like this are common, but GitHub could pause the workflows. If that ever happens, the PC version still works (`IG_ENABLED=true`).
- **Running something by hand:** GitHub → **Actions** → **content** → **Run workflow** → choose `pick` or `quote-story`.

---

## Part E: automatic YouTube Shorts (5 min)

Every reel is also uploaded to your YouTube channel as a Short, with original background music and the matching song names in the description. It uses the same Google login as the PC's YouTube Shorts project, which keeps running exactly as before. Film songs can't be put in automatic uploads (copyright claims or strikes), so these use original music.

Add three GitHub secrets (repository → **Settings → Secrets and variables → Actions → New repository secret**):

| Name | Value |
|---|---|
| `YT_TOKEN_JSON` | open `C:\Users\USER\youtube-shorts-ai\token.json` in Notepad → **Ctrl+A** → **Ctrl+C** → paste everything |
| `CF_ACCOUNT_ID` | in `C:\Users\USER\youtube-shorts-ai\.env`, the text after `CF_ACCOUNT_ID=` |
| `CF_API_TOKEN` | in the same file, the text after `CF_API_TOKEN=` |

The Cloudflare key also turns on the hand-drawn AI pictures for the sketch reels.

Optional variables (**Variables** tab): `YT_PRIVACY` = `public` (default), `unlisted` or `private`; `YT_MAX_PER_DAY` = `3` (default; YouTube allows about 6 uploads a day in total, and the kids project uses 2).

To stop the YouTube uploads: delete the `YT_TOKEN_JSON` secret (or add the variable `YT_UPLOAD` = `false`).
