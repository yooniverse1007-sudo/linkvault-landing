"use client";

import { useEffect, useState } from "react";

export function LegacyAppFrame() {
  const [src, setSrc] = useState("/legacy/index.html");

  useEffect(() => {
    setSrc(`/legacy/index.html${window.location.search}${window.location.hash}`);
  }, []);

  return (
    <iframe
      className="legacy-app-frame"
      src={src}
      title="LinkVault"
    />
  );
}
