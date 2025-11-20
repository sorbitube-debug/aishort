import React, { useState, useEffect, useCallback } from 'react';
import { generateVideo } from '../services/geminiService';
import { VideoAspectRatio } from '../types';
import { Loader } from './common/Loader';
import { Icon } from './common/Icon';

const loadingMessages = [
  "در حال آماده‌سازی صندلی کارگردان دیجیتال...",
  "فراخوانی بازیگران دیجیتال...",
  "تبدیل پیکسل‌ها به حرکت...",
  "این فرآیند ممکن است چند دقیقه طول بکشد، لطفاً صبر کنید...",
  "ترکیب صحنه‌های نهایی...",
  "افزودن کمی جادوی سینمایی...",
];

const VideoGenerator: React.FC = () => {
  const [prompt, setPrompt] = useState<string>('یک شیر باشکوه در حال غرش بر روی صخره هنگام طلوع آفتاب، سینمایی');
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>('16:9');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [apiKeySelected, setApiKeySelected] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>(loadingMessages[0]);

  useEffect(() => {
    const checkApiKey = async () => {
      try {
        if (await window.aistudio.hasSelectedApiKey()) {
          setApiKeySelected(true);
        }
      } catch (e) {
        console.error("aistudio is not available.");
      }
    };
    checkApiKey();
  }, []);

  useEffect(() => {
    // Fix: The return type of setInterval in the browser is `number`, not `NodeJS.Timeout`.
    // This refactor ensures the interval is properly cleared and avoids type errors.
    if (isLoading) {
      const interval = setInterval(() => {
        setLoadingMessage(prev => {
          const currentIndex = loadingMessages.indexOf(prev);
          return loadingMessages[(currentIndex + 1) % loadingMessages.length];
        });
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [isLoading]);

  const handleSelectKey = async () => {
    try {
      await window.aistudio.openSelectKey();
      setApiKeySelected(true); // Assume success to avoid race conditions
    } catch (e) {
      setError("باز کردن انتخاب کلید API ناموفق بود. لطفاً دوباره تلاش کنید.");
    }
  };

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt || isLoading || !apiKeySelected) return;

    setIsLoading(true);
    setError(null);
    setVideoUrl(null);
    setLoadingMessage(loadingMessages[0]);

    try {
      const url = await generateVideo(prompt, aspectRatio);
      setVideoUrl(url);
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("Requested entity was not found")) {
        setError("کلید API نامعتبر است. لطفاً یک کلید معتبر انتخاب کنید.");
        setApiKeySelected(false);
      } else {
        setError(err.message || 'خطای ناشناخته‌ای در حین ساخت ویدیو رخ داد.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [prompt, aspectRatio, isLoading, apiKeySelected]);

  if (!apiKeySelected) {
    return (
      <div className="text-center flex flex-col items-center justify-center h-full">
        <Icon name="key" className="text-5xl text-yellow-400 mb-4" />
        <h2 className="text-2xl font-bold mb-2">کلید API مورد نیاز است</h2>
        <p className="text-gray-400 mb-4 max-w-md">برای ساخت ویدیو با Veo، باید یک کلید API انتخاب کرده و صورتحساب پروژه خود را فعال کنید.</p>
        <button
          onClick={handleSelectKey}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200 flex items-center gap-2"
        >
          <Icon name="key" /> انتخاب کلید API
        </button>
         <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="mt-4 text-indigo-400 hover:underline">
            اطلاعات بیشتر درباره صورتحساب
        </a>
        {error && <p className="text-red-400 mt-4">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-bold text-white text-center">ساخت ویدیو (Veo)</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="prompt" className="block text-sm font-medium text-gray-300 mb-1">دستور</label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500 transition"
            rows={3}
            placeholder="مثال: یک شات سینمایی از یک شهر آینده‌نگر در شب"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">نسبت تصویر</label>
          <div className="flex gap-4">
            {(['16:9', '9:16'] as VideoAspectRatio[]).map(ratio => (
              <label key={ratio} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="aspectRatio"
                  value={ratio}
                  checked={aspectRatio === ratio}
                  onChange={(e) => setAspectRatio(e.target.value as VideoAspectRatio)}
                  className="form-radio h-4 w-4 text-indigo-600 bg-gray-700 border-gray-500 focus:ring-indigo-500"
                />
                <span className="text-gray-300">{ratio} ({ratio === '16:9' ? 'افقی' : 'عمودی'})</span>
              </label>
            ))}
          </div>
        </div>
        <button
          type="submit"
          disabled={isLoading || !prompt.trim()}
          className="w-full flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200"
        >
          <Icon name="movie" /> {isLoading ? 'در حال ساخت...' : 'ساخت ویدیو'}
        </button>
      </form>

      {error && <div className="bg-red-900/50 border border-red-700 text-red-300 p-4 rounded-lg">{error}</div>}

      {isLoading && <Loader message={loadingMessage} />}

      {videoUrl && (
        <div className="mt-4 animate-fade-in">
            <h3 className="text-xl font-semibold mb-2 text-center">ویدیوی ساخته شده</h3>
            <video src={videoUrl} controls className="w-full max-w-2xl mx-auto rounded-lg shadow-lg border border-gray-700">
                مرورگر شما از تگ ویدیو پشتیبانی نمی‌کند.
            </video>
            <div className="text-center mt-4">
                <a href={videoUrl} download="generated-video.mp4" className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200">
                    <Icon name="download" /> دانلود ویدیو
                </a>
            </div>
        </div>
      )}
    </div>
  );
};

export default VideoGenerator;