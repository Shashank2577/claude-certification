"use client";

import { useState, useTransition } from "react";
import { Copy, KeyRound, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { resetUserPassword, setUserRole } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function UserControls({ userId, role, isSelf, name }: { userId: number; role: "user" | "admin"; isSelf: boolean; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const toggleRole = () =>
    start(async () => {
      setError(null);
      const res = await setUserRole(userId, role === "admin" ? "user" : "admin");
      if (res.error) setError(res.error);
    });

  const reset = () =>
    start(async () => {
      setError(null);
      const res = await resetUserPassword(userId);
      setConfirmReset(false);
      if (res.error) setError(res.error);
      else if (res.password) setTemp(res.password);
    });

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={toggleRole} disabled={pending || (isSelf && role === "admin")} title={isSelf ? "You can’t change your own role" : undefined}>
          {role === "admin" ? <ShieldOff size={15} /> : <ShieldCheck size={15} />}
          {role === "admin" ? "Remove admin" : "Make admin"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setConfirmReset(true)} disabled={pending}>
          <KeyRound size={15} /> Reset password
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      ) : null}

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Reset password">
        <p className="font-display text-xl font-semibold">Reset {name}’s password?</p>
        <p className="mt-2 text-ink-2">They’ll be signed out on every device and will need the temporary password you’ll see next.</p>
        <div className="mt-6 flex gap-2">
          <Button variant="danger" onClick={reset} disabled={pending} data-autofocus>
            {pending ? <Loader2 size={16} className="animate-spin" /> : null}
            Reset password
          </Button>
          <Button variant="ghost" onClick={() => setConfirmReset(false)}>
            Cancel
          </Button>
        </div>
      </Modal>

      <Modal
        open={!!temp}
        onClose={() => {
          setTemp(null);
          setCopied(false);
        }}
        title="Temporary password"
      >
        <p className="font-display text-xl font-semibold">Temporary password</p>
        <p className="mt-2 text-ink-2">Share this with {name} privately. It won’t be shown again; ask them to change it in settings.</p>
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-surface-2 p-3">
          <code className="flex-1 font-mono text-base break-all select-all">{temp}</code>
          <Button
            variant="outline"
            size="sm"
            data-autofocus
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(temp ?? "");
                setCopied(true);
              } catch {}
            }}
          >
            <Copy size={14} /> {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
