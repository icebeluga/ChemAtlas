import type { Metadata } from "next";
import "@/app/globals.css";
import "@/app/student-workspace.css";
import "@/app/student-redesign.css";

export const metadata: Metadata = {
  title: "AP Chemistry Question Catalog",
  description: "Browse AP Chemistry source questions by College Board unit and topic.",
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
