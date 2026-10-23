import type { Metadata, Viewport } from "next"
import { IBM_Plex_Sans_Arabic, Inter, JetBrains_Mono } from "next/font/google"
import "./globals.css"
import { AppFrame } from "@/components/shell/app-frame"
import { ServiceWorkerBridge } from "@/components/shell/service-worker-bridge"

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
})

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
})

/**
 * Inter has no Arabic coverage, so Arabic UI text and transcripts would render
 * as tofu boxes. This is the Arabic companion for the same sans role — it is
 * appended to the font stack, not treated as a third typeface.
 */
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-arabic",
  display: "swap",
})

export const metadata: Metadata = {
  title: "HADER AI | حاضر — Lecture & Meeting Assistant",
  description:
    "Follow lectures and meetings with source-grounded transcript review, catch-up, proposed questions, optional local AI and name-call alerts.",
  applicationName: "HADER AI",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "HADER AI",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: "#12161f",
  width: "device-width",
  initialScale: 1,
  // Alert buttons must stay reachable; allow zoom for accessibility.
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrains.variable} ${plexArabic.variable} bg-background`}
    >
      <body className="min-h-dvh bg-background font-sans antialiased">
        <ServiceWorkerBridge />
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  )
}
