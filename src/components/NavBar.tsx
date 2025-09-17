"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { Brain, Menu, X } from "lucide-react";

const LINKS = [
  { label: "Home", href: "/" },
  { label: "Practice Tests", href: "/tests" },
  { label: "SAT Question Bank", href: "/questions" },
  { label: "Daily SAT", href: "/daily" },
  { label: "AI Tutor", href: "/tutor" },
];

export default function NavBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  // Close on route change
  useEffect(() => {
    close();
  }, [pathname, close]);

  // Close on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <header className="sticky top-0 z-50 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6" style={{ minHeight: "72px" }}>
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            AIPrep
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          {LINKS.map(({ href, label }) => {
            const active = pathname === href || (href !== "/" && pathname?.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-2 relative group transition-colors ${
                  active ? "text-blue-400" : "text-slate-300 hover:text-blue-400"
                }`}
              >
                {label}
                <span
                  className={`absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-blue-400 to-purple-400 transition-all duration-300 ${
                    active ? "w-full" : "w-0 group-hover:w-full"
                  }`}
                />
              </Link>
            );
          })}

          <Link
            href="/questions"
            className="ml-2 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium transition-all duration-300 hover:scale-105"
          >
            Get Started
          </Link>
        </nav>

        {/* Mobile toggle */}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="md:hidden inline-flex items-center justify-center rounded-lg p-2 text-slate-300 hover:text-white hover:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          <span className="sr-only">Toggle navigation</span>
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile panel */}
      <div
        id="mobile-nav"
        className={`md:hidden overflow-hidden border-t border-slate-800 transition-[max-height,opacity] duration-300 ${
          open ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <nav className="px-4 sm:px-6 py-3 space-y-1">
          {LINKS.map(({ href, label }) => {
            const active = pathname === href || (href !== "/" && pathname?.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={`block rounded-lg px-3 py-2 transition-colors ${
                  active
                    ? "text-blue-400 bg-slate-800/60"
                    : "text-slate-300 hover:text-blue-400 hover:bg-slate-800/40"
                }`}
              >
                {label}
              </Link>
            );
          })}

          <Link
            href="/questions"
            className="block mt-2 text-center rounded-lg px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium transition-all duration-300"
          >
            Get Started
          </Link>
        </nav>
      </div>
    </header>
  );
}
