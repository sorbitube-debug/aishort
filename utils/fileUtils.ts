
// Audio decoding helper functions
export const decode = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

export const decodeAudioData = async (
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> => {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
};

// Helper to write strings to DataView
function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// Convert AudioBuffer to WAV (16-bit PCM) base64 string
export const audioBufferToWav = (buffer: AudioBuffer): string => {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  let result: Float32Array;
  // Interleave channels if stereo
  if (numChannels === 2) {
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);
      result = new Float32Array(left.length * 2);
      for (let i = 0; i < left.length; i++) {
          result[i * 2] = left[i];
          result[i * 2 + 1] = right[i];
      }
  } else {
      result = buffer.getChannelData(0);
  }

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = result.length * bytesPerSample;
  const headerSize = 44;
  const wavBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(wavBuffer);

  // RIFF chunk
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write samples
  const samples = new Int16Array(wavBuffer, headerSize, result.length);
  for (let i = 0; i < result.length; i++) {
    // Clamp and scale to 16-bit integer
    const s = Math.max(-1, Math.min(1, result[i]));
    samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  // Convert to binary string then base64
  let binary = '';
  const bytes = new Uint8Array(wavBuffer);
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}

export const extractAudioFromVideo = async (videoFile: File): Promise<string | null> => {
  try {
    // Downsample to 16kHz mono to save tokens/bandwidth for API
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const arrayBuffer = await videoFile.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Merge to mono if needed to further reduce size
    let monoBuffer = audioBuffer;
    if (audioBuffer.numberOfChannels > 1) {
       const channels = audioBuffer.numberOfChannels;
       const length = audioBuffer.length;
       const newBuffer = audioContext.createBuffer(1, length, audioBuffer.sampleRate);
       const outputData = newBuffer.getChannelData(0);
       
       // Average all channels
       for (let i = 0; i < length; i++) {
         let sum = 0;
         for (let c = 0; c < channels; c++) {
           sum += audioBuffer.getChannelData(c)[i];
         }
         outputData[i] = sum / channels;
       }
       monoBuffer = newBuffer;
    }

    // Limit duration to 120 seconds (2 minutes) to prevent payload too large errors (Rpc failed code 6)
    // Previous limit of 240s caused issues with large files.
    const MAX_DURATION = 120;
    if (monoBuffer.duration > MAX_DURATION) {
        console.warn(`Video audio is too long (${monoBuffer.duration}s). Truncating to ${MAX_DURATION}s for API analysis.`);
        const truncatedLength = MAX_DURATION * monoBuffer.sampleRate;
        const truncatedBuffer = audioContext.createBuffer(1, truncatedLength, monoBuffer.sampleRate);
        truncatedBuffer.copyToChannel(monoBuffer.getChannelData(0).slice(0, truncatedLength), 0);
        monoBuffer = truncatedBuffer;
    }

    const wavBase64 = audioBufferToWav(monoBuffer);
    audioContext.close();
    return wavBase64;
  } catch (e) {
    console.error("Audio extraction failed:", e);
    return null;
  }
};

// Video frame extraction helper
export const extractVideoFrames = (
  videoFile: File,
  frameCount: number,
  onProgress: (progress: number) => void
): Promise<{ inlineData: { data: string; mimeType: string } }[]> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.src = URL.createObjectURL(videoFile);
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return reject(new Error('Could not get canvas context.'));
    }

    const frames: { inlineData: { data: string; mimeType: string } }[] = [];
    let hasStarted = false; // Guard to prevent running multiple times.

    // Use 'oncanplay' to ensure the video data is ready for seeking and drawing.
    video.oncanplay = async () => {
      if (hasStarted) return; // If we've already started, do nothing.
      hasStarted = true;

      // Downscale logic: Limit max dimension to 512px to reduce payload size
      const MAX_DIMENSION = 512;
      let width = video.videoWidth;
      let height = video.videoHeight;

      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const ratio = width / height;
        if (width > height) {
          width = MAX_DIMENSION;
          height = Math.round(MAX_DIMENSION / ratio);
        } else {
          height = MAX_DIMENSION;
          width = Math.round(MAX_DIMENSION * ratio);
        }
      }

      canvas.width = width;
      canvas.height = height;
      
      const duration = video.duration;

      if (!duration || duration === Infinity) {
          URL.revokeObjectURL(video.src);
          return reject(new Error('Could not determine video duration.'));
      }

      const interval = duration / frameCount;

      for (let i = 0; i < frameCount; i++) {
        const time = i * interval;
        video.currentTime = time;
        
        await new Promise<void>((resolveSeek) => {
          const seekedListener = () => {
            video.removeEventListener('seeked', seekedListener); 
            resolveSeek();
          };
          video.addEventListener('seeked', seekedListener);
        });

        ctx.drawImage(video, 0, 0, width, height);
        // Reduced quality to 0.5 to further ensure small payload and prevent RPC errors
        const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
        const base64Data = dataUrl.split(',')[1];
        
        if (!base64Data || base64Data.length < 100) { 
            console.warn(`Skipping potentially empty frame at time ${time}`);
            onProgress(((i + 1) / frameCount) * 100);
            continue;
        }

        frames.push({
          inlineData: {
            data: base64Data,
            mimeType: 'image/jpeg',
          },
        });
        onProgress(((i + 1) / frameCount) * 100);
      }
      
      URL.revokeObjectURL(video.src);
      resolve(frames);
    };

    video.onerror = (e) => {
      URL.revokeObjectURL(video.src);
      let errorMessage = 'Failed to load video file.';
      if (video.error) {
        switch (video.error.code) {
          case video.error.MEDIA_ERR_ABORTED:
            errorMessage = 'Video playback aborted.';
            break;
          case video.error.MEDIA_ERR_NETWORK:
            errorMessage = 'A network error caused the video download to fail.';
            break;
          case video.error.MEDIA_ERR_DECODE:
            errorMessage = 'The video could not be decoded, possibly due to corruption or unsupported format.';
            break;
          case video.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMessage = 'The video source format is not supported.';
            break;
          default:
            errorMessage = 'An unknown error occurred while loading the video.';
        }
      }
      reject(new Error(errorMessage));
    };
  });
};
