// src/app/sign-in/[[...sign-in]]/page.tsx
"use client";

import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <SignIn
      redirectUrl="/sso-callback"
      forceRedirectUrl="/app"
    />
  );
}