// src/components/ClerkProviderNative.tsx
"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { Capacitor } from "@capacitor/core";

export default function ClerkProviderNative({
  children,
}: {
  children: React.ReactNode;
}) {
  const isNative = Capacitor.isNativePlatform();

  return (
    <ClerkProvider
      afterSignInUrl="/app"
      afterSignUpUrl="/app"
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      standardBrowser={isNative}
    >
      {children}
    </ClerkProvider>
  );
}