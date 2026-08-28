"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

/**
 * Real, scannable QR code of the join link — client-side generated via the
 * `qrcode` package, rendered to a canvas. Colors resolve from the current
 * `--color-*` tokens so it stays legible against the near-black surface
 * (DESIGN.md dark-only base, no light QR-on-white default).
 */
export function JoinQrCode({ link }: { link: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, link, {
      width: 176,
      margin: 1,
      color: {
        dark: "#F2F1ED",
        light: "#131519",
      },
    }).catch(() => setError(true));
  }, [link]);

  if (error) {
    return (
      <p className="text-sm text-text-tertiary">
        Couldn&apos;t render a QR code — share the link directly instead.
      </p>
    );
  }

  return (
    <div className="inline-flex rounded-md border border-border bg-surface p-3">
      <canvas ref={canvasRef} width={176} height={176} />
    </div>
  );
}
