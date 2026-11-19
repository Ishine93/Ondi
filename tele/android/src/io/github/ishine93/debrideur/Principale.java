package io.github.ishine93.debrideur;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.URL;
import java.util.Collections;

/**
 * Application télé du Débrideur : une seule page web en plein écran.
 * Elle ouvre d'abord le lanceur local (assets/index.html), qui trouve le serveur sur le réseau
 * puis affiche la page du Débrideur dans cette même vue. Aucune logique de serveur ici.
 */
public class Principale extends Activity {
    static final String LANCEUR = "file:///android_asset/index.html";
    static final int FOND = 0xFF0B1118;

    private FrameLayout racine;
    private WebView web;
    private View pleinEcran; // vidéo passée en plein écran par la page
    private WebChromeClient.CustomViewCallback finPleinEcran;
    private final Handler boucle = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle etat) {
        super.onCreate(etat);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        racine = new FrameLayout(this);
        racine.setBackgroundColor(FOND);
        setContentView(racine);
        creerWebView();
    }

    private void creerWebView() {
        web = new WebView(this);
        web.setBackgroundColor(FOND);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        WebSettings r = web.getSettings();
        r.setJavaScriptEnabled(true);
        r.setDomStorageEnabled(true);
        r.setMediaPlaybackRequiresUserGesture(false);
        r.setSupportZoom(false);
        r.setBuiltInZoomControls(false);
        r.setDisplayZoomControls(false);
        r.setUseWideViewPort(true);
        r.setTextZoom(100); // la taille du texte du système ne déforme pas la page
        web.addJavascriptInterface(new Pont(), "DebrideurAppli");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        racine.addView(web, 0, plein());
        web.loadUrl(LANCEUR);
        web.requestFocus();
    }

    private static FrameLayout.LayoutParams plein() {
        return new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    }

    // ---------- touches de la télécommande ----------

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int code = e.getKeyCode();
        String media = toucheMedia(code);
        if (code == KeyEvent.KEYCODE_BACK || code == KeyEvent.KEYCODE_PROG_RED || media != null) {
            if (e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0) {
                if (code == KeyEvent.KEYCODE_BACK) retour();
                else if (code == KeyEvent.KEYCODE_PROG_RED) retourLanceur("?reglage=1"); // comme la touche rouge Samsung
                else envoyerTouche(media);
            }
            return true; // ni l'activité ni le système ne traitent ces touches (Retour ne ferme jamais l'application)
        }
        // OK de la télécommande : la page le reçoit toujours comme la touche Entrée.
        if (code == KeyEvent.KEYCODE_DPAD_CENTER) {
            e = new KeyEvent(e.getDownTime(), e.getEventTime(), e.getAction(), KeyEvent.KEYCODE_ENTER, e.getRepeatCount(),
                    e.getMetaState(), e.getDeviceId(), e.getScanCode(), e.getFlags(), e.getSource());
        }
        return super.dispatchKeyEvent(e);
    }

    private static String toucheMedia(int code) {
        switch (code) {
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: return "MediaPlayPause";
            case KeyEvent.KEYCODE_MEDIA_PLAY: return "MediaPlay";
            case KeyEvent.KEYCODE_MEDIA_PAUSE: return "MediaPause";
            case KeyEvent.KEYCODE_MEDIA_STOP: return "MediaStop";
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: return "MediaFastForward";
            case KeyEvent.KEYCODE_MEDIA_REWIND: return "MediaRewind";
            case KeyEvent.KEYCODE_MEDIA_NEXT: return "MediaTrackNext";
            case KeyEvent.KEYCODE_MEDIA_PREVIOUS: return "MediaTrackPrevious";
            default: return null;
        }
    }

    // Retour : c'est la page (lanceur ou Débrideur) qui décide : fermer un panneau, revenir, ou quitter
    // (sur l'accueil, deux appuis puis DebrideurAppli.quitter()).
    private void retour() {
        String url = web.getUrl();
        if (url == null || !(estLanceur(url) || url.startsWith("http"))) {
            retourLanceur("");
            return;
        }
        envoyerTouche("GoBack");
    }

    // Le nom de touche vient toujours de la liste ci-dessus : rien d'extérieur n'est injecté.
    private void envoyerTouche(String touche) {
        web.evaluateJavascript("(function(){var c=document.activeElement||document.body;if(c)c.dispatchEvent("
                + "new KeyboardEvent('keydown',{key:'" + touche + "',bubbles:true,cancelable:true}));})()", null);
    }

    // ---------- navigation ----------

    private static boolean estLanceur(String url) {
        return url != null && url.startsWith(LANCEUR);
    }

    private static boolean memeServeur(String url, Uri cible) {
        Uri ici = Uri.parse(url);
        return ici.getHost() != null && ici.getHost().equalsIgnoreCase(cible.getHost()) && ici.getPort() == cible.getPort();
    }

    // Lanceur (« ?reglage=1 » : directement l'écran du choix du serveur). Toujours différé, jamais pendant un rappel.
    private void retourLanceur(final String suite) {
        boucle.post(() -> {
            if (finPleinEcran != null) finPleinEcran.onCustomViewHidden();
            web.loadUrl(LANCEUR + suite);
            web.requestFocus();
        });
    }

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView vue, WebResourceRequest demande) {
            return demande.isForMainFrame() && ailleurs(vue, demande.getUrl());
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView vue, String url) {
            return ailleurs(vue, Uri.parse(url));
        }

        // Depuis le lanceur, ou vers le même serveur : on reste ici. Un lien externe part vers le système
        // (s'il a de quoi l'ouvrir) : seule la page du Débrideur garde l'accès à DebrideurAppli.
        private boolean ailleurs(WebView vue, Uri cible) {
            String schema = cible.getScheme();
            if ("file".equals(schema) && cible.toString().startsWith(LANCEUR)) return false;
            if ("http".equals(schema) || "https".equals(schema)) {
                String ici = vue.getUrl();
                if (ici == null || estLanceur(ici) || memeServeur(ici, cible)) return false;
            }
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, cible));
            } catch (Exception ex) {
                // aucune application pour ce lien : on reste simplement sur la page
            }
            return true;
        }

        @Override
        public void onPageFinished(WebView vue, String url) {
            if (pleinEcran == null && !vue.hasFocus()) vue.requestFocus();
        }

        // Appelé pour la page principale seulement (sur Android 6 et plus, la version récente y renvoie).
        @Override
        @SuppressWarnings("deprecation")
        public void onReceivedError(WebView vue, int code, String description, String url) {
            // Serveur éteint ou injoignable : retour au lanceur, qui le cherche à nouveau.
            if (url != null && url.startsWith("http")) retourLanceur("");
        }

        // Moteur de la page arrêté (manque de mémoire) : nouvelle vue au lieu de faire planter l'application.
        @Override
        public boolean onRenderProcessGone(WebView vue, RenderProcessGoneDetail detail) {
            if (pleinEcran != null) racine.removeView(pleinEcran);
            pleinEcran = null;
            finPleinEcran = null;
            racine.removeView(vue);
            vue.destroy();
            if (vue == web) creerWebView();
            return true;
        }
    }

    private class Chrome extends WebChromeClient {
        @Override
        public void onShowCustomView(View vue, CustomViewCallback rappel) {
            if (pleinEcran != null) {
                rappel.onCustomViewHidden();
                return;
            }
            pleinEcran = vue;
            finPleinEcran = rappel;
            racine.addView(vue, plein());
            vue.setFocusable(true);
            vue.setFocusableInTouchMode(true);
            vue.requestFocus();
        }

        @Override
        public void onHideCustomView() {
            if (pleinEcran == null) return;
            racine.removeView(pleinEcran);
            pleinEcran = null;
            finPleinEcran = null;
            web.requestFocus();
        }

        // Pas d'image grise « lecture » sur les vidéos sans affiche.
        @Override
        public Bitmap getDefaultVideoPoster() {
            return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
        }
    }

    // ---------- fonctions offertes aux pages : window.DebrideurAppli ----------
    // (appelées hors du fil de l'interface : tout ce qui touche la vue passe par « boucle »)

    public class Pont {
        @JavascriptInterface
        public void quitter() {
            boucle.post(() -> finish());
        }

        @JavascriptInterface
        public void changerServeur() {
            retourLanceur("?reglage=1");
        }

        @JavascriptInterface
        public String version() {
            return versionAppli();
        }

        @JavascriptInterface
        public String plateforme() {
            return "android";
        }

        @JavascriptInterface
        public String ip() {
            return adresseIp();
        }

        // Adresse du serveur gardée par l'application (plus sûr que le stockage d'une page locale).
        @JavascriptInterface
        public String serveur() {
            return reglages().getString("serveur", "");
        }

        @JavascriptInterface
        public void garderServeur(String adresse) {
            reglages().edit().putString("serveur", adresse == null ? "" : adresse).apply();
        }

        // Ouvre le clavier de la télé sur le champ qui a la main (le lanceur l'appelle sur son champ d'adresse).
        @JavascriptInterface
        public void clavier() {
            boucle.postDelayed(() -> montrerClavier(true), 200);
        }
    }

    private SharedPreferences reglages() {
        return getSharedPreferences("debrideur", Context.MODE_PRIVATE);
    }

    private String versionAppli() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "";
        }
    }

    private void montrerClavier(boolean encore) {
        InputMethodManager clavier = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        if (clavier == null) return;
        if (!web.hasFocus()) web.requestFocus();
        if (!clavier.showSoftInput(web, 0) && encore) boucle.postDelayed(() -> montrerClavier(false), 400);
    }

    // Adresse IPv4 de l'appareil sur le réseau local, pour chercher le serveur sur le même réseau.
    private String adresseIp() {
        try {
            if (Build.VERSION.SDK_INT >= 23) {
                ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
                Network reseau = cm == null ? null : cm.getActiveNetwork();
                LinkProperties lien = reseau == null ? null : cm.getLinkProperties(reseau);
                if (lien != null) {
                    for (LinkAddress la : lien.getLinkAddresses()) {
                        InetAddress a = la.getAddress();
                        if (a instanceof Inet4Address && a.isSiteLocalAddress()) return a.getHostAddress();
                    }
                }
            }
        } catch (Exception e) {
            // on essaie l'autre méthode
        }
        try {
            for (NetworkInterface carte : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!carte.isUp() || carte.isLoopback()) continue;
                for (InetAddress a : Collections.list(carte.getInetAddresses())) {
                    if (a instanceof Inet4Address && a.isSiteLocalAddress()) return a.getHostAddress();
                }
            }
        } catch (Exception e) {
            // pas de réseau
        }
        return "";
    }

    // ---------- serveur éteint en cours de route : retour au lanceur (comme l'application Samsung) ----------

    private final Runnable surveillance = new Runnable() {
        @Override
        public void run() {
            boucle.postDelayed(this, 30000);
            final String url = web.getUrl();
            if (url == null || !url.startsWith("http")) return;
            final Uri page = Uri.parse(url);
            new Thread(() -> {
                if (repond(page, 4000) || repond(page, 6000)) return;
                boucle.post(() -> {
                    String ici = web.getUrl();
                    if (ici != null && ici.startsWith("http") && memeServeur(ici, page)) retourLanceur("");
                });
            }).start();
        }
    };

    private static boolean repond(Uri page, int delai) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(page.getScheme() + "://" + page.getEncodedAuthority() + "/api/ping").openConnection();
            c.setConnectTimeout(delai);
            c.setReadTimeout(delai);
            c.setUseCaches(false);
            return c.getResponseCode() == 200;
        } catch (Exception e) {
            return false;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    // ---------- cycle de vie ----------

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        pleinEcranSysteme();
        boucle.removeCallbacks(surveillance);
        boucle.postDelayed(surveillance, 30000);
    }

    @Override
    protected void onPause() {
        boucle.removeCallbacks(surveillance);
        web.onPause();
        super.onPause();
    }

    // Application quittée des yeux (touche Accueil…) : la lecture se met en pause, comme sur les autres plateformes.
    @Override
    protected void onStop() {
        web.evaluateJavascript("Array.prototype.forEach.call(document.querySelectorAll('video,audio'),function(m){try{m.pause()}catch(e){}})", null);
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        boucle.removeCallbacksAndMessages(null);
        if (web != null) {
            racine.removeView(web);
            web.destroy();
        }
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if (focus) pleinEcranSysteme();
    }

    @SuppressWarnings("deprecation")
    private void pleinEcranSysteme() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }
}
