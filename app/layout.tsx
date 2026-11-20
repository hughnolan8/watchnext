import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { PwaSetup } from "@/components/PwaSetup";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });

export const metadata: Metadata = {
    title: "WatchNext",
    description:
        "Film and TV suggestions from the streaming services you already pay for, with IMDb and Letterboxd ratings.",
    applicationName: "WatchNext",
    formatDetection: { telephone: false },
    appleWebApp: {
        capable: true,
        title: "WatchNext",
        statusBarStyle: "black-translucent",
    },
    // Next 15 only emits the generic "mobile-web-app-capable"; iOS looks for the
    // apple- prefixed one to open the Home Screen app full screen, without Safari's bars.
    other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    // Draw under the notch and home bar; globals.css pads content with safe-area insets
    viewportFit: "cover",
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#f6f3ee" },
        { media: "(prefers-color-scheme: dark)", color: "#0e0d0c" },
    ],
};

export default function RootLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en">
            <body
                className={`${inter.variable} ${fraunces.variable} antialiased`}
            >
                {children}
                <PwaSetup />
            </body>
        </html>
    );
}
