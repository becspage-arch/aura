// src/app/layout.tsx
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter, Geist_Mono } from "next/font/google";
import Script from "next/script";
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

  // IMPORTANT:
  // - init MUST run in <head>
  // - iOS web push does NOT require safari_web_id, but Safari (macOS legacy) can.
  // - So we include safari_web_id only if it exists.
  const initObject = {
    appId,
    ...(safariWebId ? { safari_web_id: safariWebId } : {}),
    serviceWorkerPath: "/OneSignalSDKWorker.js",
    serviceWorkerParam: { scope: "/" },
    notifyButton: { enable: false },
  };

  const initInline = `
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    OneSignalDeferred.push(async function(OneSignal) {
      try {
        await OneSignal.init(${JSON.stringify(initObject)});
      } catch (e) {
        console.warn("[OneSignal] init error", e);
      }
    });
  `;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* PWA */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0b0b0b" />

        {/* iOS PWA */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />

        {/* OneSignal SDK (defer) */}
        <script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" defer />

        {/* OneSignal init in HEAD */}
        <Script id="onesignal-init" strategy="beforeInteractive">
          {initInline}
        </Script>
      </head>

      <body className={`${inter.variable} ${geistMono.variable} aura-body`}>
        <ClerkProvider afterSignInUrl="/app" afterSignUpUrl="/app">
          <ThemeProvider>{children}</ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
