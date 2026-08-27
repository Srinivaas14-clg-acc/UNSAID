/**
 * Thin MediaRecorder wrapper — no external package (per plan: "no new
 * package for audio"). Exposes hold-to-talk start/stop plus a live RMS level
 * callback via AnalyserNode for the level-ring animation in VoiceRecorder.
 *
 * Client-side only concern, owned by frontend-lead.
 */

export interface RecorderHandle {
  stop: () => Promise<{ blob: Blob; mimeType: string }>;
  cancel: () => void;
}

export interface StartRecordingOptions {
  /** Called on every animation frame while recording with a 0..1 RMS amplitude. */
  onLevel?: (level: number) => void;
}

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const candidate of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported?.(candidate)
    ) {
      return candidate;
    }
  }
  return "audio/webm";
}

export async function startRecording(
  options: StartRecordingOptions = {}
): Promise<RecorderHandle> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone access is not available in this browser.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = pickMimeType();
  const mediaRecorder = new MediaRecorder(stream, { mimeType });
  const chunks: BlobPart[] = [];

  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });

  mediaRecorder.start();

  // Live level metering via Web Audio API — direct amplitude mapping, no
  // easing (DESIGN.md §5: the level ring is data-driven, not decorative).
  let rafId: number | null = null;
  let audioContext: AudioContext | null = null;

  if (options.onLevel) {
    try {
      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioContextCtor) {
        audioContext = new AudioContextCtor();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sumSquares = 0;
          for (let i = 0; i < data.length; i++) {
            const normalized = (data[i] - 128) / 128;
            sumSquares += normalized * normalized;
          }
          const rms = Math.sqrt(sumSquares / data.length);
          options.onLevel?.(Math.min(1, rms * 4));
          rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
      }
    } catch {
      // Level metering is a nice-to-have; recording still works without it.
    }
  }

  const teardown = () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    stream.getTracks().forEach((track) => track.stop());
    audioContext?.close().catch(() => {});
  };

  return {
    stop: () =>
      new Promise((resolve, reject) => {
        mediaRecorder.addEventListener(
          "stop",
          () => {
            teardown();
            if (chunks.length === 0) {
              reject(new Error("No audio captured."));
              return;
            }
            const blob = new Blob(chunks, { type: mimeType });
            resolve({ blob, mimeType });
          },
          { once: true }
        );
        if (mediaRecorder.state !== "inactive") mediaRecorder.stop();
      }),
    cancel: () => {
      teardown();
      if (mediaRecorder.state !== "inactive") mediaRecorder.stop();
    },
  };
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Strip the data URL prefix ("data:audio/webm;base64,")
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
