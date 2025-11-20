import React, { useState, useCallback } from 'react';
import { analyzeVideo } from '../services/geminiService';
import { extractVideoFrames } from '../utils/fileUtils';
import { Loader } from './common/Loader';
import { Icon } from './common/Icon';

const FRAME_COUNT = 16; // Number of frames to extract

const VideoAnalyzer: React.FC = () => {
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [prompt, setPrompt] = useState<string>('توضیح دهید در این ویدیو چه اتفاقی می‌افتد. اشیاء و اقدامات کلیدی کدامند؟');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [analysisResult, setAnalysisResult] = useState<string | null>(null);
    const [progressMessage, setProgressMessage] = useState<string>('');
    const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setVideoFile(file);
            setVideoPreviewUrl(URL.createObjectURL(file));
            setAnalysisResult(null);
            setError(null);
        }
    };

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!videoFile || !prompt || isLoading) return;

        setIsLoading(true);
        setError(null);
        setAnalysisResult(null);
        setProgressMessage('در حال استخراج فریم‌ها از ویدیو...');

        try {
            const frames = await extractVideoFrames(videoFile, FRAME_COUNT, (progress) => {
                setProgressMessage(`در حال استخراج فریم‌ها... ${Math.round(progress)}%`);
            });
            setProgressMessage('در حال تحلیل ویدیو با Gemini...');

            const result = await analyzeVideo(prompt, frames);
            setAnalysisResult(result);
        } catch (err: any) {
            setError(err.message || 'خطای ناشناخته‌ای در حین تحلیل ویدیو رخ داد.');
        } finally {
            setIsLoading(false);
            setProgressMessage('');
        }
    }, [videoFile, prompt, isLoading]);

    return (
        <div className="flex flex-col gap-6">
            <h2 className="text-2xl font-bold text-white text-center">تحلیل ویدیو (Gemini Pro)</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="video-upload" className="block text-sm font-medium text-gray-300 mb-1">آپلود ویدیو</label>
                    <input
                        type="file"
                        id="video-upload"
                        accept="video/*"
                        onChange={handleFileChange}
                        className="w-full text-sm text-gray-400 file:ml-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 cursor-pointer"
                    />
                </div>
                {videoPreviewUrl && (
                    <div className="flex justify-center">
                        <video src={videoPreviewUrl} controls className="max-w-md w-full rounded-lg border border-gray-700"></video>
                    </div>
                )}
                <div>
                    <label htmlFor="prompt-analysis" className="block text-sm font-medium text-gray-300 mb-1">دستور تحلیل</label>
                    <textarea
                        id="prompt-analysis"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500 transition"
                        rows={3}
                        placeholder="مثال: این ویدیو را در سه مورد خلاصه کنید."
                        required
                    />
                </div>
                <button
                    type="submit"
                    disabled={isLoading || !videoFile || !prompt.trim()}
                    className="w-full flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200"
                >
                    <Icon name="video_library" /> {isLoading ? 'در حال تحلیل...' : 'تحلیل ویدیو'}
                </button>
            </form>

            {error && <div className="bg-red-900/50 border border-red-700 text-red-300 p-4 rounded-lg">{error}</div>}

            {isLoading && <Loader message={progressMessage} />}

            {analysisResult && (
                <div className="mt-4 animate-fade-in space-y-2">
                    <h3 className="text-xl font-semibold text-center">نتیجه تحلیل</h3>
                    <div className="bg-gray-900/70 p-4 rounded-lg border border-gray-700">
                        <pre className="whitespace-pre-wrap text-gray-300 font-sans">{analysisResult}</pre>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VideoAnalyzer;