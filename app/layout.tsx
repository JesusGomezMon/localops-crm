import type { Metadata } from "next";
import { Montserrat, Orbitron } from "next/font/google";

import "./globals.css";

// The production site pairs Orbitron (display) with Montserrat (body). next/font
// downloads and self-hosts both at build time, so there is no runtime request to
// Google and no layout shift. Note this makes `pnpm build` need network access.
const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-orbitron",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kasterz — Reserva tu cita",
  description: "Barbería, bar y spa en Cancún. Look good, feel good.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${orbitron.variable} ${montserrat.variable}`}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
