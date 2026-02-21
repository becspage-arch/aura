// src/components/sidebar/SidebarProfile.tsx
"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";

export default function SidebarProfile() {
  const { user, isLoaded } = useUser();

  const name = isLoaded
    ? (user?.fullName ||
        [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
        user?.username ||
        "—")
    : "—";

  const email = isLoaded ? user?.primaryEmailAddress?.emailAddress ?? "—" : "—";

  return (
    <Link href="/app/profile" className="aura-sidebar__profile">
      <div className="aura-sidebar__avatar" aria-hidden="true" />
      <div className="aura-sidebar__profileText">
        <div className="aura-sidebar__profileName">{name}</div>
        <div className="aura-sidebar__profileSub">{email}</div>
      </div>
    </Link>
  );
}
