import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kombat",
    short_name: "Kombat",
    description: "Multiplayer games for real stakes.",
    start_url: "/",
    display: "standalone",
    background_color: "#161826",
    theme_color: "#161826",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
