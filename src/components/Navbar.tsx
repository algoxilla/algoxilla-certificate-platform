"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { 
  ShieldCheck, 
  UserCheck, 
  LayoutDashboard, 
  Menu, 
  X, 
  Sparkles
} from "lucide-react";

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/portal", label: "Participant Portal", icon: UserCheck },
    { href: "/verify", label: "Verify Certificate", icon: ShieldCheck },
    { href: "/admin", label: "Organizer Dashboard", icon: LayoutDashboard },
  ];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-neutral-800/80 bg-neutral-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo & Brand Name */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative h-9 w-28 sm:h-10 sm:w-32 rounded bg-white p-1 overflow-hidden transition-transform group-hover:scale-105 shadow-sm">
              <Image
                src="/brand/algoxilla-logo.jpg"
                alt="Algoxilla Official Logo"
                fill
                sizes="(max-width: 768px) 112px, 128px"
                className="object-contain"
                priority
              />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                Credentials
              </span>
              <span className="text-[10px] font-mono text-red-500 uppercase tracking-wider">
                Phase 1 Preview
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1 lg:space-x-2">
            {navLinks.map((link) => {
              const active = isActive(link.href);
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    active
                      ? "bg-red-500/10 text-red-400 border border-red-500/30"
                      : "text-neutral-300 hover:text-white hover:bg-neutral-800/60"
                  }`}
                >
                  {Icon && <Icon className="w-4 h-4" />}
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Right Section / Badge & CTA */}
          <div className="hidden sm:flex items-center gap-3">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-neutral-900 border border-neutral-800 text-[11px] font-mono text-neutral-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Mock Engine Ready
            </div>
            <Link
              href="/portal"
              className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-red-600 hover:bg-red-500 text-white transition-colors shadow-sm shadow-red-950 flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Claim Demo
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-neutral-800 bg-neutral-950/95 px-4 pt-2 pb-4 space-y-1">
          {navLinks.map((link) => {
            const active = isActive(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md text-base font-medium transition-colors ${
                  active
                    ? "bg-red-500/10 text-red-400 border border-red-500/30"
                    : "text-neutral-300 hover:text-white hover:bg-neutral-800/60"
                }`}
              >
                {Icon && <Icon className="w-5 h-5 text-neutral-400" />}
                {link.label}
              </Link>
            );
          })}
          <div className="pt-2 border-t border-neutral-800 flex items-center justify-between">
            <span className="text-xs font-mono text-neutral-500">Phase 1 Sandbox</span>
            <Link
              href="/portal"
              onClick={() => setMobileMenuOpen(false)}
              className="px-4 py-2 text-xs font-semibold rounded-md bg-red-600 text-white"
            >
              Claim Mock Certificate
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
