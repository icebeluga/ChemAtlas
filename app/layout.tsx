import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blueberry",
  applicationName: "Blueberry",
  manifest: "/site.webmanifest",
  description: "Browse AP Chemistry source questions by College Board unit and topic.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.ico",
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
