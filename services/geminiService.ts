import { GoogleGenAI, GenerateContentResponse, Type, Modality } from "@google/genai";
import { ImageAspectRatio, VideoAspectRatio } from '../types';

const getAiClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// VIDEO GENERATION (VEO)
export const generateVideo = async (prompt: string, aspectRatio: VideoAspectRatio) => {
    const ai = getAiClient();
    let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt,
        config: {
            numberOfVideos: 1,
            resolution: '720p',
            aspectRatio: aspectRatio
        }
    });

    while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) {
        throw new Error("Video generation failed or returned no URI.");
    }
    
    const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    if (!response.ok) {
        throw new Error(`Failed to download video: ${response.statusText}`);
    }
    const videoBlob = await response.blob();
    return URL.createObjectURL(videoBlob);
};

// IMAGE GENERATION (IMAGEN)
export const generateImage = async (prompt: string, aspectRatio: ImageAspectRatio): Promise<string> => {
    const ai = getAiClient();
    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: prompt,
        config: {
            numberOfImages: 1,
            outputMimeType: 'image/jpeg',
            aspectRatio: aspectRatio,
        },
    });

    const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
    return `data:image/jpeg;base64,${base64ImageBytes}`;
};

// VIDEO ANALYSIS
export const analyzeVideo = async (prompt: string, videoFrames: { inlineData: { data: string, mimeType: string } }[]): Promise<string> => {
    const ai = getAiClient();
    
    const textPart = { text: prompt };
    const parts = [textPart, ...videoFrames];

    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ parts: parts }],
    });

    return response.text;
};

// SHORTS CREATOR ANALYSIS
export const analyzeVideoForClipping = async (
    videoFrames: { inlineData: { data: string, mimeType: string } }[],
    audioData: { inlineData: { data: string, mimeType: string } } | null,
    srtContent: string | null,
    useDynamicStyling: boolean
): Promise<string> => {
    const ai = getAiClient();

    let prompt: string;
    let schema: object;

    const subtitleProperties: any = {
        text: { type: Type.STRING, description: 'متن زیرنویس.' },
        start: { type: Type.NUMBER, description: 'زمان شروع زیرنویس به ثانیه.' },
        end: { type: Type.NUMBER, description: 'زمان پایان زیرنویس به ثانیه.' },
    };
    
    const requiredSubtitleProperties = ['text', 'start', 'end'];

    if (useDynamicStyling) {
        subtitleProperties.fontSize = { type: Type.NUMBER, description: 'اندازه فونت پیشنهادی برای تاکید (مثلاً بین ۴۸ تا ۶۴).' };
        subtitleProperties.position = { type: Type.STRING, description: "موقعیت پیشنهادی ('top', 'middle', 'bottom') برای جلوگیری از پوشاندن عناصر مهم." };
    }


    if (srtContent) {
        prompt = `این ویدیو را به همراه زیرنویس‌های ارائه شده تحلیل کرده و جذاب‌ترین و وایرال‌ترین بخش آن را که بین ۳۰ تا ۶۰ ثانیه است، شناسایی کنید.
زیرنویس‌ها به شرح زیر است:
---
${srtContent}
---
زمان شروع و پایان کلیپ را بر اساس محتوای زیرنویس و جذابیت بصری/صوتی ویدیو انتخاب کنید.`;
        schema = {
            type: Type.OBJECT,
            properties: {
                startTime: { type: Type.NUMBER, description: 'زمان شروع کلیپ به ثانیه.' },
                endTime: { type: Type.NUMBER, description: 'زمان پایان کلیپ به ثانیه.' },
            },
            required: ['startTime', 'endTime']
        };
    } else {
        if (useDynamicStyling) {
             prompt = `این ویدیو (تصویر و صدا) را تحلیل کرده و جذاب‌ترین بخش آن (بین ۳۰ تا ۶۰ ثانیه) را برای یک Short انتخاب کنید. گفتار را با دقت رونویسی کرده و به صورت زیرنویس فارسی با زمان‌بندی دقیق ارائه دهید. برای هر زیرنویس، یک استایل پویا پیشنهاد دهید:
- \`fontSize\`: برای تاکید بر کلمات هیجان‌انگیز یا مهم، اندازه فونت را بزرگتر کنید.
- \`position\`: موقعیت ('top', 'middle', 'bottom') را برای جلوگیری از پوشاندن چهره‌ها یا عناصر کلیدی در ویدیو تغییر دهید.`;
        } else {
            prompt = `این ویدیو (تصویر و صدا) را تحلیل کرده و جذاب‌ترین و وایرال‌ترین بخش آن را که بین ۳۰ تا ۶۰ ثانیه است، شناسایی کنید. همزمان، گفتار ویدیو را رونویسی کرده و به صورت زیرنویس فارسی با زمان‌بندی دقیق ارائه دهید.`;
        }
        
        schema = {
            type: Type.OBJECT,
            properties: {
                startTime: { type: Type.NUMBER, description: 'زمان شروع کلیپ به ثانیه.' },
                endTime: { type: Type.NUMBER, description: 'زمان پایان کلیپ به ثانیه.' },
                subtitles: {
                    type: Type.ARRAY,
                    description: 'آرایه‌ای از اشیاء زیرنویس برای کلیپ شناسایی شده.',
                    items: {
                        type: Type.OBJECT,
                        properties: subtitleProperties,
                        required: requiredSubtitleProperties
                    }
                }
            },
            required: ['startTime', 'endTime', 'subtitles']
        };
    }

    const textPart = { text: prompt };
    const parts: any[] = [textPart, ...videoFrames];
    if (audioData) {
        parts.push(audioData);
    }

    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ parts: parts }],
        config: {
            responseMimeType: "application/json",
            responseSchema: schema,
        },
    });

    return response.text;
};


// TEXT-TO-SPEECH
export const generateSpeech = async (text: string): Promise<string> => {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: text }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Kore' },
                },
            },
        },
    });
    
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
        throw new Error("Failed to generate audio data.");
    }
    return base64Audio;
};