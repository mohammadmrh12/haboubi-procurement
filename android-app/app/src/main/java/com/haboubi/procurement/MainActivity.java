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
import android.widget.Toast;
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
    setContentView(webView);
    webView.loadUrl("file:///android_asset/www/index.html");
  }

  private class AppBridge {
    @JavascriptInterface public void authenticate(String code) {
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
          payload.put("remember", true);
          byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
          try (OutputStream out = connection.getOutputStream()) { out.write(body); }
          int status = connection.getResponseCode();
          if (status >= 200 && status < 300) {
            String cookie = connection.getHeaderField("Set-Cookie");
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
          if (printWebView != null) { printWebView.destroy(); printWebView = null; }
          printWebView = new WebView(MainActivity.this);
          WebSettings printSettings = printWebView.getSettings();
          printSettings.setJavaScriptEnabled(false);
          printSettings.setAllowFileAccess(true);
          String safeCss = (cssUrl == null ? "file:///android_asset/www/styles.css" : cssUrl.replace("&", "&amp;").replace("\"", "&quot;"));
          String document = "<!doctype html><html lang=\"ar\" dir=\"rtl\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><link rel=\"stylesheet\" href=\"" + safeCss + "\"><style>html,body{margin:0;padding:0;background:#fff!important;color:#000!important}.print-actions{display:none!important}#printArea{display:block!important;background:#fff!important;color:#000!important}.official-page{box-shadow:none!important;margin:0!important}@page{size:A4;margin:0}</style></head><body><div class=\"view printing\"><div id=\"printArea\">" + (html == null ? "" : html) + "</div></div></body></html>";
          printWebView.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
              view.postDelayed(() -> {
                try {
                  PrintManager manager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                  if (manager != null) manager.print("مستندات مشتريات الحبوبي", view.createPrintDocumentAdapter("مستندات مشتريات الحبوبي"), new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).setResolution(new PrintAttributes.Resolution("haboubi", "مستندات الحبوبي", 300, 300)).setMinMargins(PrintAttributes.Margins.NO_MARGINS).build());
                } catch (Exception e) { Toast.makeText(MainActivity.this, "تعذرت تهيئة الطباعة", Toast.LENGTH_LONG).show(); }
              }, 350);
            }
          });
          printWebView.loadDataWithBaseURL("file:///android_asset/www/", document, "text/html", "UTF-8", null);
        } catch (Exception e) { Toast.makeText(MainActivity.this, "تعذرت تهيئة الطباعة", Toast.LENGTH_LONG).show(); }
      });
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
