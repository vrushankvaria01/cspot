"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Ideas", enabled: true },
  { href: "/research", label: "Research", enabled: true },
  { href: "/calendar", label: "Calendar", enabled: false },
  { href: "/collaborations", label: "Collaborations", enabled: false },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <span className="text-lg font-semibold tracking-tight">
          cspot<span className="text-lime-400">.</span>
        </span>
        <nav className="flex items-center gap-1">
          {LINKS.map((link) => {
            if (!link.enabled) {
              return (
                <span
                  key={link.href}
                  className="flex cursor-not-allowed items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-600"
                  title="Coming soon"
                >
                  {link.label}
                  <span className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-zinc-500">
                    soon
                  </span>
                </span>
              );
            }
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
