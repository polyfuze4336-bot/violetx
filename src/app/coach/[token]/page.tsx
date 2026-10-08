import { redirect } from "next/navigation";

// Links issued before the /share/coach/ route existed keep working.
export default function LegacyCoachLink({ params }: { params: { token: string } }) {
  redirect(`/share/coach/${encodeURIComponent(params.token)}`);
}
