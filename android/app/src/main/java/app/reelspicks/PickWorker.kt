package app.reelspicks

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

/**
 * Every ~15 minutes (Android decides the exact moment): checks picks.json on your site.
 * New reel -> pop-up notification. Still not posted 2 hours later -> one reminder.
 */
class PickWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {
    override fun doWork(): Result {
        return try {
            val conn = URL(BuildConfig.PAGES_URL + "picks.json?t=" + System.currentTimeMillis()).openConnection() as HttpURLConnection
            conn.connectTimeout = 15000
            conn.readTimeout = 20000
            val json = JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
            val picks = json.optJSONArray("picks") ?: return Result.success()
            if (picks.length() == 0) return Result.success()
            val p = picks.getJSONObject(0)
            val id = p.getString("id")
            val quote = p.getJSONObject("quote").optString("text")
            val songs = p.optJSONArray("songs")
            val first = if (songs != null && songs.length() > 0) songs.getJSONObject(0) else null
            // "🔥 Kesariya (trending #3)" for chart songs, plain title otherwise
            val song = when {
                first == null -> ""
                first.optBoolean("trending") -> "🔥 ${first.optString("title")} (trending #${first.optInt("rank")})"
                else -> first.optString("title")
            }
            val style = when (p.optString("style")) {
                "art-en", "art-ta" -> "✏️ Sketch art"
                "minimal-en", "minimal-ta" -> "🌙 Minimal"
                "photo" -> "📷 Photo"
                else -> "🎬"
            }
            val count = songs?.length() ?: 0
            val ctx = applicationContext
            val now = System.currentTimeMillis()

            if (Prefs.get(ctx, "lastNotified") != id) {
                // a reel this phone has not been told about yet
                Notify.show(ctx, id, "$style reel ready to post", "${quote.replace("\n", " ").take(90)}\n🎵 $song\n+${(count - 1).coerceAtLeast(0)} more song ideas in the app")
                Prefs.put(ctx, "lastNotified", id)
                Prefs.putLong(ctx, "notifiedAt", now)
                Prefs.put(ctx, "reminded", "")
            } else if (!Prefs.isDone(ctx, id) && Prefs.get(ctx, "reminded") != id &&
                now - Prefs.getLong(ctx, "notifiedAt") > TimeUnit.HOURS.toMillis(2)
            ) {
                Notify.show(ctx, id, "⏰ Reel still waiting", "Pick the song and post it: takes 1 minute.\n🎵 $song")
                Prefs.put(ctx, "reminded", id)
            }
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }

    companion object {
        fun schedule(c: Context) {
            val req = PeriodicWorkRequestBuilder<PickWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(c).enqueueUniquePeriodicWork("picks", ExistingPeriodicWorkPolicy.KEEP, req)
        }
    }
}

object Notify {
    private const val CHANNEL = "reels_ready"

    fun ensureChannel(c: Context) {
        if (Build.VERSION.SDK_INT >= 26) {
            val ch = NotificationChannel(CHANNEL, "Reel ready", NotificationManager.IMPORTANCE_HIGH)
            ch.description = "Pop-up when a new reel and its songs are ready"
            c.getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
        }
    }

    fun show(c: Context, pickId: String, title: String, text: String) {
        ensureChannel(c)
        if (Build.VERSION.SDK_INT >= 33 &&
            c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val open = Intent(c, MainActivity::class.java).putExtra("pick", pickId).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val pi = PendingIntent.getActivity(c, pickId.hashCode(), open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle(title)
            .setContentText(text.lineSequence().first())
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(pi)
            .build()
        NotificationManagerCompat.from(c).notify(pickId.hashCode(), n)
    }
}
