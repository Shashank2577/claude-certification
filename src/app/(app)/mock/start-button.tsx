"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { startMock } from "@/app/actions/mock";
import { Button } from "@/components/ui/button";

export function StartMockButton({ certId }: { certId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        variant="accent"
        size="lg"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await startMock(certId);
            if (res?.error) setError(res.error);
          })
        }
      >
        {pending ? <Loader2 size={18} className="animate-spin" /> : null}
        Start the clock
      </Button>
      {error ? (
        <p role="alert" className="w-full text-sm text-bad">
          {error}
        </p>
      ) : null}
    </>
  );
}
