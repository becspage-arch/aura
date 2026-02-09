// src/app/layout.tsx
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Aura",
  description: "Aura trading dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const appId = (process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "").trim();
  const safariWebId = (process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID || "").trim();

  // Hard fail early if appId missing (silent failures waste days)
  const initObject = {
    appId,
    ...(safariWebId ? { safari_web_id: safariWebId } : {}),
    serviceWorkerPath: "/OneSignalSDKWorker.js",
    serviceWorkerUpdaterPath: "/OneSignalSDKUpdaterWorker.js",
    serviceWorkerParam: { scope: "/" },
    notifyButton: { enable: false },
  };

  // Plain scripts (no next/script) to eliminate App Router script timing issues.
  // Also set a marker so your in-app diagnostics can prove init actually ran.
  const initInline = `
(function () {
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.__auraOneSignalInit = { ran: false, ok: false, error: null, at: null };

  var appId = ${JSON.stringify(appId)};
  if (!appId) {
    window.__auraOneSignalInit = { ran: true, ok: false, error: "Missing NEXT_PUBLIC_ONESIGNAL_APP_ID", at: new Date().toISOString() };
    return;
  }

  window.OneSignalDeferred.push(async function (OneSignal) {
    window.__auraOneSignalInit.ran = true;
    window.__auraOneSignalInit.at = new Date().toISOString();

    try {
      await OneSignal.init(${JSON.stringify(initObject)});
      window.__auraOneSignalInit.ok = true;
    } catch (e) {
      window.__auraOneSignalInit.ok = false;
      window.__auraOneSignalInit.error = (e && e.message) ? e.message : String(e);
    }
  });
})();
`;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* PWA */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0b0b0b" />

        {/* iOS PWA */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />

        {/* 1) Create queue + init marker immediately */}
        <script dangerouslySetInnerHTML={{ __html: initInline }} />

        {/* 2) Load OneSignal SDK (defer) */}
        <script
          src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
          defer
        />
      </head>

      <body className={`${inter.variable} ${geistMono.variable} aura-body`}>
        <ClerkProvider afterSignInUrl="/app" afterSignUpUrl="/app">
          <ThemeProvider>{children}</ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
