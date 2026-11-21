package app.reelspicks

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.core.content.FileProvider
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Shows the picks page from your GitHub Pages site and adds the phone-only parts:
 * copy to clipboard, hand the reel to Instagram, remember what's posted, and the reel-ready popups.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private val siteHost by lazy { Uri.parse(BuildConfig.PAGES_URL).host }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Notify.ensureChannel(this)
        PickWorker.schedule(this)
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)

        web = WebView(this)
        setContentView(web)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.mediaPlaybackRequiresUserGesture = false
        web.addJavascriptInterface(Bridge(), "ReelsPicks")
        web.webChromeClient = WebChromeClient()
        web.webViewClient = object : WebViewClient() {
            // only our own site opens inside the app; other links (song pages, news) open in the browser
            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                if (req.url.host == siteHost) return false
                try { startActivity(Intent(Intent.ACTION_VIEW, req.url)) } catch (_: Exception) {}
                return true
            }
        }
        open(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        open(intent)
    }

    private fun open(i: Intent?) {
        val pick = i?.getStringExtra("pick")
        web.loadUrl(BuildConfig.PAGES_URL + "app/" + (if (pick != null) "#$pick" else ""))
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    inner class Bridge {
        @JavascriptInterface
        fun copy(text: String) {
            val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText("caption", text))
            runOnUiThread { Toast.makeText(this@MainActivity, "Caption copied", Toast.LENGTH_SHORT).show() }
        }

        @JavascriptInterface
        fun isDone(id: String): Boolean = Prefs.isDone(this@MainActivity, id)

        @JavascriptInterface
        fun markDone(id: String) = Prefs.setDone(this@MainActivity, id, true)

        @JavascriptInterface
        fun markUndone(id: String) = Prefs.setDone(this@MainActivity, id, false)

        /** Downloads the reel, copies the caption and opens Instagram with the video ready. */
        @JavascriptInterface
        fun shareToInstagram(videoUrl: String, caption: String) =
            shareTo(videoUrl, caption, "com.instagram.android", "Choose Reels → add the song → paste the caption")

        /** Same for YouTube: opens the Shorts editor, where "Add sound" has licensed film songs. */
        @JavascriptInterface
        fun shareToYouTube(videoUrl: String, title: String) =
            shareTo(videoUrl, title, "com.google.android.youtube", "Tap Add sound → search the song → paste the title → Upload")

        private fun shareTo(videoUrl: String, caption: String, pkg: String, hint: String) {
            if (Uri.parse(videoUrl).host != siteHost) return
            copy(caption)
            runOnUiThread { Toast.makeText(this@MainActivity, "Preparing the reel…", Toast.LENGTH_SHORT).show() }
            thread {
                try {
                    val dir = File(cacheDir, "reels").apply { mkdirs() }
                    val file = File(dir, "reel.mp4")
                    val conn = URL(videoUrl).openConnection() as HttpURLConnection
                    conn.connectTimeout = 20000
                    conn.readTimeout = 60000
                    conn.inputStream.use { input -> file.outputStream().use { input.copyTo(it) } }
                    val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.files", file)
                    val send = Intent(Intent.ACTION_SEND).apply {
                        type = "video/mp4"
                        putExtra(Intent.EXTRA_STREAM, uri)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    runOnUiThread {
                        try {
                            startActivity(Intent(send).setPackage(pkg))
                            Toast.makeText(this@MainActivity, hint, Toast.LENGTH_LONG).show()
                        } catch (e: ActivityNotFoundException) {
                            startActivity(Intent.createChooser(send, "Share reel"))
                        }
                    }
                } catch (e: Exception) {
                    runOnUiThread { Toast.makeText(this@MainActivity, "Download failed: ${e.message}", Toast.LENGTH_LONG).show() }
                }
            }
        }
    }
}

object Prefs {
    private fun p(c: Context) = c.getSharedPreferences("picks", Context.MODE_PRIVATE)
    fun isDone(c: Context, id: String) = p(c).getBoolean("done_$id", false)
    fun setDone(c: Context, id: String, v: Boolean) = p(c).edit().putBoolean("done_$id", v).apply()
    fun get(c: Context, k: String) = p(c).getString(k, null)
    fun put(c: Context, k: String, v: String) = p(c).edit().putString(k, v).apply()
    fun getLong(c: Context, k: String) = p(c).getLong(k, 0L)
    fun putLong(c: Context, k: String, v: Long) = p(c).edit().putLong(k, v).apply()
}
