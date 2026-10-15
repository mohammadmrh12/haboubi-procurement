package com.haboubi.procurement;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.ValueCallback;
import android.webkit.JavascriptInterface;
import android.net.Uri;
import android.content.Intent;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.WebChromeClient.FileChooserParams;
import android.content.Context;
import android.widget.Toast;

public class MainActivity extends Activity {
  private WebView webView;
  private ValueCallback<Uri[]> fileCallback;
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
    @JavascriptInterface public void printPage() {
      runOnUiThread(() -> {
        try {
          PrintManager manager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
          manager.print("مستندات مشتريات الحبوبي", webView.createPrintDocumentAdapter("مستندات مشتريات الحبوبي"), new PrintAttributes.Builder().build());
        } catch (Exception e) {
          Toast.makeText(MainActivity.this, "تعذرت تهيئة الطباعة", Toast.LENGTH_LONG).show();
        }
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
