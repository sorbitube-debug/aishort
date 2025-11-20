import React, { useState, useCallback, useRef, useEffect } from 'react';
import { generateSpeech } from '../services/geminiService';
import { decode, decodeAudioData } from '../utils/fileUtils';
import { Loader } from './common/Loader';
import { Icon } from './common/Icon';

const TextToSpeech: React.FC = () => {
    const [text, setText] = useState<string>('سلام! من یک صدای هوش مصنوعی هستم که توسط Gemini قدرت گرفته‌ام. می‌توانم این متن را برای شما بخوانم.');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    
    const audioContextRef = useRef<AudioContext | null>(null);
    const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

    useEffect(() => {
        // Initialize AudioContext on first user interaction (or component mount)
        if (!audioContextRef.current) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                audioContextRef.current = new AudioContext({ sampleRate: 24000 });
            } else {
                setError("Web Audio API در این مرورگر پشتیبانی نمی‌شود.");
            }
        }
        
        // Cleanup on unmount
        return () => {
          sourceNodeRef.current?.stop();
          audioContextRef.current?.close();
        }
    }, []);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!text || isLoading) return;

        setIsLoading(true);
        setError(null);
        setAudioBuffer(null);
        if (sourceNodeRef.current) {
            sourceNodeRef.current.stop();
        }

        try {
            const base64Audio = await generateSpeech(text);
            const audioBytes = decode(base64Audio);
            if (audioContextRef.current) {
                const buffer = await decodeAudioData(audioBytes, audioContextRef.current, 24000, 1);
                setAudioBuffer(buffer);
            }
        } catch (err: any) {
            setError(err.message || 'خطای ناشناخته‌ای در حین ساخت گفتار رخ داد.');
        } finally {
            setIsLoading(false);
        }
    }, [text, isLoading]);

    const handlePlayPause = () => {
        if (!audioBuffer || !audioContextRef.current) return;
        
        if (isPlaying) {
            sourceNodeRef.current?.stop();
            setIsPlaying(false);
        } else {
            // Ensure context is running
            if (audioContextRef.current.state === 'suspended') {
                audioContextRef.current.resume();
            }
            
            const source = audioContextRef.current.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContextRef.current.destination);
            source.start();
            source.onended = () => {
                setIsPlaying(false);
            };
            sourceNodeRef.current = source;
            setIsPlaying(true);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <h2 className="text-2xl font-bold text-white text-center">متن به گفتار</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="tts-text" className="block text-sm font-medium text-gray-300 mb-1">متن</label>
                    <textarea
                        id="tts-text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500 transition"
                        rows={5}
                        placeholder="متن را برای تبدیل به گفتار وارد کنید..."
                        required
                    />
                </div>
                <button
                    type="submit"
                    disabled={isLoading || !text.trim()}
                    className="w-full flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200"
                >
                    <Icon name="record_voice_over" /> {isLoading ? 'در حال ساخت...' : 'ساخت گفتار'}
                </button>
            </form>
            
            {error && <div className="bg-red-900/50 border border-red-700 text-red-300 p-4 rounded-lg">{error}</div>}

            {isLoading && <Loader message="در حال ساخت صدایی بی‌نقص..." />}

            {audioBuffer && (
                <div className="mt-4 animate-fade-in text-center">
                    <button 
                        onClick={handlePlayPause}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-colors duration-200 flex items-center gap-2 mx-auto"
                    >
                        <Icon name={isPlaying ? 'pause' : 'play_arrow'} />
                        {isPlaying ? 'توقف' : 'پخش صدا'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default TextToSpeech;