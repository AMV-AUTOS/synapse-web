import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import { AMBER, BG0 } from "@/lib/constants";
import { ToastProvider } from "@/components/ui/Toast";
import { SorobanProvider } from "@/lib/soroban/SorobanProvider";
import { WalletProvider } from "@/lib/wallet/WalletProvider";
import "./globals.css";

/**
 * Self-hosted at build time by next/font, which also emits a preload link and
 * a size-adjusted fallback. Replaces the render-blocking Google Fonts
 * `@import` that used to sit at the top of globals.css.
 *
 * The weights are the ones the old stylesheet requested; adding more would
 * ship bytes nothing uses.
 */
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-ibm-plex-mono",
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

const title = "Synapse Core · Testnet";
const description = "Soroban transaction lifecycle dashboard";

export const viewport: Viewport = {
  themeColor: BG0,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  icons: {
    icon: [{ url: "/icon.png", type: "image/png", sizes: "512x512" }],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
    shortcut: "/favicon.ico",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "Synapse Core",
    title,
    description,
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Synapse Core — Soroban transaction lifecycle dashboard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/twitter-image.png"],
  },
  other: {
    "msapplication-TileColor": AMBER,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={ibmPlexMono.variable}>
      <body className="scanline-overlay">
        <ToastProvider>
          <SorobanProvider
            rpcUrl={process.env.NEXT_PUBLIC_SOROBAN_RPC_URL}
            defaultContractId={process.env.NEXT_PUBLIC_CONTRACT_ID}
          >
            <WalletProvider>{children}</WalletProvider>
          </SorobanProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
