# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ── 플러그인 생성자 (2026-09-05) ──────────────────────────────────────────────
# 캐패시터 플러그인은 getDeclaredConstructor().newInstance(), 코르도바 플러그인
# (cordova-plugin-purchase)은 config.xml의 클래스 이름으로 리플렉션 생성된다.
# 캐패시터가 넣어 주는 규칙은 코르도바 쪽 생성자를 명시하지 않고 R8 컴팻 모드의
# 묵시적 유지에 기대고 있다 — AGP 9(strictFullModeForKeepRules)부터는 그 묵시가
# 사라지므로 미리 명시해 둔다. 최적화(proguard-android-optimize.txt)를 켠 지금도 무해하다.
-keep public class * extends org.apache.cordova.CordovaPlugin { <init>(); }
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * { <init>(); }
