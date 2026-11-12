"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const links = [{ href: "/", label: "Pegs" }];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="border-b border-border/80 bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[90rem] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="leading-tight">
            <span className="block font-medium tracking-tight">Vetro pegs</span>
            <span className="block text-xs text-muted-foreground">Public read-only monitor</span>
          </Link>
          <nav className="flex items-center gap-1">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
                    active && "bg-muted text-foreground",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <p className="hidden text-xs tracking-wide text-muted-foreground uppercase sm:block">
          Ethereum · Hemi
        </p>
      </div>
    </header>
  );
}
