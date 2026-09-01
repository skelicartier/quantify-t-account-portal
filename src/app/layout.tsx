import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://account.quantifyterminal.com"),
  title: {
    default: "Quantify Terminal Account",
    template: "%s | Quantify Terminal",
  },
  description: "Secure account access and administration for Quantify Terminal.",
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#030404",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={spaceGrotesk.variable}>
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
