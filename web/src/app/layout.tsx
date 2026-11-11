import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Great_Vibes } from "next/font/google";
import { IdleSignOut } from "@/components/idle-sign-out";
import "./globals.css";

const greatVibes = Great_Vibes({
  variable: "--font-great-vibes",
  weight: "400",
  subsets: ["latin"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  weight: ["500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Metzey",
  description: "Time clock, schedule and inventory for small businesses.",
  appleWebApp: { capable: true, title: "Metzey", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#faf8f3",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${greatVibes.variable} ${cormorant.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <ClerkProvider>
          {children}
          <IdleSignOut />
        </ClerkProvider>
      </body>
    </html>
  );
}
