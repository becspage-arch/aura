"use client";

import { useEffect } from "react";
import { useClerk } from "@clerk/nextjs";

export default function SignOutPage() {
  const { signOut } = useClerk();

  useEffect(() => {
    signOut().finally(() => {
      window.location.href = "/";
    });
  }, [signOut]);

  return <div className="p-6">Signing you out...</div>;
}
