"use client";

import { useEffect } from "react";
import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

export default function SignOutPage() {
  const { signOut } = useClerk();
  const router = useRouter();

  useEffect(() => {
    // Signs out immediately then returns home
    signOut(() => router.push("/"));
  }, [signOut, router]);

  return <p style={{ padding: 16 }}>Signing you out…</p>;
}