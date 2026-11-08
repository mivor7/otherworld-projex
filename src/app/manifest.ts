// Web app manifest — makes the site installable (Add to Home Screen) with a
// standalone app frame. Served at /manifest.webmanifest and auto-linked.
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Other World Projex",
    short_name: "OWP",
    description:
      "Provably-fair games, bounty boards and an auction house on Solana. Deposit $OWP, play from your balance, and withdraw anytime.",
    id: "/",
    start_url: "/",
    display: "standalone",
    background_color: "#05090b",
    theme_color: "#05090b",
    categories: ["games", "entertainment"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
