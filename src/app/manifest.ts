import type { MetadataRoute } from "next";

// Hardcoded hex is sanctioned here only: a manifest is static JSON and cannot
// read CSS variables. Values mirror the Earth (default) theme tokens in
// src/styles/design-tokens.css — --theme-canvas: #0d0c0a. If the Earth canvas
// token ever changes, update these in the same PR.
const EARTH_CANVAS = "#0d0c0a";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Serene",
    short_name: "Serene",
    description: "Internal operating system for Indulge team members.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: EARTH_CANVAS,
    theme_color: EARTH_CANVAS,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
