import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif } from "next/font/google";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  weight: ["400", "500"],
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

const serif = Instrument_Serif({
  variable: "--font-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

const DESCRIPTION = "Paste a failed Solana transaction. Get the cause, the fix, and whether your funds are safe.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Rektopsy",
  description: DESCRIPTION,
  openGraph: {
    title: "Rektopsy",
    description: DESCRIPTION,
    images: [{ url: "/api/og", width: 1200, height: 630, alt: "Rektopsy: your transaction died, here is the autopsy." }],
  },
  twitter: { card: "summary_large_image", images: ["/api/og"] },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable} ${serif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
