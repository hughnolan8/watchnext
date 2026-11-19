import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });

export const metadata: Metadata = {
    title: "WatchNext",
    description:
        "Film and TV suggestions from the streaming services you already pay for, with IMDb and Letterboxd ratings.",
    appleWebApp: {
        capable: true,
        title: "WatchNext",
        statusBarStyle: "black-translucent",
    },
};

export const viewport: Viewport = {
    themeColor: "#1c1a3a",
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
            </body>
        </html>
    );
}
