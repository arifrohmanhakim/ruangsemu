import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RuangSemu",
  description: "Virtual space — jalan, ketemu, ngobrol",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
