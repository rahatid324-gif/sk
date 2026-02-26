import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { Mic, MicOff, Loader2, X, MessageSquareQuote } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface LiveVoiceAgentProps {
  lang: 'en' | 'bn';
  onClose: () => void;
}

export default function LiveVoiceAgent({ lang, onClose }: LiveVoiceAgentProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);
  const audioQueue = useRef<Int16Array[]>([]);
  const isPlaying = useRef(false);

  const systemInstruction = lang === 'en' 
    ? "You are a professional trading assistant. You can help users understand market trends, explain trading concepts, and provide general market insights. Keep your responses concise and professional. You are speaking to the user in real-time."
    : "আপনি একজন পেশাদার ট্রেডিং সহকারী। আপনি ব্যবহারকারীদের বাজারের প্রবণতা বুঝতে, ট্রেডিং ধারণাগুলি ব্যাখ্যা করতে এবং সাধারণ বাজার অন্তর্দৃষ্টি প্রদান করতে সহায়তা করতে পারেন। আপনার উত্তরগুলি সংক্ষিপ্ত এবং পেশাদার রাখুন। আপনি রিয়েল-টাইমে ব্যবহারকারীর সাথে কথা বলছেন।";

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
      
      const session = await ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setIsConnecting(false);
            startMic();
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle audio output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              const binary = atob(base64Audio);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
              }
              const pcm16 = new Int16Array(bytes.buffer);
              audioQueue.current.push(pcm16);
              if (!isPlaying.current) {
                playNextChunk();
              }
            }

            // Handle transcription
            if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
              // Model's text output (if any)
            }

            if (message.serverContent?.interrupted) {
              audioQueue.current = [];
              isPlaying.current = false;
            }
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            setError("Connection error. Please try again.");
            stopAll();
          },
          onclose: () => {
            setIsConnected(false);
            stopAll();
          },
        },
      });

      sessionRef.current = session;
    } catch (err: any) {
      console.error("Failed to connect to Live API:", err);
      if (err.message?.includes('429') || err.status === 'RESOURCE_EXHAUSTED') {
        setError(lang === 'en' 
          ? "AI Quota Exceeded. Please wait a few minutes." 
          : "এআই কোটা শেষ হয়ে গেছে। অনুগ্রহ করে কয়েক মিনিট অপেক্ষা করুন।");
      } else {
        setError("Failed to initialize voice agent.");
      }
      setIsConnecting(false);
    }
  }, [lang, systemInstruction]);

  const startMic = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError(lang === 'en' 
        ? "Your browser does not support microphone access." 
        : "আপনার ব্রাউজার মাইক্রোফোন অ্যাক্সেস সমর্থন করে না।");
      return;
    }

    try {
      // Check if any audio input devices exist first
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasMic = devices.some(device => device.kind === 'audioinput');
      
      if (!hasMic) {
        throw { name: 'NotFoundError' };
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });
      streamRef.current = stream;
      
      // Use default sample rate and let the processor handle it
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      // Use a standard buffer size
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      
      source.connect(processor);
      processor.connect(audioContext.destination);
      
      processor.onaudioprocess = (e) => {
        if (!sessionRef.current || !isConnected) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        // Resample to 16000 if needed, or just send as is if the API supports it
        // The Gemini Live API expects 16000Hz PCM16
        const targetSampleRate = 16000;
        const resampledData = resample(inputData, audioContext.sampleRate, targetSampleRate);
        
        const pcm16 = new Int16Array(resampledData.length);
        for (let i = 0; i < resampledData.length; i++) {
          pcm16[i] = Math.max(-1, Math.min(1, resampledData[i])) * 0x7FFF;
        }
        
        const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
        sessionRef.current.sendRealtimeInput({
          media: { data: base64, mimeType: `audio/pcm;rate=${targetSampleRate}` }
        });
      };
      
      setIsListening(true);
    } catch (err: any) {
      console.error("Mic access error:", err);
      let userMessage = lang === 'en' ? "Microphone access error." : "মাইক্রোফোন অ্যাক্সেস ত্রুটি।";
      
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError' || err.name === 'OverconstrainedError') {
        userMessage = lang === 'en' 
          ? "No microphone found or it's being used by another app. Please check your connection." 
          : "কোনো মাইক্রোফোন পাওয়া যায়নি বা এটি অন্য অ্যাপ ব্যবহার করছে। আপনার সংযোগ পরীক্ষা করুন।";
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        userMessage = lang === 'en'
          ? "Microphone permission denied. Please allow access in your browser settings."
          : "মাইক্রোফোন ব্যবহারের অনুমতি দেওয়া হয়নি। অনুগ্রহ করে ব্রাউজার সেটিংসে অনুমতি দিন।";
      }
      setError(userMessage);
      stopAll();
    }
  };

  // Simple linear interpolation resampling
  const resample = (data: Float32Array, fromRate: number, toRate: number) => {
    if (fromRate === toRate) return data;
    const ratio = fromRate / toRate;
    const newLength = Math.round(data.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const pos = i * ratio;
      const index = Math.floor(pos);
      const frac = pos - index;
      if (index + 1 < data.length) {
        result[i] = data[index] * (1 - frac) + data[index + 1] * frac;
      } else {
        result[i] = data[index];
      }
    }
    return result;
  };

  const playNextChunk = () => {
    if (audioQueue.current.length === 0 || !audioContextRef.current) {
      isPlaying.current = false;
      return;
    }

    isPlaying.current = true;
    const pcm16 = audioQueue.current.shift()!;
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 0x7FFF;
    }

    const buffer = audioContextRef.current.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);
    
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = playNextChunk;
    source.start();
  };

  const stopAll = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    if (sessionRef.current) {
      // sessionRef.current.close(); // Some SDK versions might not have close() directly
    }
    setIsConnected(false);
    setIsListening(false);
    setIsConnecting(false);
  };

  useEffect(() => {
    return () => stopAll();
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="trading-card p-6 flex flex-col items-center gap-6 relative"
    >
      <button 
        onClick={onClose}
        className="absolute top-4 right-4 p-2 hover:bg-white/5 rounded-lg transition-colors"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="text-center">
        <h3 className="text-lg font-bold mb-2">
          {lang === 'en' ? 'Live Voice Assistant' : 'লাইভ ভয়েস সহকারী'}
        </h3>
        <p className="text-sm text-white/40">
          {lang === 'en' ? 'Talk directly to our trading AI' : 'আমাদের ট্রেডিং এআই-এর সাথে সরাসরি কথা বলুন'}
        </p>
      </div>

      <div className="relative">
        <AnimatePresence>
          {isListening && (
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1.2, opacity: 0.3 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ repeat: Infinity, duration: 1.5, repeatType: 'reverse' }}
              className="absolute inset-0 bg-emerald-500 rounded-full blur-xl"
            />
          )}
        </AnimatePresence>
        
        <button 
          onClick={isConnected ? stopAll : connect}
          disabled={isConnecting}
          className={`w-24 h-24 rounded-full flex items-center justify-center transition-all relative z-10 ${
            isConnected ? 'bg-rose-500 shadow-lg shadow-rose-500/20' : 'bg-emerald-500 shadow-lg shadow-emerald-500/20'
          } ${isConnecting ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 active:scale-95'}`}
        >
          {isConnecting ? (
            <Loader2 className="w-10 h-10 text-black animate-spin" />
          ) : isConnected ? (
            <MicOff className="w-10 h-10 text-white" />
          ) : (
            <Mic className="w-10 h-10 text-black" />
          )}
        </button>
      </div>

      <div className="text-center min-h-[24px]">
        {error ? (
          <p className="text-rose-400 text-sm">{error}</p>
        ) : isConnecting ? (
          <p className="text-emerald-500 text-sm animate-pulse">
            {lang === 'en' ? 'Connecting...' : 'সংযোগ করা হচ্ছে...'}
          </p>
        ) : isConnected ? (
          <p className="text-emerald-500 text-sm font-medium">
            {lang === 'en' ? 'Listening... Speak now' : 'শুনছি... এখন কথা বলুন'}
          </p>
        ) : (
          <p className="text-white/40 text-sm">
            {lang === 'en' ? 'Click to start conversation' : 'কথোপকথন শুরু করতে ক্লিক করুন'}
          </p>
        )}
      </div>

      <div className="w-full bg-white/5 p-4 rounded-xl flex items-start gap-3">
        <MessageSquareQuote className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-1" />
        <p className="text-xs text-white/60 italic leading-relaxed">
          {lang === 'en' 
            ? "Try asking: 'What is a support level?' or 'Explain the current market trend.'"
            : "জিজ্ঞাসা করার চেষ্টা করুন: 'সাপোর্ট লেভেল কী?' বা 'বর্তমান বাজারের প্রবণতা ব্যাখ্যা করুন।'"}
        </p>
      </div>
    </motion.div>
  );
}
