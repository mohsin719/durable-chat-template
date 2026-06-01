import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://usnumhub.com",
  ),
  title: {
    default: "VerifySMS — Virtual US numbers & OTP",
    template: "%s | VerifySMS",
  },
  description:
    "Purchase temporary US phone numbers and receive OTP codes in realtime for verification workflows.",
  openGraph: {
    title: "VerifySMS — Virtual SMS verification",
    description:
      "Secure temporary numbers, wallet billing, and realtime OTP delivery.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "VerifySMS",
    description: "Virtual US numbers and realtime OTP verification.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactElement {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
