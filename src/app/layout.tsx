import type { Metadata, Viewport } from "next";
import { Pwa } from "@/components/pwa";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "TSV Vereinsmanager", template: "%s · TSV Vereinsmanager" },
  description:
    "Der digitale Vereinsraum der Handballabteilung des TSV Denkendorf.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/tsv-icon-192.png", apple: "/tsv-apple-touch-icon.png" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TSV Manager",
  },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#123f94",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>
        <a className="skip-link" href="#main">
          Zum Inhalt springen
        </a>
        <Pwa />
        {children}
      </body>
    </html>
  );
}
