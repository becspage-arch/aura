// src/app/app/activity/_components/ActivityFiltersRow.tsx
"use client";

import {
  ACTIVITY_SCOPE_COPY,
  SYSTEM_PRESET_COPY,
  type ActivityScopeCopyKey,
  type SystemPresetCopyKey,
} from "@/lib/auraCopy";

export type ActivityScope = "user" | "user+aura" | "all";
export type SystemPreset = "important" | "errors" | "settings" | "all";

function clampScope(params: { showDecisions: boolean; showSystem: boolean }): ActivityScope {
  if (params.showSystem) return "all";
  if (params.showDecisions) return "user+aura";
  return "user";
}

export function ActivityFiltersRow(props: {
  scope: ActivityScope;
  onScopeChange: (v: ActivityScope) => void;

  systemPreset: SystemPreset;
  onSystemPresetChange: (v: SystemPreset) => void;

  q: string;
  onQueryChange: (v: string) => void;

  onExport: () => void;
  loading?: boolean;
}) {
  const {
    scope,
    onScopeChange,
    systemPreset,
    onSystemPresetChange,
    q,
    onQueryChange,
    onExport,
    loading,
  } = props;

  const showDecisions = scope === "user+aura" || scope === "all";
  const showSystem = scope === "all";

  const scopeKey: ActivityScopeCopyKey = scope as ActivityScopeCopyKey;
  const presetKey: SystemPresetCopyKey = systemPreset as SystemPresetCopyKey;

  return (
    <div className="aura-grid-gap-12">
      <div className="aura-row-between">
        <div className="aura-grid-gap-10">
          <div className="aura-row" style={{ gap: 14, alignItems: "center" }}>
            <label className="aura-row" style={{ gap: 8, alignItems: "center", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={showDecisions}
                disabled={!!loading}
                onChange={(e) => {
                  const next = clampScope({ showDecisions: e.target.checked, showSystem });
                  onScopeChange(next);
                }}
              />
              <span>{ACTIVITY_SCOPE_COPY["user+aura"].label}</span>
            </label>

            <label className="aura-row" style={{ gap: 8, alignItems: "center", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={showSystem}
                disabled={!!loading}
                onChange={(e) => {
                  const next = clampScope({ showDecisions, showSystem: e.target.checked });
                  onScopeChange(next);
                }}
              />
              <span>{ACTIVITY_SCOPE_COPY["all"].label}</span>
            </label>
          </div>

          <div className="aura-muted aura-text-xs">
            {ACTIVITY_SCOPE_COPY[scopeKey]?.helper || ""}
            {showSystem ? (
              <>
                {" "}
                • <span>{SYSTEM_PRESET_COPY[presetKey]?.helper || ""}</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="aura-control-right">
          <input
            className="aura-input aura-control-right--lg"
            placeholder="Search activity…"
            value={q}
            onChange={(e) => onQueryChange(e.target.value)}
            disabled={!!loading}
          />

          <button
            type="button"
            className="aura-btn aura-btn-subtle"
            onClick={onExport}
            disabled={!!loading}
          >
            Export CSV
          </button>
        </div>
      </div>

      {showSystem ? (
        <div className="aura-pill-group">
          <button
            type="button"
            className="aura-pill-toggle"
            aria-pressed={systemPreset === "important"}
            onClick={() => onSystemPresetChange("important")}
          >
            <span className="aura-pill-indicator" />
            {SYSTEM_PRESET_COPY.important.label}
          </button>

          <button
            type="button"
            className="aura-pill-toggle"
            aria-pressed={systemPreset === "errors"}
            onClick={() => onSystemPresetChange("errors")}
          >
            <span className="aura-pill-indicator" />
            {SYSTEM_PRESET_COPY.errors.label}
          </button>

          <button
            type="button"
            className="aura-pill-toggle"
            aria-pressed={systemPreset === "settings"}
            onClick={() => onSystemPresetChange("settings")}
          >
            <span className="aura-pill-indicator" />
            {SYSTEM_PRESET_COPY.settings.label}
          </button>

          <button
            type="button"
            className="aura-pill-toggle"
            aria-pressed={systemPreset === "all"}
            onClick={() => onSystemPresetChange("all")}
          >
            <span className="aura-pill-indicator" />
            {SYSTEM_PRESET_COPY.all.label}
          </button>
        </div>
      ) : null}
    </div>
  );
}
