import type { Metadata } from "next";
import { Suspense } from "react";
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
    <html lang="en" className="h-full bg-neutral-950 text-neutral-100 antialiased">
      <body className="min-h-full flex flex-col bg-[#09090b] text-[#f4f4f5]">
        <MockDataBanner />
        <Suspense fallback={<div className="h-16 w-full border-b border-neutral-800 bg-neutral-950/80" />}>
          <Navbar />
        </Suspense>
        <main className="flex-1 w-full">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
