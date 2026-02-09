// src/app/app/push/page.tsx
import { EnablePushCard } from "@/components/EnablePushCard";

export default function PushPage() {
  return (
    <div className="aura-page">
      <div className="aura-page-title">Phone Notifications</div>
      <div className="aura-mt-12">
        <EnablePushCard />
      </div>
    </div>
  );
}
