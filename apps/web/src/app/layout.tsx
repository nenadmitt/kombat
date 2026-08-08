import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
});

/** The brand face - the wordmark is drawn in it (branding/HANDOFF.md). */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-space-grotesk",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://playkombat.xyz";

const TITLE = "Kombat - Play. Compete. Win.";
const DESCRIPTION =
  "Multiplayer games for real stakes. Stake once into your pot, match against a real opponent, and the winner takes the pot.";

export const metadata: Metadata = {
  // Absolute URLs for the card: crawlers do not resolve relative image paths.
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Kombat",
    url: "/",
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Kombat - multiplayer games for real stakes, shown on three phones",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body>{children}</body>
    </html>
  );
}
