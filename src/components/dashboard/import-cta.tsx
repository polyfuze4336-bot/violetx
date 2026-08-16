import Link from "next/link";
import { MessageSquareText } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Owner-only call to action linking to the WhatsApp import page. */
export function ImportWorkoutButton({ label = "Import Workout" }: { label?: string }) {
  return (
    <Button asChild>
      <Link href="/dashboard/import">
        <MessageSquareText className="h-4 w-4" />
        {label}
      </Link>
    </Button>
  );
}
