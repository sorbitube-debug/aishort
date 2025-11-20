import React, { useState, useCallback } from 'react';
import { generateImage } from '../services/geminiService';
import { ImageAspectRatio } from '../types';
import { Loader } from './common/Loader';
import { Icon } from './common/Icon';

const aspectRatios: { value: ImageAspectRatio, label: string }[] = [
    { value: '1:1', label: 'مربع' },
    { value: '16:9', label: 'افقی' },
    { value: '9:16', label: 'عمودی' },
    { value: '4:3', label: 'استاندارد' },
    { value: '3:4', label: 'بلند' },
];

const ImageGenerator: React.FC = () => {
    const [prompt, setPrompt] = useState<string>('یک تصویر واقعی از گربه‌ای که کلاه جادوگری کوچکی بر سر دارد');
    const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>('1:1');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!prompt || isLoading) return;

        setIsLoading(true);
        setError(null);
        setImageUrl(null);

        try {
            const url = await generateImage(prompt, aspectRatio);
            setImageUrl(url);
        } catch (err: any) {
            setError(err.message || 'خطای ناشناخته‌ای در حین ساخت تصویر رخ داد.');
        } finally {
            setIsLoading(false);
        }
    }, [prompt, aspectRatio, isLoading]);

    return (
        <div className="flex flex-col gap-6">
            <h2 className="text-2xl font-bold text-white text-center">ساخت تصویر (Imagen)</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="prompt-image" className="block text-sm font-medium text-gray-300 mb-1">دستور</label>
                    <textarea
                        id="prompt-image"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500 transition"
                        rows={3}
                        placeholder="مثال: یک نقاشی رنگ روغن زنده از یک مزرعه آفتابگردان"
                        required
                    />
                </div>
                <div>
                    <label htmlFor="aspect-ratio" className="block text-sm font-medium text-gray-300 mb-1">نسبت تصویر</label>
                    <select
                        id="aspect-ratio"
                        value={aspectRatio}
                        onChange={(e) => setAspectRatio(e.target.value as ImageAspectRatio)}
                        className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500 transition"
                    >
                        {aspectRatios.map(ratio => (
                            <option key={ratio.value} value={ratio.value}>{ratio.value} ({ratio.label})</option>
                        ))}
                    </select>
                </div>
                <button
                    type="submit"
                    disabled={isLoading || !prompt.trim()}
                    className="w-full flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200"
                >
                    <Icon name="image" /> {isLoading ? 'در حال ساخت...' : 'ساخت تصویر'}
                </button>
            </form>

            {error && <div className="bg-red-900/50 border border-red-700 text-red-300 p-4 rounded-lg">{error}</div>}

            {isLoading && <Loader message="در حال خلق شاهکار بصری شما..." />}

            {imageUrl && (
                <div className="mt-4 animate-fade-in">
                    <h3 className="text-xl font-semibold mb-2 text-center">تصویر ساخته شده</h3>
                    <div className="flex justify-center">
                        <img src={imageUrl} alt={prompt} className="max-w-full h-auto rounded-lg shadow-lg border border-gray-700" />
                    </div>
                </div>
            )}
        </div>
    );
};

export default ImageGenerator;