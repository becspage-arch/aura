// src/app/dashboard/page.tsx
import { redirect } from "next/navigation";

export default function DashboardPage() {
  // Canonical dashboard lives at /app
  redirect("/app");
}
