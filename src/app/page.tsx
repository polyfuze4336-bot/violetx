import Link from "next/link";
import { LineChart, MessageSquareText, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo, LogoWordmark } from "@/components/brand/logo";
import { ViewDemoButton } from "@/components/auth/view-demo-button";
import { isDemoModeEnabled } from "@/lib/demo-mode";

// The demo button depends on the deployment setting.
export const dynamic = "force-dynamic";

const features = [
  {
    icon: MessageSquareText,
    title: "WhatsApp import",
    description:
      "Paste the coach's WhatsApp message and turn it into structured records instantly.",
  },
  {
    icon: LineChart,
    title: "Progress trends",
    description:
      "Body weight, measurements and strength plotted over time so change is obvious.",
  },
  {
    icon: Trophy,
    title: "Personal records",
    description:
      "Automatic max weight and max reps tracking for every exercise you train.",
  },
];

export default function Home() {
  return (
    <div className="app-surface flex min-h-screen flex-col">
      <header className="glass sticky top-0 z-30 border-b">
        <div className="container flex h-16 items-center justify-between">
          <LogoWordmark />
          <Button asChild size="sm" variant="outline">
            <Link href="/signin">Sign in</Link>
          </Button>
        </div>
      </header>

      <main className="container flex flex-1 flex-col items-center justify-center gap-14 py-24 text-center">
        <div className="max-w-2xl space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center">
            <Logo className="h-16 w-16" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            <span className="text-brand-gradient">Train.</span> Explore.{" "}
            <span className="text-brand-gradient">Evolve.</span>
          </h1>
          <p className="text-lg text-muted-foreground">
            VioletX is an AI-powered fitness intelligence platform — track body
            measurements, strength and personal records, chat with your AI coach
            Violet, and explore gyms across Malaysia. Coaches follow along,
            read-only.
          </p>
          <div className="flex flex-wrap items-start justify-center gap-3">
            {isDemoModeEnabled() && <ViewDemoButton callbackUrl="/dashboard" size="lg" />}
            <Button asChild size="lg" variant={isDemoModeEnabled() ? "outline" : "default"}>
              <Link href="/signin">Sign in</Link>
            </Button>
          </div>
        </div>

        <div className="grid w-full max-w-4xl gap-6 sm:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border bg-card p-6 text-left shadow-[0_1px_2px_rgba(20,12,40,0.04),0_10px_30px_-16px_rgba(20,12,40,0.12)]"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="mb-1 font-semibold">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        VioletX — AI fitness intelligence &amp; gym exploration.
      </footer>
    </div>
  );
}
