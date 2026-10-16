"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CartBadge } from "./CartBadge";
import { CloseIcon, Logo, MenuIcon } from "./icons";

const nav = [
  { href: "/", label: "الرئيسية" },
  { href: "/shop", label: "المتجر" },
  { href: "/shop?c=birds", label: "الببغاوات" },
  { href: "/care", label: "دليل الرعاية" },
  { href: "/contact", label: "تواصل معنا" },
];

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
      <div className="container-x flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-extrabold">
          <Logo className="h-9 w-9" />
          <span>
            ببغاوتك <span className="text-sm font-semibold text-muted">YourParrot</span>
          </span>
        </Link>

        <nav aria-label="القائمة الرئيسية" className="hidden md:block">
          <ul className="flex items-center gap-1 text-sm font-semibold">
            {nav.map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={pathname === n.href ? "page" : undefined}
                  className="rounded-full px-3 py-2 hover:bg-surface-2 aria-[current=page]:text-brand"
                >
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <CartBadge />
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-nav" aria-label="قائمة الموبايل" className="border-t border-line bg-bg md:hidden">
          <ul className="container-x flex flex-col py-2 font-semibold">
            {nav.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="block rounded-xl px-3 py-3 hover:bg-surface-2">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
