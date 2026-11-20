# Instagram auto-posting: step by step

Reels Hub turns its quote reels and news into Instagram **Reels** and **Stories** and uploads them by itself through the **official Instagram API**. Your password is never used.

**Your YouTube Shorts pipeline is not touched.** This code lives only in `C:\Users\USER\reels-hub`. It doesn't read or change `youtube-shorts-ai`, its `.env`, its Cloudflare image allowance or its scheduled tasks. Rendering runs at low CPU priority, and nothing renders or uploads during the Shorts task windows (07:45–09:15 and 17:45–19:15; set by `IG_QUIET`).

---

## Step 1: Make your Instagram account Professional (2 min)
In the Instagram app: **Settings → Account type and tools → Switch to professional account → Creator** (or Business). It's free. You don't need a Facebook Page.

## Step 2: Create a Meta developer app (5 min)
1. Open https://developers.facebook.com/apps and log in (register as a developer if asked).
2. **Create app**. For the use case, choose **"Manage messaging & content on Instagram"**. Name it (e.g. "Reels Hub") and finish.
3. In the app dashboard, open **Instagram → API setup with Instagram login**.

## Step 3: Allow your account to use the app (2 min)
1. In the dashboard: **App roles → Roles → Add People → Instagram Tester**, and enter your Instagram username.
2. In the Instagram app: **Settings → Website permissions → Apps and websites → Tester invites → Accept**.

The app can stay in **Development** mode. You don't need Meta's app review to post to your *own* account.

## Step 4: Get the access token (2 min)
1. Back in **API setup with Instagram login → Generate access tokens**, click **Add account** and log in to Instagram.
2. Allow the permissions, including **instagram_business_content_publish**.
3. Click **Generate token** and copy it. Put it in `C:\Users\USER\reels-hub\.env`:
   ```
   IG_ACCESS_TOKEN=IGAA...your token...
   IG_HANDLE=@yourhandle
   ```
   `IG_USER_ID` is optional; `npm run ig:check` shows it.

The token lasts 60 days, and Reels Hub **renews it automatically every week**. If you ever get a 1-hour token instead, also set `IG_APP_SECRET` (**App settings → Basic → App secret**) and it will be converted.

## Step 5: Install the free Cloudflare tunnel tool (1 min)
Instagram's servers download each video from a public link. Reels Hub opens a temporary Cloudflare link only for the minute an upload takes, and it shares only the finished files. Install the tool once:
```
winget install --id Cloudflare.cloudflared
```
No Cloudflare login is needed. This is separate from the Cloudflare account your Shorts project uses.

## Step 6: Check everything
```
cd C:\Users\USER\reels-hub
npm run ig:check
```
You should see ✅ for ffmpeg, cloudflared, your @account and the publishing quota.

## Step 7: Test without uploading
```
npm run ig:test
```
This makes one reel, one quote story and one news story in `data\ig-out\`. Open them and check how they look and sound.

## Step 8: First real upload (by hand)
```
node scripts/ig.js post reel
```
It prints the link to the new reel. Check it on Instagram.

## Step 9: Turn on automatic posting
In `.env`:
```
IG_ENABLED=true
IG_DRY_RUN=false
```
Then restart Reels Hub (`npm start`, or the autostart task). For posting to keep going after a reboot, install autostart once:
```
powershell -ExecutionPolicy Bypass -File install-autostart.ps1
```

---

## What gets posted, and when (change in `.env`)

| What | Default times | Content |
|---|---|---|
| Reel | 10:30, 14:00, 20:30 | 20 s quote video: mood photo, animated text, **original music**. The caption has the quote, the matching Tamil/Hindi/English song name, the photo credit and hashtags. |
| Quote story | 12:00, 16:30, 22:00 | 15 s quote video |
| News story | 09:30, 13:00, 17:15, 21:15 | Headline card (Tamil / English / Hindi). Every 3rd one is a Google Trends topic. |

* If the PC was off at a posting time, it posts when the PC comes back, if that's within 3 hours. A failed post is retried once, 20 minutes later.
* There are at most `IG_MAX_PER_DAY` posts (default 12). Instagram allows 100 per 24 hours, and Reels Hub checks that quota before each upload.
* Nothing is posted twice. The history is in `data\ig-state.json`; run `npm run ig:status` to see it.

## Why the music is original and the news cards use no photos

* **Songs:** the app plays iTunes song previews, but those are copyrighted and only licensed for playback, not re-uploading. Instagram mutes or blocks reels that contain them, and copyright strikes can hurt the account. The API also cannot add a song from Instagram's own music library. So uploads get **original music generated per mood** (`IG_MUSIC=generated`), and the matching song's name goes in the caption. To use your own royalty-free tracks instead, put the mp3s in `music\` and set `IG_MUSIC=folder`.
* **News photos and YouTube clips** belong to the publishers, so news stories are text cards with "Read more: bbc.com/tamil" (the API can't add link stickers to stories).

## Troubleshooting

| Message | Fix |
|---|---|
| `Invalid OAuth access token (code 190)` | The token expired or was copied wrong. Generate a new one (Step 4) and paste it into `.env`. |
| `cloudflared is not installed` | Step 5, then open a new terminal. |
| `Instagram could not process the media` | Usually a temporary download problem; it retries in 20 minutes. Check `npm run ig:status`. |
| `publishing limit reached` | The 24-hour quota is used up; it continues automatically later. |
| `(#10) Application does not have permission` | In Step 4, make sure **instagram_business_content_publish** was allowed, then generate a new token. |
