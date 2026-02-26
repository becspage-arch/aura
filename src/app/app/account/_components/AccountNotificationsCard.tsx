// src/app/app/account/_components/AccountNotificationsCard.tsx
"use client";

import { useState } from "react";
import { PushStatusRow } from "@/components/PushStatusRow";
import { TestEmailButton } from "@/components/TestEmailButton";
import { NotificationPreferences } from "@/components/NotificationPreferences";
import { OneSignalLoader } from "@/components/OneSignalLoader";
import { OneSignalInit } from "@/components/OneSignalInit";
import { EnablePushCard } from "@/components/EnablePushCard";

export function AccountNotificationsCard() {
  const [pushOpen, setPushOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Notifications</div>
          <div className="aura-muted aura-text-xs">
            Choose what you want to hear about, then where Aura should send it.
          </div>
        </div>
      </div>

      <div className="aura-mt-12 aura-grid-gap-12">
        {/* Events */}
        <div className="aura-grid-gap-10">
          <div className="aura-control-title">Events</div>
          <div className="aura-control-help">Choose which events you want alerts for.</div>
          <NotificationPreferences />
        </div>

        <div className="aura-divider" />

        {/* Channels */}
        <div className="aura-grid-gap-12">
          <div>
            <div className="aura-control-title">Channels</div>
            <div className="aura-control-help">Choose where Aura should send notifications.</div>
          </div>

          {/* In-app */}
          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">In-app (browser)</div>
              <div className="aura-control-help">Pop-up messages while Aura is open.</div>
            </div>
            <span className="aura-select-pill">On</span>
          </div>

          {/* Phone push (inline) */}
          <div className="aura-card-muted aura-grid-gap-12">
            <div className="aura-control-row">
              <div className="aura-control-meta">
                <div className="aura-control-title">Phone push</div>
                <div className="aura-control-help">
                  Lock-screen notifications (setup required on this device).
                </div>
              </div>

              <div className="aura-control-right" style={{ display: "flex", gap: 8 }}>
                <PushStatusRow />
                <button
                  type="button"
                  className="aura-btn"
                  onClick={() => setPushOpen((v) => !v)}
                >
                  {pushOpen ? "Hide" : "Enable / manage"}
                </button>
              </div>
            </div>

            {pushOpen ? (
              <div className="aura-mt-10 aura-grid-gap-12">
                <OneSignalLoader />
                <OneSignalInit />
                <EnablePushCard compact />
              </div>
            ) : null}
          </div>

          {/* Email (inline) */}
          <div className="aura-card-muted aura-grid-gap-12">
            <div className="aura-control-row">
              <div className="aura-control-meta">
                <div className="aura-control-title">Email</div>
                <div className="aura-control-help">
                  Test email sending for trade closed alerts.
                </div>
              </div>

              <div className="aura-control-right">
                <button
                  type="button"
                  className="aura-btn"
                  onClick={() => setEmailOpen((v) => !v)}
                >
                  {emailOpen ? "Hide" : "Send test"}
                </button>
              </div>
            </div>

            {emailOpen ? (
              <div className="aura-mt-10">
                <TestEmailButton />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
