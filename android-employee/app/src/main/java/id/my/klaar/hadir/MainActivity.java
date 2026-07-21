package id.my.klaar.hadir;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.util.Log;
import android.view.View;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends AppCompatActivity {
    private static final String TAG = "KlaarHadir";
    private static final String APP_URL = "https://app.klaar.my.id/employee.html";
    private static final String APP_HOST = "app.klaar.my.id";
    private static final String UPDATE_URL = "https://app.klaar.my.id/apk-version.json";
    private static final String UPDATE_PREFS = "klaar_apk_update";
    private static final String LAST_UPDATE_CHECK = "last_check";
    private static final long UPDATE_CHECK_INTERVAL_MS = 6L * 60L * 60L * 1000L;
    private static final int PERMISSION_REQUEST = 10;
    private static final int FILE_CHOOSER_REQUEST = 20;

    private final ExecutorService updateExecutor = Executors.newSingleThreadExecutor();
    private WebView webView;
    private ProgressBar progressBar;
    private PermissionRequest pendingWebPermission;
    private GeolocationPermissions.Callback pendingGeoCallback;
    private String pendingGeoOrigin;
    private ValueCallback<Uri[]> fileCallback;
    private DownloadManager downloadManager;
    private long updateDownloadId = -1L;
    private UpdateInfo pendingUpdate;
    private UpdateInfo activeDownloadUpdate;
    private boolean waitingForInstallPermission;
    private boolean updateDialogVisible;
    private boolean downloadReceiverRegistered;

    private final BroadcastReceiver downloadReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (!DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) return;
            long completedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
            if (completedId == updateDownloadId) handleCompletedDownload(completedId);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        webView = findViewById(R.id.web_view);
        progressBar = findViewById(R.id.progress);
        downloadManager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        ContextCompat.registerReceiver(
                this,
                downloadReceiver,
                new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                ContextCompat.RECEIVER_EXPORTED
        );
        downloadReceiverRegistered = true;
        configureWebView();
        requestMissingPermissions();

        if (savedInstanceState == null) {
            Uri incoming = getIntent().getData();
            webView.loadUrl(resolveInitialUrl(incoming));
        } else {
            webView.restoreState(savedInstanceState);
        }

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack(); else finish();
            }
        });

        checkForApkUpdate();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(
                settings.getUserAgentString() + " KlaarHadirAndroid/" + BuildConfig.VERSION_NAME
        );

        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (isKlaarUrl(url)) return false;
                openExternal(url);
                return true;
            }

            @Override public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int progress) {
                progressBar.setProgress(progress);
                progressBar.setVisibility(progress < 100 ? View.VISIBLE : View.GONE);
            }

            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    if (hasCameraPermission()) request.grant(request.getResources());
                    else {
                        pendingWebPermission = request;
                        requestMissingPermissions();
                    }
                });
            }

            @Override public void onGeolocationPermissionsShowPrompt(
                    String origin, GeolocationPermissions.Callback callback) {
                if (hasLocationPermission()) callback.invoke(origin, true, false);
                else {
                    pendingGeoOrigin = origin;
                    pendingGeoCallback = callback;
                    requestMissingPermissions();
                }
            }

            @Override public boolean onShowFileChooser(
                    WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                } catch (ActivityNotFoundException error) {
                    fileCallback = null;
                    Toast.makeText(MainActivity.this, R.string.no_file_picker, Toast.LENGTH_SHORT).show();
                }
                return true;
            }
        });
    }

    private void checkForApkUpdate() {
        SharedPreferences prefs = getSharedPreferences(UPDATE_PREFS, MODE_PRIVATE);
        long now = System.currentTimeMillis();
        if (now - prefs.getLong(LAST_UPDATE_CHECK, 0L) < UPDATE_CHECK_INTERVAL_MS) return;

        updateExecutor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(UPDATE_URL + "?installed=" + BuildConfig.VERSION_CODE + "&t=" + now);
                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(8000);
                connection.setReadTimeout(8000);
                connection.setRequestMethod("GET");
                connection.setRequestProperty("Accept", "application/json");
                connection.setUseCaches(false);
                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) throw new IllegalStateException("HTTP " + status);
                String body = readLimitedText(connection.getInputStream(), 65536);
                UpdateInfo info = UpdateInfo.fromJson(new JSONObject(body));
                prefs.edit().putLong(LAST_UPDATE_CHECK, now).apply();
                if (info.versionCode > BuildConfig.VERSION_CODE) {
                    runOnUiThread(() -> showUpdateDialog(info));
                }
            } catch (Exception error) {
                Log.w(TAG, "Pemeriksaan update dilewati: " + error.getMessage());
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private String readLimitedText(InputStream input, int maxChars) throws Exception {
        StringBuilder out = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(input, StandardCharsets.UTF_8))) {
            char[] buffer = new char[2048];
            int read;
            while ((read = reader.read(buffer)) >= 0) {
                if (out.length() + read > maxChars) throw new IllegalStateException("Respons terlalu besar");
                out.append(buffer, 0, read);
            }
        }
        return out.toString();
    }

    private void showUpdateDialog(UpdateInfo info) {
        if (isFinishing() || (Build.VERSION.SDK_INT >= 17 && isDestroyed()) || updateDialogVisible) return;
        updateDialogVisible = true;
        pendingUpdate = info;
        String message = "Versi terpasang: " + BuildConfig.VERSION_NAME
                + "\nVersi terbaru: " + info.versionName
                + (info.notes.isEmpty() ? "" : "\n\n" + info.notes);
        AlertDialog.Builder builder = new AlertDialog.Builder(this)
                .setTitle("Pembaruan Klaar Hadir")
                .setMessage(message)
                .setPositiveButton("Update sekarang", (dialog, which) -> startUpdateFlow(info))
                .setOnDismissListener(dialog -> updateDialogVisible = false)
                .setOnCancelListener(dialog -> pendingUpdate = null);
        if (!info.mandatory)
            builder.setNegativeButton("Nanti", (dialog, which) -> pendingUpdate = null);
        AlertDialog dialog = builder.create();
        dialog.setCancelable(!info.mandatory);
        dialog.setCanceledOnTouchOutside(!info.mandatory);
        dialog.show();
    }

    private void startUpdateFlow(UpdateInfo info) {
        pendingUpdate = info;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !getPackageManager().canRequestPackageInstalls()) {
            waitingForInstallPermission = true;
            try {
                Intent settingsIntent = new Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getPackageName())
                );
                startActivity(settingsIntent);
                Toast.makeText(this, "Izinkan Klaar Hadir memasang pembaruan, lalu kembali.", Toast.LENGTH_LONG).show();
            } catch (ActivityNotFoundException error) {
                Toast.makeText(this, "Buka pengaturan dan izinkan instalasi dari Klaar Hadir.", Toast.LENGTH_LONG).show();
            }
            return;
        }
        downloadUpdate(info);
    }

    private void downloadUpdate(UpdateInfo info) {
        if (updateDownloadId >= 0L) {
            Toast.makeText(this, "Pembaruan sedang diunduh.", Toast.LENGTH_SHORT).show();
            return;
        }
        try {
            pendingUpdate = null;
            activeDownloadUpdate = info;
            String fileName = "klaar-hadir-" + info.versionName.replaceAll("[^A-Za-z0-9._-]", "-") + ".apk";
            File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir != null) {
                File oldFile = new File(dir, fileName);
                if (oldFile.exists() && !oldFile.delete()) Log.w(TAG, "File update lama tidak dapat dihapus");
            }
            DownloadManager.Request request = new DownloadManager.Request(info.apkUri)
                    .setTitle("Pembaruan Klaar Hadir " + info.versionName)
                    .setDescription("Mengunduh APK resmi Klaar Hadir")
                    .setMimeType("application/vnd.android.package-archive")
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setAllowedOverMetered(true)
                    .setAllowedOverRoaming(false)
                    .setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, fileName);
            updateDownloadId = downloadManager.enqueue(request);
            Toast.makeText(this, "Pembaruan mulai diunduh.", Toast.LENGTH_SHORT).show();
        } catch (Exception error) {
            updateDownloadId = -1L;
            activeDownloadUpdate = null;
            Toast.makeText(this, "Unduhan update gagal dimulai.", Toast.LENGTH_LONG).show();
            Log.e(TAG, "Gagal memulai update", error);
        }
    }

    private void handleCompletedDownload(long downloadId) {
        DownloadManager.Query query = new DownloadManager.Query().setFilterById(downloadId);
        try (Cursor cursor = downloadManager.query(query)) {
            if (!cursor.moveToFirst()) throw new IllegalStateException("Hasil unduhan tidak ditemukan");
            int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            int status = statusIndex >= 0 ? cursor.getInt(statusIndex) : DownloadManager.STATUS_FAILED;
            if (status != DownloadManager.STATUS_SUCCESSFUL) {
                updateDownloadId = -1L;
                activeDownloadUpdate = null;
                Toast.makeText(this, "Unduhan pembaruan gagal.", Toast.LENGTH_LONG).show();
                return;
            }
        } catch (Exception error) {
            updateDownloadId = -1L;
            activeDownloadUpdate = null;
            Toast.makeText(this, "Pembaruan tidak dapat diperiksa.", Toast.LENGTH_LONG).show();
            Log.e(TAG, "Gagal membaca hasil download", error);
            return;
        }

        Uri downloadedUri = downloadManager.getUriForDownloadedFile(downloadId);
        UpdateInfo info = activeDownloadUpdate;
        updateDownloadId = -1L;
        activeDownloadUpdate = null;
        if (downloadedUri == null || info == null) {
            Toast.makeText(this, "File pembaruan tidak ditemukan.", Toast.LENGTH_LONG).show();
            return;
        }
        updateExecutor.execute(() -> {
            try {
                if (!info.sha256.isEmpty()) {
                    String actual = sha256(downloadedUri);
                    if (!actual.equalsIgnoreCase(info.sha256)) {
                        throw new SecurityException("Checksum APK tidak cocok");
                    }
                }
                runOnUiThread(() -> openPackageInstaller(downloadedUri));
            } catch (Exception error) {
                Log.e(TAG, "Verifikasi APK gagal", error);
                runOnUiThread(() -> Toast.makeText(
                        MainActivity.this,
                        "APK ditolak karena verifikasi keamanan gagal.",
                        Toast.LENGTH_LONG
                ).show());
            }
        });
    }

    private String sha256(Uri uri) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = getContentResolver().openInputStream(uri)) {
            if (input == null) throw new IllegalStateException("APK tidak dapat dibaca");
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) >= 0) digest.update(buffer, 0, read);
        }
        StringBuilder hex = new StringBuilder();
        for (byte value : digest.digest()) hex.append(String.format(Locale.US, "%02x", value));
        return hex.toString();
    }

    private void openPackageInstaller(Uri uri) {
        try {
            Intent install = new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(install);
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "Installer APK tidak tersedia.", Toast.LENGTH_LONG).show();
        }
    }

    @Override protected void onResume() {
        super.onResume();
        if (waitingForInstallPermission) {
            waitingForInstallPermission = false;
            if (pendingUpdate != null
                    && updateDownloadId < 0L
                    && (Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                    || getPackageManager().canRequestPackageInstalls())) {
                downloadUpdate(pendingUpdate);
            }
        }
    }

    private boolean isKlaarUrl(Uri uri) {
        return uri != null && "https".equalsIgnoreCase(uri.getScheme())
                && APP_HOST.equalsIgnoreCase(uri.getHost());
    }

    private String resolveInitialUrl(Uri uri) {
        if (isKlaarUrl(uri)) return uri.toString();
        if (uri != null
                && "klaarhadir".equalsIgnoreCase(uri.getScheme())
                && "login".equalsIgnoreCase(uri.getHost())) {
            String token = uri.getQueryParameter("k");
            if (token != null && token.matches("[A-Za-z0-9_-]+")) {
                return APP_URL + "#k=" + token;
            }
        }
        return APP_URL;
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, R.string.no_browser, Toast.LENGTH_SHORT).show();
        }
    }

    private boolean hasCameraPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasLocationPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    private void requestMissingPermissions() {
        if (hasCameraPermission() && hasLocationPermission()) return;
        ActivityCompat.requestPermissions(this,
                new String[]{Manifest.permission.CAMERA, Manifest.permission.ACCESS_FINE_LOCATION},
                PERMISSION_REQUEST);
    }

    @Override public void onRequestPermissionsResult(
            int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != PERMISSION_REQUEST) return;
        if (pendingWebPermission != null) {
            if (hasCameraPermission()) pendingWebPermission.grant(pendingWebPermission.getResources());
            else pendingWebPermission.deny();
            pendingWebPermission = null;
        }
        if (pendingGeoCallback != null) {
            pendingGeoCallback.invoke(pendingGeoOrigin, hasLocationPermission(), false);
            pendingGeoCallback = null;
            pendingGeoOrigin = null;
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        }
    }

    @Override protected void onSaveInstanceState(@NonNull Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override protected void onDestroy() {
        if (downloadReceiverRegistered) {
            unregisterReceiver(downloadReceiver);
            downloadReceiverRegistered = false;
        }
        updateExecutor.shutdownNow();
        webView.stopLoading();
        webView.destroy();
        super.onDestroy();
    }

    private static final class UpdateInfo {
        final int versionCode;
        final String versionName;
        final Uri apkUri;
        final String sha256;
        final String notes;
        final boolean mandatory;

        private UpdateInfo(
                int versionCode,
                String versionName,
                Uri apkUri,
                String sha256,
                String notes,
                boolean mandatory) {
            this.versionCode = versionCode;
            this.versionName = versionName;
            this.apkUri = apkUri;
            this.sha256 = sha256;
            this.notes = notes;
            this.mandatory = mandatory;
        }

        static UpdateInfo fromJson(JSONObject json) {
            int versionCode = json.optInt("versionCode", 0);
            String versionName = json.optString("versionName", "").trim();
            String apkUrl = json.optString("apkUrl", "").trim();
            String sha256 = json.optString("sha256", "").trim().toLowerCase(Locale.US);
            String notes = json.optString("notes", "").trim();
            boolean mandatory = json.optBoolean("mandatory", false);
            Uri apkUri = Uri.parse(apkUrl);
            String apkHost = apkUri.getHost();
            String apkPath = apkUri.getPath();
            if (versionCode <= 0 || versionName.isEmpty()) {
                throw new IllegalArgumentException("Versi update tidak valid");
            }
            if (!"https".equalsIgnoreCase(apkUri.getScheme())) {
                throw new IllegalArgumentException("URL APK wajib HTTPS");
            }
            if (apkHost == null
                    || !(APP_HOST.equalsIgnoreCase(apkHost)
                    || "github.com".equalsIgnoreCase(apkHost)
                    || apkHost.toLowerCase(Locale.US).endsWith(".githubusercontent.com"))
                    || apkPath == null
                    || !apkPath.toLowerCase(Locale.US).endsWith(".apk")) {
                throw new IllegalArgumentException("Sumber APK tidak diizinkan");
            }
            if (!sha256.isEmpty() && !sha256.matches("[a-f0-9]{64}")) {
                throw new IllegalArgumentException("SHA-256 tidak valid");
            }
            return new UpdateInfo(versionCode, versionName, apkUri, sha256, notes, mandatory);
        }
    }
}
