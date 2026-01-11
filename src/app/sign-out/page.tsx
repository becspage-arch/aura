"use client";

import { SignOutButton } from "@clerk/nextjs";

export default function SignOutPage() {
  return (
    <div style={{ padding: 24 }}>
      <h1>Sign out</h1>
      <p>If you’re signed in, click below to sign out.</p>
      <SignOutButton redirectUrl="/" />
    </div>
  );
}
