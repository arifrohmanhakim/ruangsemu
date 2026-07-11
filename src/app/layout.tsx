import type { Metadata } from "next";
import "@mantine/core/styles.css";
import { Providers } from "./providers";
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
      <body style={{ WebkitFontSmoothing: "antialiased", MozOsxFontSmoothing: "grayscale" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
