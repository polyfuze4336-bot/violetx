import { Info } from "lucide-react";

/** Health & medical safety notice. Violet is not a doctor. */
export function MedicalDisclaimer() {
  return (
    <div className="flex items-start gap-2 rounded-xl border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        Violet provides fitness and nutrition information and is not a substitute
        for professional medical advice.
      </span>
    </div>
  );
}
