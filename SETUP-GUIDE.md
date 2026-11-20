# Reels Hub + Instagram: complete setup, start to finish

Total time: about 1 hour, once. After that, posting is automatic.
Your YouTube Shorts tasks (8:00 AM and 6:00 PM) are not touched by any of these steps.

---

## PART 1: Instagram account (phone, 10 min)

### Step 1. Choose a username
- [ ] Instagram app → your profile → tap your username at the top → **Add account / Create new account**. Or use your existing account: profile → **Edit profile → Username**.
- [ ] Ideas: `isai.quotes`, `vaarthai.isai`, `words.and.raaga`, `quotes.n.isai`. Instagram shows a ✓ if the name is free.

### Step 2. Switch to a Creator account
- [ ] Profile → **☰** (top right) → **Account type and tools**. On some phones: ☰ → **Settings and privacy** → **Account type and tools**.
- [ ] **Switch to professional account** → **Continue** (on each intro screen).
- [ ] Category: search **Digital creator** → select it → **Done**.
- [ ] Choose **Creator** (not Business) → **Next**.
- [ ] Contact info: **Don't use my contact info** (you add a collab email in Step 3) → skip "Connect to Facebook".
- [ ] ✅ Check: your profile now has a **Professional dashboard** button. The account is now public, which is required.

### Step 3. Set up the profile
- [ ] Copy `C:\Users\USER\reels-hub\brand\` to your phone (Google Drive, WhatsApp to yourself, or USB).
- [ ] Profile → **Edit profile**:
  - **Picture**: `profile-picture.jpg`
  - **Name**: `Quotes & Songs | Tamil • Hindi Vibes`
  - **Bio**:
    ```
    English quotes 💬 Tamil • Hindi songs 🎧
    A new reel every day ✨
    📰 Today's trending news in Stories
    📩 Collabs: yourmail@gmail.com
    ```
  - **Gender/Pronouns**: leave empty.
- [ ] Edit profile → **Contact options** → **Email**: a new Gmail just for collaborations.
- [ ] ☰ → **Hidden words** → turn on **Hide comments** and **Advanced comment filtering**.

---

## PART 2: Connect Instagram to Reels Hub (computer, 20 min)

### Step 4. Create the Meta developer app
- [ ] Open https://developers.facebook.com → **Log in** with any personal Facebook account.
- [ ] First time only: **Get Started** → accept the terms → verify email/phone → role **Developer** → **Complete registration**.
- [ ] **My Apps** → **Create App**.
- [ ] App name `Reels Hub`, contact email your Gmail → **Next**.
- [ ] Use case: **Manage messaging & content on Instagram** → **Next**.
- [ ] Business: **I don't want to connect a business portfolio yet** → **Next** → **Next** → **Go to dashboard**.
- [ ] ✅ Check: "Reels Hub" is shown at the top left of the dashboard.

### Step 5. Add your Instagram account as a tester
- [ ] Dashboard left menu → **App roles** → **Roles** → **Add People** → **Instagram Tester** → type your username (no @) → **Add**.
- [ ] Open https://www.instagram.com/accounts/manage_access/ → log in → **Tester Invites** tab → **Accept**.
- [ ] ✅ Check: under Roles, your username no longer shows "Pending" (refresh the page).

### Step 6. Generate the access token
- [ ] Dashboard left menu → **Use cases** → **Customize** (next to "Manage messaging & content on Instagram").
- [ ] **API setup with Instagram login** → section **Generate access tokens** → **Add account**.
- [ ] Popup: log in to Instagram → **Allow**. Keep every permission ticked.
- [ ] Your account appears in the list → **Generate token** → tick **I understand** → **Copy**. It starts with `IGAA`.
- [ ] ⚠️ Treat it like a password: don't share it, paste it in chats, or screenshot it.

### Step 7. Put the token into Reels Hub
- [ ] In VS Code: **File → Open File** → `C:\Users\USER\reels-hub\.env`
- [ ] Change these lines (no spaces, no quotes):
  ```
  IG_ACCESS_TOKEN=IGAA....the whole token....
  IG_HANDLE=@yourusername
  ```
- [ ] **Ctrl+S** to save.

---

## PART 3: Tools and test (computer, 15 min)

### Step 8. Install the Cloudflare tunnel tool
- [ ] VS Code → **Ctrl + `** (the key below Esc) to open a PowerShell terminal.
- [ ] Run: `winget install --id Cloudflare.cloudflared` → type **Y** if asked → click **Yes** on the Windows popup.
- [ ] Close the terminal (🗑 icon) and open a new one (**Ctrl + `**).
- [ ] Run: `cloudflared --version` → ✅ it shows a version number.

### Step 9. Check everything
- [ ] Run:
  ```
  cd C:\Users\USER\reels-hub
  npm run ig:check
  ```
- [ ] ✅ Every line has a tick except `IG_ENABLED=false`, which is normal for now.

| If you see | Do this |
|---|---|
| `Invalid OAuth access token (code 190)` | Copy the token again (Step 6) and paste it again (Step 7). |
| `cloudflared: not found` | Close all terminals, reopen VS Code, try again. |
| `does not have permission` | Step 6 again with all permissions ticked, then generate a new token. |

### Step 10. Make test files (nothing is uploaded)
- [ ] Run: `npm run ig:test`
- [ ] Run: `explorer data\ig-out` → play the 2 videos and open the 1 image.
- [ ] ✅ The quote is readable, the music plays and your @handle is at the bottom.

---

## PART 4: Go live (computer, 10 min)

### Step 11. First 3 reels, posted by hand
- [ ] Run: `node scripts/ig.js post reel` → wait 1–3 minutes → ✅ `posted reel: https://www.instagram.com/reel/...`
- [ ] Wait about 5 minutes and run it again. Do it a **third** time as well. Your profile now has 3 reels.

### Step 12. Turn on automatic posting
- [ ] In `.env`, change these two lines, then **Ctrl+S**:
  ```
  IG_ENABLED=true
  IG_DRY_RUN=false
  ```
- [ ] Run (stops any old copy; it's fine if it says nothing):
  ```
  Get-NetTCPConnection -LocalPort 4321 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
  ```
- [ ] Run: `powershell -ExecutionPolicy Bypass -File C:\Users\USER\reels-hub\install-autostart.ps1`
  → ✅ `Installed. Reels Hub now starts at login`
- [ ] Wait 1 minute, then run: `Get-Content C:\Users\USER\reels-hub\logs\server.log -Tail 8`
  → ✅ a line starting `[instagram] auto-posting on.`
- [ ] Open http://localhost:4321 → ✅ the app shows quote reels and the Trending tab.

### Step 13. Keep the PC awake
- [ ] Windows **Settings → System → Power & battery → Screen and sleep** → "When plugged in, put my device to sleep after" → **Never**. The screen may still turn off.

### Step 14. Next day: confirm it worked by itself
- [ ] Run (in the reels-hub folder): `npm run ig:status` → ✅ entries with ✅ and Instagram links at 09:30, 10:30, 12:00 …
- [ ] Look at your Instagram profile: new reels and stories are there.

**Setup is complete.** From here, nothing needs to be run daily.

---

## PART 5: Daily and weekly habits (phone)

| When | Do |
|---|---|
| Daily, 10 min | Reply to comments within 1 hour of each reel (10:30, 14:00, 20:30). |
| When a story does well | Story → **Highlight** → New (Love / Motivation / Hope / Songs / News / Tamil) → **Edit cover** → `brand\highlight-*.jpg` |
| Once a week | Post 1 reel from your phone with a **trending Tamil song** from Instagram's music library. |
| Once a week | `npm run ig:status` on the PC to check nothing failed. |
| After 2 weeks | Instagram **Insights** → best hours → change `IG_REEL_TIMES` in `.env` → restart (see below). |
| Monthly | **Professional dashboard → Monetization status**: make sure there are no warnings. |

**Restart after changing `.env`:** run the Stop command from Step 12, then `Start-ScheduledTask "Reels Hub"`.

---

## PART 6: Earning (as followers grow)

| Followers | Step |
|---|---|
| 1,000+ | Join **Amazon Associates India** (affiliate-program.amazon.in) or **EarnKaro**. Share product links with the story **Link** sticker (quote books, couple gifts, diaries, earphones). |
| 1,000+ | Sell a quote wallpaper pack (₹49–99) on **Topmate** / **Instamojo** / **Gumroad**, and put the link in your bio (Edit profile → **Links**). |
| 1,000+ | Answer song-promotion requests from music labels and artists at your collab email. |
| 5,000–10,000+ | Professional dashboard → **Creator Marketplace** (when shown): fill in your profile so brands can find you. |
| 10,000+ | Paid brand reels, always with **Paid partnership** turned on. **Subscriptions**, if the dashboard offers them. |
| Always | Keep PAN and bank details ready; note all earnings for income tax. |

---

## Quick commands (run inside `C:\Users\USER\reels-hub`)

| To | Command |
|---|---|
| Check the setup | `npm run ig:check` |
| See what was posted | `npm run ig:status` |
| Post now | `node scripts/ig.js post reel` (or `quote-story`, `news-story`) |
| Pause posting | `.env` → `IG_ENABLED=false` → restart |
| Remove autostart | `powershell -ExecutionPolicy Bypass -File install-autostart.ps1 -Remove` |
| New token (if it ever expires) | Repeat Steps 6–7, then restart |
