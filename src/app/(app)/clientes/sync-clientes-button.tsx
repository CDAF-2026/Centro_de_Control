"use client";

import { useState, useTransition } from "react";
import { sincronizarClientesEC } from "./actions";
import { Button } from "@/components/ui/button";

export function SyncClientesButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => {
          setMsg(null);
          setErr(null);
          start(async () => {
            const r = await sincronizarClientesEC();
            if (r.error) setErr(r.error);
            else setMsg(r.ok ?? "Listo.");
          });
        }}
      >
        {pending ? "Sincronizando…" : "Sincronizar con EasyCancha"}
      </Button>
      {msg && <span className="text-muted-foreground text-xs">{msg}</span>}
      {err && <span className="text-destructive text-xs">{err}</span>}
    </div>
  );
}
