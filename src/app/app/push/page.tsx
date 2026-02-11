// src/app/app/push/page.tsx
import { EnablePushCard } from "@/components/EnablePushCard";
import { OneSignalLoader } from "@/components/OneSignalLoader";
import { OneSignalInit } from "@/components/OneSignalInit";

export default function PushPage() {
  return (
    <div className="aura-page">
      <OneSignalLoader />
      <OneSignalInit />

      <div className="aura-page-title">Phone Notifications</div>
      <div className="aura-mt-12">
        <EnablePushCard />
      </div>
    </div>
  );
}
