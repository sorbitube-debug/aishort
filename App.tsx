import React, { useState, useMemo } from 'react';
import { Tab } from './types';
import VideoGenerator from './components/VideoGenerator';
import ImageGenerator from './components/ImageGenerator';
import VideoAnalyzer from './components/VideoAnalyzer';
import TextToSpeech from './components/TextToSpeech';
import ShortsCreator from './components/ShortsCreator';
import { Icon } from './components/common/Icon';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.SHORTS_CREATOR);

  const tabs = useMemo(() => [
    { id: Tab.SHORTS_CREATOR, label: 'سازنده Shorts', icon: 'smart_display' },
    { id: Tab.VIDEO_GEN, label: 'ساخت ویدیو', icon: 'movie' },
    { id: Tab.IMAGE_GEN, label: 'ساخت تصویر', icon: 'image' },
    { id: Tab.VIDEO_ANALYSIS, label: 'تحلیل ویدیو', icon: 'video_library' },
    { id: Tab.TTS, label: 'متن به گفتار', icon: 'record_voice_over' },
  ], []);

  const renderContent = () => {
    switch (activeTab) {
      case Tab.SHORTS_CREATOR:
        return <ShortsCreator />;
      case Tab.VIDEO_GEN:
        return <VideoGenerator />;
      case Tab.IMAGE_GEN:
        return <ImageGenerator />;
      case Tab.VIDEO_ANALYSIS:
        return <VideoAnalyzer />;
      case Tab.TTS:
        return <TextToSpeech />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 font-sans">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
            مجموعه رسانه هوش مصنوعی
          </h1>
          <p className="text-indigo-400 mt-2 text-lg">قدرت گرفته از Gemini</p>
        </header>

        <nav className="mb-8 flex justify-center">
          <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-lg p-2 flex flex-wrap justify-center gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 text-sm md:text-base font-medium rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500 ${
                  activeTab === tab.id
                    ? 'bg-indigo-600 text-white shadow-lg'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              >
                <Icon name={tab.icon} />
                {tab.label}
              </button>
            ))}
          </div>
        </nav>

        <main>
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl shadow-2xl p-6 md:p-8 min-h-[60vh]">
            {renderContent()}
          </div>
        </main>
        <footer className="text-center mt-8 text-gray-500 text-sm">
            <p>&copy; {new Date().getFullYear()} مجموعه رسانه هوش مصنوعی. تمام حقوق محفوظ است.</p>
        </footer>
      </div>
    </div>
  );
};

export default App;