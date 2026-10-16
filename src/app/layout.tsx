import type { Metadata } from "next";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MockDataBanner from "@/components/MockDataBanner";

export const metadata: Metadata = {
  title: "Algoxilla Certificate Platform | Tamper-Proof Hackathon Credentials",
  description: "Official credential issuance and verification platform for Algoxilla events, hackathons, and national competitions. Features tamper-proof verification and self-service retrieval.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html 
      lang="en" 
      suppressHydrationWarning
      className="h-full bg-neutral-950 text-neutral-100 antialiased"
    >
      <head>
        {/*
          Hydration Safeguard Script:
          Removes extension-injected attributes (such as webcrx, webcrx-bridged, Grammarly, etc.)
          from document.documentElement before and during React hydration, resolving browser-extension
          attribute mismatch warnings without hiding development indicators.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var clean = function() {
                    var el = document.documentElement;
                    if (el) {
                      if (el.hasAttribute('webcrx')) el.removeAttribute('webcrx');
                      if (el.hasAttribute('webcrx-bridged')) el.removeAttribute('webcrx-bridged');
                    }
                  };
                  clean();
                  if (typeof MutationObserver !== 'undefined') {
                    var observer = new MutationObserver(clean);
                    observer.observe(document.documentElement, { attributes: true });
                    window.addEventListener('load', function() {
                      setTimeout(function() { observer.disconnect(); }, 2000);
                    });
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-[#09090b] text-[#f4f4f5]">
        <MockDataBanner />
        <Suspense fallback={<div className="h-16 w-full border-b border-neutral-800 bg-neutral-950/80" />}>
          <Navbar />
        </Suspense>
        <main className="flex-1 w-full">{children}</main>
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}
