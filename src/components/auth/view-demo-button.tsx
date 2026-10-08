"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Play } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { safeCallbackUrl } from "@/lib/auth-redirect";

/** One click into the read-only showcase. No credentials are typed or sent from here. */
export function ViewDemoButton({
  callbackUrl,
  ...props
}: { callbackUrl?: string } & Omit<ButtonProps, "onClick" | "type">) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");

  async function start() {
    if (state === "busy") return;
    setState("busy");
    try {
      const result = await signIn("demo", { redirect: false });
      if (result?.ok && !result.error) {
        window.location.assign(safeCallbackUrl(callbackUrl));
        return;
      }
    } catch {
      /* fall through to the message */
    }
    setState("error");
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={start} disabled={state === "busy"} {...props}>
        <Play className="h-4 w-4" />
        {state === "busy" ? "Opening demo…" : "View Demo"}
      </Button>
      {state === "error" && (
        <p role="alert" className="text-center text-xs text-destructive">
          The demo is not available right now.
        </p>
      )}
    </div>
  );
}
