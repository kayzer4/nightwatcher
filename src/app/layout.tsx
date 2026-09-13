import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nightwatcher",
  description: "3D City Scene",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full m-0 p-0 overflow-hidden">{children}</body>
    </html>
  );
}
