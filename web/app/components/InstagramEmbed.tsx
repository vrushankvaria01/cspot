"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    instgrm?: { Embeds: { process: () => void } };
  }
}

const SCRIPT_ID = "instagram-embed-script";

export function isInstagramUrl(url: string): boolean {
  return /instagram\.com\/(p|reel|reels|tv)\//i.test(url);
}

export default function InstagramEmbed({ url }: { url: string }) {
  useEffect(() => {
    if (!url || !isInstagramUrl(url)) return;

    const process = () => window.instgrm?.Embeds?.process();

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      process();
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = "https://www.instagram.com/embed.js";
    script.async = true;
    script.onload = process;
    document.body.appendChild(script);
  }, [url]);

  if (!url) return null;

  if (!isInstagramUrl(url)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block break-all text-xs text-lime-400 hover:underline"
      >
        {url}
      </a>
    );
  }

  return (
    <blockquote
      className="instagram-media"
      data-instgrm-permalink={url}
      data-instgrm-version="14"
      style={{ margin: 0, width: "100%" }}
    />
  );
}
