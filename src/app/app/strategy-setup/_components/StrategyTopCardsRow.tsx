// src/app/app/strategy-setup/_components/StrategyTopCardsRow.tsx
"use client";

import type { StrategySettings } from "../_lib/types";

function Card(props: {
  title: string;
  value: string;
  sub: string;
  right?: string | null;
}) {
  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div className="aura-muted aura-text-xs">{props.title}</div>
        {props.right ? <div className="aura-muted aura-text-xs">{props.right}</div> : null}
      </div>

      <div className="aura-mt-10">
        <div className="aura-kpi-value">{props.value}</div>
        <div className="aura-muted aura-text-xs aura-mt-6">{props.sub}</div>
      </div>
    </section>
  );
}

export function StrategyTopCardsRow(props: { current: StrategySettings | null }) {
  const presetLabel =
    props.current?.preset === "coreplus315" ? "CorePlus 315" : "CorePlus 315";

  const instrumentLabel =
    props.current?.symbols?.length ? props.current.symbols.join(", ") : "None";

  return (
    <div className="aura-dashboard-kpi-row">
      <Card
        title="Strategy"
        value={presetLabel}
        sub="The strategy Aura will run"
        right={null}
      />

      <Card
        title="Instrument"
        value={instrumentLabel}
        sub="The market Aura will trade"
        right={null}
      />
    </div>
  );
}
