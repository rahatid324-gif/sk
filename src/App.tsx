import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  History, 
  Languages, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Volume2, 
  Trash2, 
  Clock, 
  Loader2,
  ChevronRight,
  X,
  Mic
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeChart, generateSpeech } from './services/geminiService';
import { TradingSignal, HistoryItem, Language } from './types';
import LiveVoiceAgent from './components/LiveVoiceAgent';

const TRANSLATIONS = {
  en: {
    title: "AI Trading Signal Bot",
    uploadTitle: "Upload Chart Screenshot",
    uploadDesc: "Drag and drop or click to upload your trading chart (Forex, Crypto, Stocks)",
    analyzing: "Analyzing Chart...",
    signalResult: "Signal Analysis Result",
    confidence: "Confidence",
    timeframe: "Timeframe",
    explanation: "Analysis",
    history: "Session History",
    noHistory: "No history yet. Start by uploading a chart!",
    buy: "BUY",
    sell: "SELL",
    hold: "HOLD",
    speak: "Play Voice Signal",
    delete: "Delete",
    close: "Close",
    langToggle: "বাংলা",
    error: "Failed to analyze chart. Please try again.",
    quotaExceeded: "AI Quota Exceeded. Please wait a few minutes or use your own API key in settings.",
    invalidFormat: "Invalid file format. Please upload a JPG or PNG image.",
    liveAgent: "Live Voice Assistant",
    riskWarning: "Risk Warning: Trading involves significant risk. AI signals are for analysis purposes only and do not guarantee profit. Use at your own risk."
  },
  bn: {
    title: "এআই ট্রেডিং সিগন্যাল বট",
    uploadTitle: "চার্ট স্ক্রিনশট আপলোড করুন",
    uploadDesc: "আপনার ট্রেডিং চার্ট (ফরেক্স, ক্রিপ্টো, স্টক) আপলোড করতে ড্র্যাগ করুন বা ক্লিক করুন",
    analyzing: "চার্ট বিশ্লেষণ করা হচ্ছে...",
    signalResult: "সিগন্যাল বিশ্লেষণের ফলাফল",
    confidence: "কনফিডেন্স",
    timeframe: "টাইমফ্রেম",
    explanation: "বিশ্লেষণ",
    history: "সেশন হিস্ট্রি",
    noHistory: "এখনো কোনো হিস্ট্রি নেই। একটি চার্ট আপলোড করে শুরু করুন!",
    buy: "BUY (ক্রয়)",
    sell: "SELL (বিক্রয়)",
    hold: "HOLD (অপেক্ষা)",
    speak: "ভয়েস সিগন্যাল শুনুন",
    delete: "মুছে ফেলুন",
    close: "বন্ধ করুন",
    langToggle: "English",
    error: "চার্ট বিশ্লেষণ করতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।",
    quotaExceeded: "এআই কোটা শেষ হয়ে গেছে। অনুগ্রহ করে কয়েক মিনিট অপেক্ষা করুন অথবা আপনার নিজস্ব এপিআই কী ব্যবহার করুন।",
    invalidFormat: "অসমর্থিত ফাইল ফরম্যাট। অনুগ্রহ করে একটি JPG বা PNG ছবি আপলোড করুন।",
    liveAgent: "লাইভ ভয়েস সহকারী",
    riskWarning: "ঝুঁকি সতর্কবার্তা: ট্রেডিংয়ে উল্লেখযোগ্য ঝুঁকি রয়েছে। এআই সিগন্যাল শুধুমাত্র বিশ্লেষণের উদ্দেশ্যে এবং লাভের নিশ্চয়তা দেয় না। নিজ দায়িত্বে ব্যবহার করুন।"
  }
};

export default function App() {
  const [lang, setLang] = useState<Language>('en');
  const [image, setImage] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [signal, setSignal] = useState<TradingSignal | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showLiveAgent, setShowLiveAgent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const t = TRANSLATIONS[lang];

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      setHistory(data);
    } catch (err) {
      console.error("Failed to fetch history", err);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validation
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
      if (!validTypes.includes(file.type)) {
        setError(t.invalidFormat);
        setImage(null);
        setSignal(null);
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        processImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const processImage = async (base64: string) => {
    setAnalyzing(true);
    setError(null);
    setSignal(null);
    try {
      const result = await analyzeChart(base64, lang);
      setSignal(result);
      
      // Save to history
      await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_data: base64,
          signal_type: result.type,
          confidence: result.confidence,
          timeframe: result.timeframe,
          explanation: result.explanation,
          language: lang
        })
      });
      
      fetchHistory();
      
      // Auto-speak
      speakSignal(result);
    } catch (err: any) {
      if (err.message?.includes('429') || err.status === 'RESOURCE_EXHAUSTED') {
        setError(t.quotaExceeded);
      } else {
        setError(t.error);
      }
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  };

  const speakSignal = async (sig: TradingSignal) => {
    const text = lang === 'en' 
      ? `${sig.type} signal detected. Confidence ${sig.confidence} percent. Timeframe ${sig.timeframe}.`
      : `${sig.type} সিগন্যাল শনাক্ত করা হয়েছে। কনফিডেন্স ${sig.confidence} শতাংশ। টাইমফ্রেম ${sig.timeframe}।`;

    try {
      const audioUrl = await generateSpeech(text, lang);
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.play();
      }
    } catch (err) {
      console.warn("Gemini TTS failed, falling back to browser speech synthesis", err);
      // Fallback to browser's built-in speech synthesis
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang === 'en' ? 'en-US' : 'bn-BD';
        window.speechSynthesis.speak(utterance);
      } else {
        console.error("Speech synthesis not supported in this browser.");
      }
    }
  };

  const deleteHistory = async (id: number) => {
    try {
      await fetch(`/api/history/${id}`, { method: 'DELETE' });
      fetchHistory();
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  const getSignalColor = (type: string) => {
    switch (type) {
      case 'BUY': return 'text-emerald-400';
      case 'SELL': return 'text-rose-400';
      default: return 'text-amber-400';
    }
  };

  const getSignalIcon = (type: string) => {
    switch (type) {
      case 'BUY': return <TrendingUp className="w-8 h-8 text-emerald-400" />;
      case 'SELL': return <TrendingDown className="w-8 h-8 text-rose-400" />;
      default: return <Minus className="w-8 h-8 text-amber-400" />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col max-w-2xl mx-auto p-4 md:p-6">
      <audio ref={audioRef} className="hidden" />
      
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <TrendingUp className="text-black w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">{t.title}</h1>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowLiveAgent(true)}
            className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg hover:bg-emerald-500/20 transition-colors flex items-center gap-2 text-sm font-medium"
            title={t.liveAgent}
          >
            <Mic className="w-4 h-4" />
            <span className="hidden sm:inline">{t.liveAgent}</span>
          </button>
          <button 
            onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
            className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors flex items-center gap-2 text-sm font-medium"
          >
            <Languages className="w-4 h-4" />
            {t.langToggle}
          </button>
          <button 
            onClick={() => setShowHistory(true)}
            className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <History className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 space-y-6">
        {/* Live Voice Agent Overlay */}
        <AnimatePresence>
          {showLiveAgent && (
            <LiveVoiceAgent lang={lang} onClose={() => setShowLiveAgent(false)} />
          )}
        </AnimatePresence>

        {/* Upload Section */}
        <section 
          className="trading-card p-8 border-dashed border-2 border-white/10 hover:border-emerald-500/50 transition-colors cursor-pointer group"
          onClick={() => fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept="image/*" 
            className="hidden" 
          />
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center group-hover:bg-emerald-500/10 transition-colors">
              <Upload className="w-8 h-8 text-white/40 group-hover:text-emerald-500 transition-colors" />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-1">{t.uploadTitle}</h3>
              <p className="text-sm text-white/40">{t.uploadDesc}</p>
            </div>
          </div>
        </section>

        {/* Analyzing State */}
        <AnimatePresence>
          {analyzing && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="trading-card p-12 flex flex-col items-center justify-center gap-4"
            >
              <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
              <p className="text-emerald-500 font-medium animate-pulse">{t.analyzing}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error State */}
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl text-rose-400 text-sm flex items-center gap-3">
            <X className="w-5 h-5" />
            {error}
          </div>
        )}

        {/* Signal Result */}
        <AnimatePresence>
          {signal && !analyzing && (
            <motion.section 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4"
            >
              <div className="trading-card p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-sm font-semibold uppercase tracking-widest text-white/40">{t.signalResult}</h2>
                  <button 
                    onClick={() => speakSignal(signal)}
                    className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 transition-colors text-sm font-medium"
                  >
                    <Volume2 className="w-4 h-4" />
                    {t.speak}
                  </button>
                </div>

                <div className="flex items-center gap-6 mb-8">
                  <div className="w-20 h-20 bg-white/5 rounded-2xl flex items-center justify-center">
                    {getSignalIcon(signal.type)}
                  </div>
                  <div>
                    <div className={`text-4xl font-black tracking-tighter ${getSignalColor(signal.type)}`}>
                      {signal.type === 'BUY' ? t.buy : signal.type === 'SELL' ? t.sell : t.hold}
                    </div>
                    <div className="flex items-center gap-4 mt-1">
                      <div className="flex items-center gap-1.5 text-sm text-white/60">
                        <Clock className="w-4 h-4" />
                        {t.timeframe}: <span className="text-white font-mono">{signal.timeframe}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-white/5 p-4 rounded-xl">
                    <div className="text-xs text-white/40 uppercase mb-1">{t.confidence}</div>
                    <div className="text-2xl font-bold font-mono">{signal.confidence}%</div>
                    <div className="w-full h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${signal.confidence}%` }}
                        className={`h-full ${getSignalColor(signal.type).replace('text', 'bg')}`}
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-white/5 p-4 rounded-xl">
                  <div className="text-xs text-white/40 uppercase mb-2">{t.explanation}</div>
                  <p className="text-sm leading-relaxed text-white/80">{signal.explanation}</p>
                </div>
              </div>

              {image && (
                <div className="trading-card p-2">
                  <img src={image} alt="Analyzed Chart" className="w-full rounded-xl" />
                </div>
              )}

              <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl text-amber-200/70 text-[10px] leading-relaxed text-center">
                {t.riskWarning}
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {/* History Sidebar/Overlay */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.aside 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-[#0f0f0f] border-l border-white/10 z-50 flex flex-col"
            >
              <div className="p-6 border-bottom border-white/10 flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-3">
                  <History className="w-5 h-5 text-emerald-500" />
                  {t.history}
                </h2>
                <button 
                  onClick={() => setShowHistory(false)}
                  className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {history.length === 0 ? (
                  <div className="text-center py-20 text-white/20">
                    <History className="w-12 h-12 mx-auto mb-4 opacity-10" />
                    <p>{t.noHistory}</p>
                  </div>
                ) : (
                  history.map((item) => (
                    <div key={item.id} className="trading-card p-4 group">
                      <div className="flex gap-4">
                        <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 border border-white/5">
                          <img src={item.image_data} alt="History" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-sm font-bold ${getSignalColor(item.signal_type)}`}>
                              {item.signal_type}
                            </span>
                            <button 
                              onClick={() => deleteHistory(item.id)}
                              className="p-1 text-white/20 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="text-xs text-white/40 mb-2">
                            {new Date(item.created_at).toLocaleString()}
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="bg-white/5 px-2 py-0.5 rounded text-white/60">
                              {item.confidence}%
                            </span>
                            <span className="bg-white/5 px-2 py-0.5 rounded text-white/60">
                              {item.timeframe}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="py-8 text-center text-xs text-white/20">
        <p>© {new Date().getFullYear()} AI Trading Signal Bot • Professional Analysis</p>
      </footer>
    </div>
  );
}
