// src/app/sign-up/[[...sign-up]]/page.tsx
"use client";

import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <SignUp
      redirectUrl="/sso-callback"
      forceRedirectUrl="/app"
    />
  );
}