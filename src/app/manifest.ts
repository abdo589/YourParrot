import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ببغاوتك — YourParrot",
    short_name: "ببغاوتك",
    description: "متجر الببغاوات ومستلزماتها",
    start_url: "/",
    display: "standalone",
    dir: "rtl",
    lang: "ar",
    background_color: "#fbf8f1",
    theme_color: "#11734a",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
