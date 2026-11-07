import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AP Chemistry Practice Studio",
  description: "Build reusable AP Chemistry practice sessions, review explanations, and track concepts to revisit.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
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
