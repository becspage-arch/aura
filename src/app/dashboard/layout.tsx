// src/app/dashboard/layout.tsx
import { redirect } from "next/navigation";

export default function DashboardLayout() {
  // Canonical dashboard lives at /app
  redirect("/app");
}
