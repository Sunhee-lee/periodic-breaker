import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Periodic Breaker",
  description: "A brick-breaker game with periodic table elements",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="min-h-full flex flex-col bg-[#0a0a0a] text-[#ededed] font-sans">
        {children}
      </body>
    </html>
  );
}
