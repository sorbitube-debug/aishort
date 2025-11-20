export enum Tab {
  SHORTS_CREATOR = 'shorts-creator',
  VIDEO_GEN = 'video-gen',
  IMAGE_GEN = 'image-gen',
  VIDEO_ANALYSIS = 'video-analysis',
  TTS = 'tts',
}

export type ImageAspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
export type VideoAspectRatio = "16:9" | "9:16";

// This is a global declaration to extend the Window interface

declare global {
  // Fix: Defined the `AIStudio` interface inside `declare global` to resolve a declaration conflict.
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    // Fix: Made 'aistudio' optional to resolve the "All declarations of 'aistudio' must have identical modifiers" error.
    aistudio?: AIStudio;
    webkitAudioContext: typeof AudioContext;
  }
}
