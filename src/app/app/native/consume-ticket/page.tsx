// src/app/native/consume-ticket/page.tsx
"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSignIn } from "@clerk/nextjs";

export default function Page() {
  const sp = useSearchParams();
  const router = useRouter();
  const { signIn } = useSignIn();

  useEffect(() => {
    const ticket = sp.get("ticket");
    if (!ticket || !signIn) return;

    (async () => {
      try {
        const res = await signIn.create({
          strategy: "ticket",
          ticket,
        } as any);

        // If Clerk returns a session, set it active
        // (shape can vary; this works with Clerk v6 patterns)
        // @ts-ignore
        const sid = res?.createdSessionId ?? res?.createdSessionId;
        if (sid) {
          // @ts-ignore
          await signIn.setActive({ session: sid });
        }

        router.replace("/app");
      } catch {
        router.replace("/sign-in");
      }
    })();
  }, [sp, router, signIn]);

  return <div style={{ padding: 24 }}>Signing you in…</div>;
}