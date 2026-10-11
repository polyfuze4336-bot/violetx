import { FileDown } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Downloads a PDF of recorded progression and PRs to send to a coach. A plain
 * link: the file is built on demand from the athlete's recorded sets.
 */
export function ExportPdfButton({ exerciseId, label = "Export PDF for coach" }: { exerciseId?: string; label?: string }) {
  const href = exerciseId ? `/dashboard/export/progress?exercise=${encodeURIComponent(exerciseId)}` : "/dashboard/export/progress";
  return (
    <Button asChild variant="outline">
      <a href={href} download>
        <FileDown className="h-4 w-4" />
        {label}
      </a>
    </Button>
  );
}
