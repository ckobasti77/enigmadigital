import type { Metadata } from "next";
import localFont from "next/font/local";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { ConvexClientProvider } from "@/components/providers/convex-provider";
import "./globals.css";

const aeonik = localFont({
  src: [
    {
      path: "../public/assets/fonts/aeonik/aeonik-light.otf",
      weight: "300",
      style: "normal",
    },
    {
      path: "../public/assets/fonts/aeonik/aeonik-light-italic.otf",
      weight: "300",
      style: "italic",
    },
    {
      path: "../public/assets/fonts/aeonik/aeonik-regular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/assets/fonts/aeonik/aeonik-regular-italic.otf",
      weight: "400",
      style: "italic",
    },
    {
      path: "../public/assets/fonts/aeonik/aeonik-bold.otf",
      weight: "700",
      style: "normal",
    },
    {
      path: "../public/assets/fonts/aeonik/aeonik-bold-italic.otf",
      weight: "700",
      style: "italic",
    },
  ],
  variable: "--font-aeonik",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Enigma Command Center",
  description:
    "Marketing analytics command center for Enigma IT — GA4, Instagram, OpenReply and Ads in one dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ConvexAuthNextjsServerProvider>
      <html lang="en" className={`${aeonik.variable} h-full`}>
        <body className="min-h-full flex flex-col">
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
