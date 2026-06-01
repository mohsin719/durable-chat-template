import type { ReactElement, ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Shield, Zap, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage(): ReactElement {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <span className="text-lg font-semibold tracking-tight">VerifySMS</span>
          <nav className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Log in
            </Link>
            <Button asChild size="sm">
              <Link href="/register">
                Get started
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </nav>
        </div>
      </header>
      <main className="flex flex-1 flex-col">
        <section className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-24 md:flex-row md:items-center md:py-32">
          <div className="flex-1 space-y-6">
            <p className="inline-flex rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
              Secure, instant, and reliable SMS verification
            </p>
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
              Virtual numbers.
              <span className="block bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Realtime OTP delivery.
              </span>
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">
              Protect your privacy and streamline verification with our premium virtual numbers. Instantly receive SMS codes and manage your active lines from a secure, easy-to-use dashboard.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/register">Create account</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
          </div>
          <div className="glass-panel flex flex-1 flex-col gap-4 p-8">
            <Feature icon={<Shield className="h-5 w-5" />} title="Bank-grade Security">
              Your sessions and data are encrypted and protected at all times.
            </Feature>
            <Feature icon={<Zap className="h-5 w-5" />} title="Instant Delivery">
              Experience zero delay. Verification codes appear instantly via our real-time network.
            </Feature>
            <Feature icon={<Smartphone className="h-5 w-5" />} title="Dedicated Lines">
              Lease exclusive, temporary numbers that guarantee your privacy and security.
            </Feature>
          </div>
        </section>
      </main>
      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        VerifySMS — Virtual SMS verification platform
      </footer>
    </div>
  );
}

function Feature({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 text-primary">{icon}</div>
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
