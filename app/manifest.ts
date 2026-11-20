import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "WatchNext",
        short_name: "WatchNext",
        description:
            "Film and TV suggestions from the streaming services you already pay for, with IMDb and Letterboxd ratings.",
        id: "/",
        start_url: "/",
        scope: "/",
        display: "standalone",
        display_override: ["standalone", "minimal-ui"],
        orientation: "any",
        // Matches the dark theme so the launch screen doesn't flash white
        background_color: "#0e0d0c",
        theme_color: "#0e0d0c",
        categories: ["entertainment"],
        icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            {
                src: "/icon-maskable-512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "maskable",
            },
        ],
    };
}
