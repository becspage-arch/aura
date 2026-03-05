// src/app/native/consume-ticket/page.tsx
"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSignIn, useClerk } from "@clerk/nextjs";

function ConsumeTicketInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const { signIn } = useSignIn();
  const { setActive } = useClerk();

  useEffect(() => {
    const ticket = sp.get("ticket");
    if (!ticket || !signIn) return;

    (async () => {
      try {
        const res = await signIn.create({
          strategy: "ticket",
          ticket,
        } as any);

        const sid = (res as any)?.createdSessionId;

        if (sid) {
          await setActive({ session: sid });
        }

        router.replace("/app");
      } catch {
        router.replace("/sign-in");
      }
    })();
  }, [sp, router, signIn, setActive]);

  return <div style={{ padding: 24 }}>Signing you in…</div>;
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Signing you in…</div>}>
      <ConsumeTicketInner />
    </Suspense>
  );
}