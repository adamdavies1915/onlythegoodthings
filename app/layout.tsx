import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Only Good Reads",
  description: "Show only the good stuff - 4 and 5 star Goodreads reviews",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}
