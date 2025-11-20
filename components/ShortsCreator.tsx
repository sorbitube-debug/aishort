
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { analyzeVideoForClipping } from '../services/geminiService';
import { extractVideoFrames, extractAudioFromVideo } from '../utils/fileUtils';
import { Loader } from './common/Loader';
import { Icon } from './common/Icon';

const FRAME_COUNT = 10; // Reduced frames to prevent RPC payload errors
const RENDER_WIDTH = 720;
const RENDER_HEIGHT = 1280;
const PREVIEW_WIDTH = 300;
const PREVIEW_HEIGHT = 533;
const PREVIEW_SCALE = PREVIEW_WIDTH / RENDER_WIDTH;


interface Subtitle {
    text: string;
    start: number;
    end: number;
    fontSize?: number;
    position?: 'top' | 'middle' | 'bottom';
}

interface ClipAnalysis {
    startTime: number;
    endTime: number;
    subtitles: Subtitle[];
}

interface StylePreset {
    id: string;
    name: string;
    fontSize: number;
    fontColor: string;
    outlineColor: string;
    outlineWidth: number;
    position: 'bottom' | 'middle' | 'top';
}

const STYLE_PRESETS: StylePreset[] = [
    {
        id: 'modern',
        name: 'مدرن',
        fontSize: 58,
        fontColor: '#FFD700', // Gold
        outlineColor: '#000000',
        outlineWidth: 4,
        position: 'bottom'
    },
    {
        id: 'classic',
        name: 'کلاسیک',
        fontSize: 52,
        fontColor: '#FFFFFF',
        outlineColor: '#000000',
        outlineWidth: 6,
        position: 'bottom'
    },
    {
        id: 'minimalist',
        name: 'مینیمال',
        fontSize: 48,
        fontColor: '#FFFFFF',
        outlineColor: 'rgba(0,0,0,0.5)', // Subtle shadow/outline
        outlineWidth: 2,
        position: 'bottom'
    },
     {
        id: 'impact',
        name: 'پرانرژی',
        fontSize: 64,
        fontColor: '#FF3333',
        outlineColor: '#FFFFFF',
        outlineWidth: 4,
        position: 'bottom'
    }
];

const parseSrt = (srtText: string): Subtitle[] => {
    const subtitles: Subtitle[] = [];
    // Standardize line endings and split into blocks
    const blocks = srtText.replace(/\r/g, '').split('\n\n');

    const timeToSeconds = (time: string): number => {
        // Handle both comma (SRT standard) and dot (VTT/some SRT) separators for milliseconds
        const parts = time.split(/[:,\.]/); 
        if (parts.length < 3) return 0;
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const s = parseInt(parts[2], 10);
        const ms = parts[3] ? parseInt(parts[3], 10) : 0;
        return h * 3600 + m * 60 + s + ms / 1000;
    };

    for (const block of blocks) {
        if (!block.trim()) continue;
        const lines = block.split('\n');
        if (lines.length >= 3) { // Expect at least index, timestamp, and text
            // Regex to match SRT timestamp format 00:00:00,000 --> 00:00:00,000
            const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
            if (timeMatch) {
                const start = timeToSeconds(timeMatch[1]);
                const end = timeToSeconds(timeMatch[2]);
                const text = lines.slice(2).join(' ').trim();
                if (text) {
                    subtitles.push({ text, start, end });
                }
            }
        }
    }
    return subtitles;
};


const ShortsCreator: React.FC = () => {
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [srtFile, setSrtFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isRendering, setIsRendering] = useState<boolean>(false);
    const [renderProgress, setRenderProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [analysisResult, setAnalysisResult] = useState<ClipAnalysis | null>(null);
    const [progressMessage, setProgressMessage] = useState<string>('');
    const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
    const [activeSubtitle, setActiveSubtitle] = useState<Subtitle | null>(null);

    // Subtitle styling state
    const [useDynamicStyling, setUseDynamicStyling] = useState<boolean>(true);
    const [fontSize, setFontSize] = useState<number>(52);
    const [fontColor, setFontColor] = useState<string>('#FFFFFF');
    const [outlineColor, setOutlineColor] = useState<string>('#000000');
    const [outlineWidth, setOutlineWidth] = useState<number>(6);
    const [subtitlePosition, setSubtitlePosition] = useState<'bottom' | 'middle' | 'top'>('bottom');

    // Visual effects state
    const [useKenBurns, setUseKenBurns] = useState<boolean>(true);
    const [useSubtitleAnimation, setUseSubtitleAnimation] = useState<boolean>(true);
    const [useFadeTransition, setUseFadeTransition] = useState<boolean>(true);

    const videoRef = useRef<HTMLVideoElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        
        // Reset everything first
        setVideoFile(null);
        setVideoPreviewUrl(null);
        setAnalysisResult(null);
        setError(null);
        setActiveSubtitle(null);
        setSrtFile(null); // Also reset srt file if video changes

        if (file) {
            const videoUrl = URL.createObjectURL(file);
            const videoElement = document.createElement('video');
            videoElement.preload = 'metadata';

            videoElement.onloadedmetadata = () => {
                if (videoElement.duration < 30) {
                    setError('ویدیو برای ساخت کلیپ ۳۰ تا ۶۰ ثانیه‌ای بسیار کوتاه است. لطفاً ویدیویی با مدت زمان حداقل ۳۰ ثانیه انتخاب کنید.');
                    URL.revokeObjectURL(videoUrl); // Clean up the object URL
                } else {
                    setVideoFile(file);
                    setVideoPreviewUrl(videoUrl); // Use the URL we already created
                }
            };

            videoElement.onerror = () => {
                setError('خطا در بارگذاری فایل ویدیو. ممکن است فایل خراب یا فرمت آن پشتیبانی نشود.');
                URL.revokeObjectURL(videoUrl);
            };
            
            videoElement.src = videoUrl;
        }
    };

    const handleSrtFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.name.toLowerCase().endsWith('.srt')) {
            setSrtFile(file);
            setUseDynamicStyling(false); // Disable dynamic styling if SRT is provided
            setError(null);
        } else if (file) {
            setError('لطفاً یک فایل با فرمت .srt انتخاب کنید.');
            setSrtFile(null);
        } else {
            setSrtFile(null);
        }
    };
    
    const handleTimeUpdate = useCallback(() => {
        if (!videoRef.current || !analysisResult) {
            setActiveSubtitle(null);
            return;
        }
        const currentTime = videoRef.current.currentTime;
        
        // Loop the clip
        if (currentTime >= analysisResult.endTime || currentTime < analysisResult.startTime) {
            videoRef.current.currentTime = analysisResult.startTime;
        }

        const foundSubtitle = analysisResult.subtitles.find(
            sub => currentTime >= sub.start && currentTime <= sub.end
        );
        setActiveSubtitle(foundSubtitle || null);
    }, [analysisResult]);


    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!videoFile || isLoading) return;

        setIsLoading(true);
        setError(null);
        setAnalysisResult(null);
        
        try {
            let srtContent: string | null = null;
            if (srtFile) {
                setProgressMessage('در حال خواندن فایل زیرنویس...');
                srtContent = await srtFile.text();
            }

            setProgressMessage('در حال استخراج صدای ویدیو برای تولید زیرنویس...');
            // Extract audio for better subtitle generation
            const audioWavBase64 = await extractAudioFromVideo(videoFile);
            const audioData = audioWavBase64 ? { inlineData: { data: audioWavBase64, mimeType: 'audio/wav' } } : null;
            if (!audioData) {
                console.warn("Could not extract audio, subtitles might be missing.");
            }

            setProgressMessage('در حال استخراج فریم‌ها از ویدیو...');
            const frames = await extractVideoFrames(videoFile, FRAME_COUNT, (progress) => {
                setProgressMessage(`در حال استخراج فریم‌ها... ${Math.round(progress)}%`);
            });
            
            setProgressMessage('در حال تحلیل محتوا، شناسایی وایرال‌ترین لحظات و تولید زیرنویس...');

            const resultText = await analyzeVideoForClipping(frames, audioData, srtContent, useDynamicStyling && !srtContent);
            const partialResult = JSON.parse(resultText);
            
            let finalResult: ClipAnalysis;

            if (srtContent) {
                 if (typeof partialResult.startTime !== 'number' || typeof partialResult.endTime !== 'number') {
                    throw new Error("هوش مصنوعی ساختار داده نامعتبری را برای زمان‌بندی برگرداند.");
                }
                const subtitles = parseSrt(srtContent);
                finalResult = {
                    startTime: partialResult.startTime,
                    endTime: partialResult.endTime,
                    subtitles: subtitles
                };
            } else {
                if (typeof partialResult.startTime !== 'number' || typeof partialResult.endTime !== 'number' || !Array.isArray(partialResult.subtitles)) {
                    throw new Error("هوش مصنوعی ساختار داده نامعتبری را برگرداند.");
                }
                finalResult = partialResult as ClipAnalysis;
            }
            
            setAnalysisResult(finalResult);

            if (videoRef.current) {
                videoRef.current.currentTime = finalResult.startTime;
                videoRef.current.play().catch(error => {
                    console.warn("Autoplay was prevented by the browser:", error.message);
                });
            }

        } catch (err: any) {
            console.error("Error during Shorts Creator analysis:", err);
            if (err instanceof SyntaxError) {
                setError("پاسخ JSON دریافت شده از هوش مصنوعی نامعتبر بود. لطفاً دوباره تلاش کنید.");
            } else if (err.message?.includes("Rpc failed") || err.message?.includes("xhr error") || err.message?.includes("400")) {
                setError("خطا در ارسال به API: حجم ویدیو یا صدا بیش از حد مجاز است. سیستم به طور خودکار صدا را کوتاه می‌کند، اما اگر مشکل ادامه داشت، لطفاً از ویدیوی کوتاه‌تری استفاده کنید.");
            } else if (err.message?.includes("500") || err.message?.toLowerCase().includes("internal error")) {
                setError("یک خطای داخلی در سرور هوش مصنوعی رخ داد. لطفاً چند لحظه بعد دوباره تلاش کنید.");
            } else {
                setError(err.message || 'خطای ناشناخته‌ای در حین تحلیل ویدیو رخ داد.');
            }
        } finally {
            setIsLoading(false);
            setProgressMessage('');
        }
    }, [videoFile, srtFile, isLoading, useDynamicStyling]);
    
    const handleDownload = async () => {
        if (!videoFile || !analysisResult || isRendering) return;

        setIsRendering(true);
        setRenderProgress(0);
        setError(null);

        let mediaRecorder: MediaRecorder | null = null;
        let videoUrl: string | null = null;
        let audioCtx: AudioContext | null = null;
        let videoElement: HTMLVideoElement | null = null;
        let stream: MediaStream | null = null;
        let animationFrameId: number | null = null;
        let source: MediaElementAudioSourceNode | null = null;

        try {
            videoUrl = URL.createObjectURL(videoFile);
            // Create a detached video element for background rendering
            videoElement = document.createElement('video');
            videoElement.src = videoUrl;
            videoElement.crossOrigin = "anonymous";
            videoElement.muted = false; 
            videoElement.playsInline = true;
            
            // Prevent browser throttling by keeping element "visible" in the DOM
            // but transparent and non-interactive, rather than off-screen.
            videoElement.style.position = 'fixed';
            videoElement.style.left = '0';
            videoElement.style.top = '0';
            videoElement.style.width = `${RENDER_WIDTH}px`;
            videoElement.style.height = `${RENDER_HEIGHT}px`;
            videoElement.style.zIndex = '-9999';
            videoElement.style.opacity = '0.01'; // Tiny opacity to ensure rendering
            videoElement.style.pointerEvents = 'none';
            
            document.body.appendChild(videoElement);

            await new Promise<void>((resolve, reject) => {
                if (!videoElement) return reject("Failed to create video element");
                videoElement.onloadedmetadata = () => resolve();
                videoElement.onerror = () => reject(new Error("خطا در بارگذاری ویدیو"));
            });

            videoElement.currentTime = analysisResult.startTime;
            
            // Ensure seek is complete before starting
            await new Promise<void>((resolve) => {
                if (!videoElement) return resolve();
                const onSeeked = () => {
                    videoElement?.removeEventListener('seeked', onSeeked);
                    resolve();
                };
                videoElement.addEventListener('seeked', onSeeked);
                // Fallback
                if (videoElement.readyState >= 3) {
                    // wait a tick
                    setTimeout(resolve, 100);
                }
            });

            // Setup Audio Context
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioContextClass();
            
            // Important: Resume audio context if suspended (browsers often suspend until user interaction)
            if (audioCtx.state === 'suspended') {
                await audioCtx.resume();
            }

            const dest = audioCtx.createMediaStreamDestination();
            source = audioCtx.createMediaElementSource(videoElement);
            source.connect(dest);

            // Setup Canvas
            const canvas = document.createElement('canvas');
            canvas.width = RENDER_WIDTH;
            canvas.height = RENDER_HEIGHT;
            const ctx = canvas.getContext('2d', { alpha: false });
            if (!ctx) throw new Error("خطا در ایجاد Canvas");

            const canvasStream = canvas.captureStream(30); // 30 FPS
            const audioStream = dest.stream;
            
            stream = new MediaStream([
                ...canvasStream.getVideoTracks(),
                ...audioStream.getAudioTracks()
            ]);

            // Robust MimeType detection
            const mimeTypes = [
                'video/webm;codecs=vp9,opus',
                'video/webm;codecs=vp8,opus',
                'video/webm',
                'video/mp4'
            ];
            const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'video/webm';

            // Initialize MediaRecorder
            mediaRecorder = new MediaRecorder(stream, { 
                mimeType, 
                videoBitsPerSecond: 8000000 // 8 Mbps quality
            });
            
            const chunks: Blob[] = [];
            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) chunks.push(e.data);
            };

            const clipDuration = analysisResult.endTime - analysisResult.startTime;

            // Cleanup function
            const cleanup = () => {
                if (animationFrameId) cancelAnimationFrame(animationFrameId);
                if (videoElement) {
                    videoElement.pause();
                    videoElement.removeAttribute('src');
                    videoElement.load();
                    if (videoElement.parentNode) {
                        document.body.removeChild(videoElement);
                    }
                }
                if (source) source.disconnect();
                if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
                if (videoUrl) URL.revokeObjectURL(videoUrl);
                
                setIsRendering(false);
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: mimeType });
                
                if (blob.size === 0) {
                    setError("خطا در تولید فایل ویدیو: فایل خالی است.");
                    cleanup();
                    return;
                }

                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
                a.download = `shorts-clip-${Date.now()}.${ext}`;
                document.body.appendChild(a);
                a.click();
                
                // Delay cleanup slightly to allow download trigger
                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    cleanup();
                    setRenderProgress(100);
                }, 1000);
            };

            // Render Loop Function
            const render = () => {
                if (!videoElement || !ctx || !isRendering) return;
                
                const currentTime = videoElement.currentTime;
                const currentTimeInClip = currentTime - analysisResult.startTime;

                // Stop if we reached the end
                if (currentTimeInClip >= clipDuration || videoElement.ended) {
                    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                        mediaRecorder.stop();
                    }
                    return;
                }

                // --- DRAWING LOGIC ---
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Alpha for Fade
                const FADE_DURATION = 0.75;
                let frameAlpha = 1.0;
                if (useFadeTransition) {
                    if (currentTimeInClip < FADE_DURATION) {
                        frameAlpha = currentTimeInClip / FADE_DURATION;
                    } else if (currentTimeInClip > clipDuration - FADE_DURATION) {
                        frameAlpha = (clipDuration - currentTimeInClip) / FADE_DURATION;
                    }
                }
                ctx.globalAlpha = Math.max(0, Math.min(1, frameAlpha));

                // Ken Burns Effect
                const ZOOM_AMOUNT = 1.10;
                const scale = useKenBurns ? 1.0 + ((ZOOM_AMOUNT - 1.0) * (currentTimeInClip / clipDuration)) : 1.0;
                
                // Center Crop
                const videoAspect = videoElement.videoWidth / videoElement.videoHeight;
                const canvasAspect = canvas.width / canvas.height;
                let sWidth = videoElement.videoWidth;
                let sHeight = videoElement.videoHeight;
                let sx = 0;
                let sy = 0;
                
                if (videoAspect > canvasAspect) {
                    sWidth = videoElement.videoHeight * canvasAspect;
                    sx = (videoElement.videoWidth - sWidth) / 2;
                } else {
                    sHeight = videoElement.videoWidth / canvasAspect;
                    sy = (videoElement.videoHeight - sHeight) / 2;
                }

                const destWidth = canvas.width * scale;
                const destHeight = canvas.height * scale;
                const dx = (canvas.width - destWidth) / 2;
                const dy = (canvas.height - destHeight) / 2;
                
                ctx.drawImage(videoElement, sx, sy, sWidth, sHeight, dx, dy, destWidth, destHeight);

                // Reset Alpha
                ctx.globalAlpha = 1.0;

                // Draw Subtitles
                const currentSub = analysisResult.subtitles.find(sub => 
                    currentTime >= sub.start && currentTime <= sub.end
                );

                if (currentSub) {
                    ctx.save();
                    const currentFontSize = currentSub.fontSize || fontSize;
                    const currentPosition = currentSub.position || subtitlePosition;

                    const timeIntoSubtitle = currentTime - currentSub.start;
                    const ANIMATION_DURATION = 0.2;
                    let textScale = 1.0;
                    let textAlpha = 1.0;

                    if (useSubtitleAnimation && timeIntoSubtitle < ANIMATION_DURATION) {
                        const progress = timeIntoSubtitle / ANIMATION_DURATION;
                        textScale = 0.8 + 0.2 * progress;
                        textAlpha = progress;
                    }

                    ctx.globalAlpha = Math.max(0, Math.min(1, frameAlpha * textAlpha));

                    ctx.textAlign = 'center';
                    ctx.font = `bold ${currentFontSize}px Vazirmatn`;
                    ctx.fillStyle = fontColor;
                    ctx.strokeStyle = outlineColor;
                    ctx.lineWidth = outlineWidth;

                    let yPos = canvas.height - 100; // Default bottom
                    if (currentPosition === 'top') yPos = 120;
                    if (currentPosition === 'middle') yPos = canvas.height / 2;
                    
                    ctx.translate(canvas.width / 2, yPos);
                    ctx.scale(textScale, textScale);

                    if (outlineWidth > 0) {
                        ctx.strokeText(currentSub.text, 0, 0);
                    }
                    ctx.fillText(currentSub.text, 0, 0);
                    ctx.restore();
                }
                // --- END DRAWING LOGIC ---

                setRenderProgress(Math.min(99, (currentTimeInClip / clipDuration) * 100));

                if ('requestVideoFrameCallback' in videoElement) {
                    (videoElement as any).requestVideoFrameCallback(render);
                } else {
                    animationFrameId = requestAnimationFrame(render);
                }
            };

            // Initialize Canvas with Black
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Start recording
            mediaRecorder.start();
            
            // Delay play slightly to ensure recorder is ready
            setTimeout(async () => {
                if (videoElement) {
                    try {
                        await videoElement.play();
                        // Kick off loop
                        if ('requestVideoFrameCallback' in videoElement) {
                            (videoElement as any).requestVideoFrameCallback(render);
                        } else {
                            animationFrameId = requestAnimationFrame(render);
                        }
                    } catch(e) {
                        console.error("Play failed", e);
                        setError("خطا در پخش ویدیو برای ضبط.");
                        cleanup();
                    }
                }
            }, 100);

        } catch (err: any) {
            console.error("Download error:", err);
            setError("خطا در دانلود ویدیو: " + (err.message || "مشکل ناشناخته"));
            if (videoUrl) URL.revokeObjectURL(videoUrl);
            if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
            if (videoElement && videoElement.parentNode) {
                document.body.removeChild(videoElement);
            }
            setIsRendering(false);
        }
    };
    
    const getPreviewPositionStyles = () => {
        const currentPosition = (useDynamicStyling && activeSubtitle?.position) ? activeSubtitle.position : subtitlePosition;

        switch (currentPosition) {
            case 'top':
                return { top: `${(120 / RENDER_HEIGHT) * 100}%`, transform: 'translateY(0)' };
            case 'middle':
                return { top: '50%', transform: 'translateY(-50%)' };
            case 'bottom':
            default:
                 return { bottom: `${(100 / RENDER_HEIGHT) * 100}%`, top: 'auto', transform: 'translateY(0)' };
        }
    };
    
    const currentPreviewFontSize = (useDynamicStyling && activeSubtitle?.fontSize) ? activeSubtitle.fontSize : fontSize;

    const applyPreset = (preset: StylePreset) => {
        setFontSize(preset.fontSize);
        setFontColor(preset.fontColor);
        setOutlineColor(preset.outlineColor);
        setOutlineWidth(preset.outlineWidth);
        setSubtitlePosition(preset.position);
    };

    return (
        <div className="flex flex-col gap-6">
            <h2 className="text-2xl font-bold text-white text-center">سازنده Shorts با هوش مصنوعی</h2>
            <p className="text-center text-gray-400 -mt-4">
                فایل ویدیویی یوتیوب خود را آپلود کنید تا هوش مصنوعی بهترین کلیپ را پیدا کرده، آن را عمودی کند و زیرنویس اضافه کند.
            </p>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                {/* Left side: Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                     <div>
                        <label htmlFor="video-upload" className="block text-sm font-medium text-gray-300 mb-1">۱. فایل ویدیویی را آپلود کنید</label>
                         <p className="text-xs text-gray-500 mb-2">
                             نکته: برای ویدیوهای یوتیوب، لطفاً ابتدا ویدیو را دانلود کرده و فایل آن را اینجا بارگذاری کنید.
                         </p>
                        <input
                            type="file"
                            id="video-upload"
                            accept="video/*"
                            onChange={handleFileChange}
                            className="w-full text-sm text-gray-400 file:ml-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 cursor-pointer"
                            required
                        />
                    </div>

                    <div>
                        <label htmlFor="srt-upload" className="block text-sm font-medium text-gray-300 mb-1">۲. فایل زیرنویس (SRT) را آپلود کنید (اختیاری)</label>
                        <input
                            type="file"
                            id="srt-upload"
                            accept=".srt"
                            onChange={handleSrtFileChange}
                            className="w-full text-sm text-gray-400 file:ml-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gray-600 file:text-white hover:file:bg-gray-500 cursor-pointer"
                        />
                         <p className="text-xs text-gray-500 mt-1">
                            اگر فایلی ارائه نشود، هوش مصنوعی زیرنویس‌ها را به صورت خودکار از صدای ویدیو تولید می‌کند.
                        </p>
                    </div>

                    <div className="space-y-4 border-t border-gray-700 pt-4 mt-4">
                        <div className="flex items-center justify-between bg-gray-900/50 p-3 rounded-lg">
                            <label htmlFor="dynamic-styling" className="text-lg font-semibold text-gray-300">
                                استایل‌دهی پویای زیرنویس (با هوش مصنوعی)
                            </label>
                            <input
                                type="checkbox"
                                id="dynamic-styling"
                                checked={useDynamicStyling}
                                onChange={(e) => setUseDynamicStyling(e.target.checked)}
                                disabled={isRendering || !!srtFile}
                                className="w-6 h-6 text-indigo-600 bg-gray-700 border-gray-600 rounded focus:ring-indigo-500 focus:ring-2"
                            />
                        </div>
                         <div className={`space-y-4 transition-opacity duration-300 ${useDynamicStyling ? 'opacity-50' : 'opacity-100'}`}>
                            <h4 className="text-lg font-semibold text-gray-300">۳. استایل زیرنویس را تنظیم کنید</h4>
                            
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-300 mb-2">قالب‌های آماده</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {STYLE_PRESETS.map(preset => (
                                        <button
                                            key={preset.id}
                                            type="button"
                                            onClick={() => applyPreset(preset)}
                                            disabled={isRendering || useDynamicStyling}
                                            className="px-3 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg border border-gray-600 transition-colors text-right flex items-center justify-between group"
                                        >
                                            <span>{preset.name}</span>
                                            <div 
                                                className="w-4 h-4 rounded-full border border-gray-500" 
                                                style={{ backgroundColor: preset.fontColor, borderColor: preset.outlineColor === 'transparent' ? '#666' : preset.outlineColor }}
                                            ></div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label htmlFor="font-size" className="block text-sm font-medium text-gray-300 mb-1">
                                    اندازه فونت: {fontSize}px
                                </label>
                                <input
                                    type="range"
                                    id="font-size"
                                    min="24"
                                    max="80"
                                    value={fontSize}
                                    onChange={(e) => setFontSize(Number(e.target.value))}
                                    className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                    disabled={isRendering || useDynamicStyling}
                                />
                            </div>
                            <div>
                                <label htmlFor="font-color" className="block text-sm font-medium text-gray-300 mb-1">
                                    رنگ فونت
                                </label>
                                <input
                                    type="color"
                                    id="font-color"
                                    value={fontColor}
                                    onChange={(e) => setFontColor(e.target.value)}
                                    className="w-full h-10 p-1 bg-gray-700 border border-gray-600 rounded-lg cursor-pointer"
                                    disabled={isRendering || useDynamicStyling}
                                />
                            </div>
                            <div>
                                <label htmlFor="outline-color" className="block text-sm font-medium text-gray-300 mb-1">
                                    رنگ حاشیه
                                </label>
                                <input
                                    type="color"
                                    id="outline-color"
                                    value={outlineColor}
                                    onChange={(e) => setOutlineColor(e.target.value)}
                                    className="w-full h-10 p-1 bg-gray-700 border border-gray-600 rounded-lg cursor-pointer"
                                    disabled={isRendering || useDynamicStyling}
                                />
                            </div>
                            <div>
                                <label htmlFor="outline-width" className="block text-sm font-medium text-gray-300 mb-1">
                                    ضخامت حاشیه: {outlineWidth}px
                                </label>
                                <input
                                    type="range"
                                    id="outline-width"
                                    min="0"
                                    max="12"
                                    value={outlineWidth}
                                    onChange={(e) => setOutlineWidth(Number(e.target.value))}
                                    className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                    disabled={isRendering || useDynamicStyling}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">موقعیت</label>
                                <div className="flex justify-between gap-2">
                                    {(['پایین', 'وسط', 'بالا'] as const).map(label => {
                                        const value = label === 'پایین' ? 'bottom' : label === 'وسط' ? 'middle' : 'top';
                                        return (
                                            <button
                                                key={value}
                                                type="button"
                                                onClick={() => setSubtitlePosition(value)}
                                                disabled={isRendering || useDynamicStyling}
                                                className={`w-full py-2 text-sm font-medium rounded-md transition-colors duration-200 disabled:opacity-50 ${
                                                    subtitlePosition === value
                                                    ? 'bg-indigo-600 text-white'
                                                    : 'bg-gray-600 hover:bg-gray-500'
                                                }`}
                                            >
                                                {label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="space-y-4 border-t border-gray-700 pt-4 mt-4">
                        <h4 className="text-lg font-semibold text-gray-300">۴. جلوه‌های بصری</h4>
                        <div className="flex items-center justify-between bg-gray-900/50 p-3 rounded-lg">
                            <label htmlFor="ken-burns-effect" className="text-gray-300 cursor-pointer">
                                افکت زوم پویا (Ken Burns)
                            </label>
                            <input
                                type="checkbox"
                                id="ken-burns-effect"
                                checked={useKenBurns}
                                onChange={(e) => setUseKenBurns(e.target.checked)}
                                disabled={isRendering}
                                className="w-5 h-5 text-indigo-600 bg-gray-700 border-gray-600 rounded focus:ring-indigo-500 focus:ring-2 cursor-pointer"
                            />
                        </div>
                         <div className="flex items-center justify-between bg-gray-900/50 p-3 rounded-lg">
                            <label htmlFor="subtitle-animation" className="text-gray-300 cursor-pointer">
                                انیمیشن ظهور زیرنویس
                            </label>
                            <input
                                type="checkbox"
                                id="subtitle-animation"
                                checked={useSubtitleAnimation}
                                onChange={(e) => setUseSubtitleAnimation(e.target.checked)}
                                disabled={isRendering}
                                className="w-5 h-5 text-indigo-600 bg-gray-700 border-gray-600 rounded focus:ring-indigo-500 focus:ring-2 cursor-pointer"
                            />
                        </div>
                        <div className="flex items-center justify-between bg-gray-900/50 p-3 rounded-lg">
                            <label htmlFor="fade-transition" className="text-gray-300 cursor-pointer">
                                ترنزیشن محو شدن در ابتدا و انتها
                            </label>
                            <input
                                type="checkbox"
                                id="fade-transition"
                                checked={useFadeTransition}
                                onChange={(e) => setUseFadeTransition(e.target.checked)}
                                disabled={isRendering}
                                className="w-5 h-5 text-indigo-600 bg-gray-700 border-gray-600 rounded focus:ring-indigo-500 focus:ring-2 cursor-pointer"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading || !videoFile || isRendering}
                        className="w-full flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200 mt-4"
                    >
                        <Icon name="auto_awesome" /> {isLoading ? 'در حال تحلیل...' : '۵. تحلیل و ساخت Short'}
                    </button>

                    {error && <div className="bg-red-900/50 border border-red-700 text-red-300 p-4 rounded-lg">{error}</div>}
                    {isLoading && <Loader message={progressMessage} />}
                    {isRendering && (
                        <div className="space-y-2">
                             <p className="text-center font-medium">در حال رندر ویدیو... این فرآیند ممکن است کمی طول بکشد.</p>
                            <div className="w-full bg-gray-700 rounded-full h-2.5">
                                <div className="bg-indigo-600 h-2.5 rounded-full" style={{ width: `${renderProgress}%` }}></div>
                            </div>
                        </div>
                    )}
                </form>

                {/* Right side: Preview */}
                <div className="flex flex-col items-center">
                    <h3 className="text-lg font-semibold text-gray-300 mb-2">پیش‌نمایش</h3>
                    <div className="w-[300px] h-[533px] bg-black rounded-3xl p-3 border-4 border-gray-700 shadow-2xl relative overflow-hidden">
                        {videoPreviewUrl ? (
                             <video
                                ref={videoRef}
                                key={videoPreviewUrl} // Force re-render on new file
                                src={videoPreviewUrl}
                                muted
                                playsInline
                                onTimeUpdate={handleTimeUpdate}
                                onLoadedData={() => {
                                    if(analysisResult && videoRef.current){
                                        videoRef.current.currentTime = analysisResult.startTime;
                                        videoRef.current.play().catch(error => {
                                            console.warn("Autoplay after loading was prevented by the browser:", error.message);
                                        });
                                    }
                                }}
                                className="w-full h-full object-cover rounded-xl"
                            >
                            </video>
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-500 bg-gray-900 rounded-xl">
                                <Icon name="videocam" className="text-5xl" />
                            </div>
                        )}
                        
                        {videoPreviewUrl && !isRendering && (
                             <div 
                                className={`absolute left-0 right-0 px-4 text-center transition-all duration-300 pointer-events-none`}
                                style={getPreviewPositionStyles()}
                             >
                                <p
                                    key={activeSubtitle ? activeSubtitle.text + activeSubtitle.start : 'placeholder'}
                                    className={`font-bold ${useSubtitleAnimation && activeSubtitle ? 'animate-pop-in' : ''}`}
                                    style={{
                                        color: fontColor,
                                        fontSize: `${currentPreviewFontSize * PREVIEW_SCALE}px`,
                                        WebkitTextStroke: `${outlineWidth * PREVIEW_SCALE}px ${outlineColor}`,
                                        paintOrder: 'stroke fill',
                                        lineHeight: 1.2,
                                        transition: 'font-size 0.2s ease-out'
                                    }}
                                >
                                    {activeSubtitle ? activeSubtitle.text : (analysisResult ? "" : "سبک زیرنویس نمونه")}
                                </p>
                            </div>
                        )}
                    </div>
                     {analysisResult && (
                        <div className="mt-4 text-center animate-fade-in flex items-center justify-center gap-4">
                            <button onClick={() => videoRef.current?.play().catch(e => console.error("خطا در پخش ویدیو:", e))} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200 flex items-center gap-2">
                                <Icon name="play_arrow" /> پخش
                            </button>
                             <button onClick={handleDownload} disabled={isRendering} className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200 flex items-center gap-2">
                                <Icon name="download" /> {isRendering ? 'در حال رندر...' : 'دانلود Short'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ShortsCreator;
