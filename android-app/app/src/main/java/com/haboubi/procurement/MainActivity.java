package com.haboubi.procurement;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.ValueCallback;
import android.webkit.JavascriptInterface;
import android.net.Uri;
import android.content.Intent;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.WebChromeClient.FileChooserParams;
import android.content.Context;
import android.content.SharedPreferences;
import android.widget.Toast;
import android.widget.FrameLayout;
import android.webkit.CookieManager;
import org.json.JSONObject;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
  private WebView webView;
  private ValueCallback<Uri[]> fileCallback;
  private WebView printWebView;
  private FrameLayout rootLayout;
  private boolean printingInProgress = false;
  private static final int FILE_PICKER = 4102;

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    getWindow().setStatusBarColor(android.graphics.Color.rgb(246,248,247));
    getWindow().setNavigationBarColor(android.graphics.Color.rgb(246,248,247));
    getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
    if (android.os.Build.VERSION.SDK_INT >= 29) {
      getWindow().setNavigationBarContrastEnforced(false);
      getWindow().setStatusBarContrastEnforced(false);
    }
    webView = new WebView(this);
    if (android.os.Build.VERSION.SDK_INT >= 21) {
      webView.setOnApplyWindowInsetsListener((view, insets) -> {
        int top = insets.getSystemWindowInsetTop();
        int bottom = insets.getSystemWindowInsetBottom();
        view.setPadding(0, top, 0, bottom);
        return insets;
      });
      webView.setFitsSystemWindows(true);
    }
    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setDatabaseEnabled(true);
    settings.setAllowFileAccess(true);
    settings.setAllowContentAccess(true);
    settings.setJavaScriptCanOpenWindowsAutomatically(false);
    webView.addJavascriptInterface(new AppBridge(), "AndroidApp");
    webView.setWebViewClient(new WebViewClient());
    webView.setWebChromeClient(new WebChromeClient() {
      @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        fileCallback = callback;
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "application/json", "text/csv", "application/octet-stream"});
        startActivityForResult(Intent.createChooser(intent, "اختيار ملف"), FILE_PICKER);
        return true;
      }
    });
    rootLayout = new FrameLayout(this);
    rootLayout.addView(webView, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
    setContentView(rootLayout);
    webView.loadUrl("file:///android_asset/www/index.html");
  }

  private class AppBridge {
    @JavascriptInterface public void apiRequest(String rawPath, String method, String body, String requestId) {
      new Thread(() -> {
        HttpURLConnection connection = null;
        int status = 503;
        String responseText = "{\"error\":\"تعذر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.\"}";
        try {
          String path = rawPath == null ? "/" : rawPath;
          if (!path.startsWith("/api/") || path.contains("\\\\") || path.contains("..")) throw new IllegalArgumentException("Invalid API path");
          URL url = new URL("https://medstock.cinematicplus.online" + path);
          connection = (HttpURLConnection) url.openConnection();
          connection.setRequestMethod(method == null ? "GET" : method.toUpperCase(java.util.Locale.ROOT));
          connection.setConnectTimeout(12000);
          connection.setReadTimeout(15000);
          connection.setRequestProperty("Accept", "application/json");
          SharedPreferences prefs = getSharedPreferences("haboubi_auth", MODE_PRIVATE);
          String savedCookie = prefs.getString("session_cookie", "");
          if (!savedCookie.isEmpty() && !path.equals("/api/login")) connection.setRequestProperty("Cookie", savedCookie);
          if (body != null && !body.isEmpty() && !"GET".equalsIgnoreCase(method) && !"HEAD".equalsIgnoreCase(method)) {
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            try (OutputStream out = connection.getOutputStream()) { out.write(body.getBytes(StandardCharsets.UTF_8)); }
          }
          status = connection.getResponseCode();
          String setCookie = connection.getHeaderField("Set-Cookie");
          if (setCookie != null && setCookie.contains("haboubi_session=")) {
            String sessionCookie = setCookie.split(";", 2)[0];
            if (setCookie.contains("Max-Age=0")) prefs.edit().remove("session_cookie").putBoolean("remember", false).apply();
            else if (path.equals("/api/login")) {
              JSONObject payload = new JSONObject(body == null || body.isEmpty() ? "{}" : body);
              if (payload.optBoolean("remember", false)) prefs.edit().putString("session_cookie", sessionCookie).putBoolean("remember", true).apply();
              else prefs.edit().remove("session_cookie").putBoolean("remember", false).apply();
              if (payload.optBoolean("remember", false)) CookieManager.getInstance().setCookie("https://medstock.cinematicplus.online", setCookie);
            }
          }
          java.io.InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
          if (stream != null) try (java.io.InputStream in = stream; java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096]; int count; while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
            responseText = out.toString(StandardCharsets.UTF_8.name());
          }
        } catch (Exception ex) {
          responseText = "{\"error\":\"تعذر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.\"}";
        } finally { if (connection != null) connection.disconnect(); }
        final int resultStatus = status;
        final String resultBody = responseText;
        runOnUiThread(() -> webView.evaluateJavascript("window.haboubiNativeApiResult && window.haboubiNativeApiResult(" + JSONObject.quote(requestId) + "," + resultStatus + "," + JSONObject.quote(resultBody) + ")", null));
      }).start();
    }

    @JavascriptInterface public void authenticate(String code, boolean remember) {
      new Thread(() -> {
        HttpURLConnection connection = null;
        try {
          URL url = new URL("https://medstock.cinematicplus.online/api/login");
          connection = (HttpURLConnection) url.openConnection();
          connection.setRequestMethod("POST");
          connection.setConnectTimeout(10000);
          connection.setReadTimeout(10000);
          connection.setDoOutput(true);
          connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
          JSONObject payload = new JSONObject();
          payload.put("code", code == null ? "" : code);
          payload.put("remember", remember);
          byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
          try (OutputStream out = connection.getOutputStream()) { out.write(body); }
          int status = connection.getResponseCode();
          if (status >= 200 && status < 300) {
            String cookie = connection.getHeaderField("Set-Cookie");
            SharedPreferences prefs = getSharedPreferences("haboubi_auth", MODE_PRIVATE);
            if (remember && cookie != null && cookie.contains("haboubi_session=")) {
              String sessionCookie = cookie.split(";", 2)[0];
              prefs.edit().putString("session_cookie", sessionCookie).putBoolean("remember", true).apply();
            } else {
              prefs.edit().remove("session_cookie").putBoolean("remember", false).apply();
            }
            if (cookie != null) CookieManager.getInstance().setCookie("https://medstock.cinematicplus.online", cookie);
            String response = new String(connection.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            JSONObject data = new JSONObject(response);
            JSONObject user = data.optJSONObject("user");
            String userJson = user == null ? "null" : user.toString();
            runOnUiThread(() -> webView.evaluateJavascript("window.haboubiNativeLoginResult(true,''," + userJson + ")", null));
          } else {
            String message = status == 401 ? "الكود غير صحيح" : "تعذر التحقق من كود الدخول (" + status + ")";
            runOnUiThread(() -> webView.evaluateJavascript("window.haboubiNativeLoginResult(false," + JSONObject.quote(message) + ",null)", null));
          }
        } catch (Exception ex) {
          runOnUiThread(() -> webView.evaluateJavascript("window.haboubiNativeLoginResult(false,'تعذر الاتصال بالخادم، تحقق من الإنترنت',null)", null));
        } finally { if (connection != null) connection.disconnect(); }
      }).start();
    }
    @JavascriptInterface public void restoreSession() {
      SharedPreferences prefs = getSharedPreferences("haboubi_auth", MODE_PRIVATE);
      String savedCookie = prefs.getString("session_cookie", "");
      if (!prefs.getBoolean("remember", false) || savedCookie.isEmpty()) return;
      new Thread(() -> {
        HttpURLConnection connection = null;
        try {
          connection = (HttpURLConnection) new URL("https://medstock.cinematicplus.online/api/session").openConnection();
          connection.setRequestMethod("GET");
          connection.setConnectTimeout(8000);
          connection.setReadTimeout(8000);
          connection.setRequestProperty("Cookie", savedCookie);
          int status = connection.getResponseCode();
          if (status >= 200 && status < 300) {
            String response = new String(connection.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            JSONObject data = new JSONObject(response);
            JSONObject user = data.optJSONObject("user");
            if (data.optBoolean("ok") && user != null) {
              String userJson = user.toString();
              runOnUiThread(() -> webView.evaluateJavascript("window.haboubiNativeLoginResult(true,''," + userJson + ")", null));
              return;
            }
          }
          prefs.edit().remove("session_cookie").putBoolean("remember", false).apply();
        } catch (Exception ignored) {
          // Keep the remembered session for a later retry if the network is temporarily unavailable.
        } finally { if (connection != null) connection.disconnect(); }
      }).start();
    }

    @JavascriptInterface public void openUrl(String rawUrl) {
      runOnUiThread(() -> {
        try {
          Uri uri = Uri.parse(rawUrl);
          if (!"https".equalsIgnoreCase(uri.getScheme())) throw new IllegalArgumentException("HTTPS required");
          Intent intent = new Intent(Intent.ACTION_VIEW, uri);
          startActivity(intent);
        } catch (Exception e) {
          Toast.makeText(MainActivity.this, "تعذر فتح رابط التحديث", Toast.LENGTH_LONG).show();
        }
      });
    }
    @JavascriptInterface public void printHtml(String html, String cssUrl) {
      runOnUiThread(() -> {
        try {
          if (html == null || html.trim().isEmpty()) {
            Toast.makeText(MainActivity.this, "لا توجد استمارات جاهزة للطباعة", Toast.LENGTH_LONG).show();
            return;
          }
          if (rootLayout == null) throw new IllegalStateException("Print container is unavailable");
          if (printWebView != null) {
            rootLayout.removeView(printWebView);
            printWebView.stopLoading();
            printWebView.destroy();
            printWebView = null;
          }
          webView.setVisibility(android.view.View.INVISIBLE);
          printWebView = new WebView(MainActivity.this);
          WebSettings printSettings = printWebView.getSettings();
          printSettings.setJavaScriptEnabled(false);
          printSettings.setDomStorageEnabled(false);
          printSettings.setAllowFileAccess(true);
          printWebView.setBackgroundColor(android.graphics.Color.WHITE);
          rootLayout.addView(printWebView, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
          String safeCss = (cssUrl == null || cssUrl.isEmpty() ? "file:///android_asset/www/styles.css" : cssUrl.replace("&", "&amp;").replace("\"", "&quot;"));
          String document = "<!doctype html><html lang=\"ar\" dir=\"rtl\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><link rel=\"stylesheet\" href=\"" + safeCss + "\"><style>html,body{margin:0;padding:0;background:#fff!important;color:#000!important}.view.printing{display:block!important}.view.printing>#printArea{display:block!important}#printArea{display:block!important;background:#fff!important;color:#000!important}.official-page{box-shadow:none!important;margin:0!important}@page{size:A4;margin:0}</style></head><body><div class=\"view printing\"><div id=\"printArea\">" + html + "</div></div></body></html>";
          printWebView.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
              view.postDelayed(() -> {
                try {
                  PrintManager manager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                  if (manager == null) throw new IllegalStateException("Print service unavailable");
                  PrintAttributes attributes = new PrintAttributes.Builder()
                    .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                    .setResolution(new PrintAttributes.Resolution("haboubi", "مستندات الحبوبي", 300, 300))
                    .setMinMargins(PrintAttributes.Margins.NO_MARGINS).build();
                  android.print.PrintDocumentAdapter adapter = view.createPrintDocumentAdapter("مستندات مشتريات الحبوبي");
                  printingInProgress = true;
                  manager.print("مستندات مشتريات الحبوبي", adapter, attributes);
                } catch (Exception e) {
                  webView.setVisibility(android.view.View.VISIBLE);
                  if (printWebView != null) { rootLayout.removeView(printWebView); printWebView.destroy(); printWebView = null; }
                  Toast.makeText(MainActivity.this, "تعذرت تهيئة الطباعة: " + e.getMessage(), Toast.LENGTH_LONG).show();
                }
              }, 700);
            }
          });
          printWebView.loadDataWithBaseURL("file:///android_asset/www/", document, "text/html", "UTF-8", null);
        } catch (Exception e) {
          if (webView != null) webView.setVisibility(android.view.View.VISIBLE);
          Toast.makeText(MainActivity.this, "تعذرت تهيئة الطباعة: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
      });
    }
  }

  @Override protected void onResume() {
    super.onResume();
    if (printingInProgress) {
      printingInProgress = false;
      if (rootLayout != null && printWebView != null) {
        rootLayout.removeView(printWebView);
        printWebView.stopLoading();
        printWebView.destroy();
        printWebView = null;
      }
      if (webView != null) webView.setVisibility(android.view.View.VISIBLE);
    }
  }

  @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
    if (requestCode == FILE_PICKER && fileCallback != null) {
      Uri[] results = resultCode == RESULT_OK && data != null && data.getData() != null ? new Uri[]{data.getData()} : null;
      fileCallback.onReceiveValue(results);
      fileCallback = null;
    }
  }

  @Override public void onBackPressed() {
    if (webView != null && webView.canGoBack()) webView.goBack(); else super.onBackPressed();
  }
}
