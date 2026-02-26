import { GoogleGenAI, Type, Modality } from "@google/genai";
import { TradingSignal, Language } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    if (retries > 0 && (err.message?.includes('429') || err.status === 'RESOURCE_EXHAUSTED')) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw err;
  }
}

export async function analyzeChart(imageBase64: string, lang: Language): Promise<TradingSignal> {
  const model = "gemini-3-flash-preview";
  
  const prompt = lang === 'en' 
    ? "Act as a professional high-frequency trading analyst. Analyze this chart with 100% focus on high-probability setups. Identify the primary trend, key support/resistance levels, and candlestick patterns. Provide a signal (BUY, SELL, or HOLD) ONLY if there is strong confirmation. If the market is sideways or uncertain, suggest HOLD. Include a confidence level (0-100), a specific timeframe (1m-5m), and a technical justification."
    : "একজন পেশাদার হাই-ফ্রিকোয়েন্সি ট্রেডিং অ্যানালিস্ট হিসেবে কাজ করুন। উচ্চ-সম্ভাবনার সেটআপগুলোর ওপর ১০০% ফোকাস করে এই চার্টটি বিশ্লেষণ করুন। প্রাথমিক ট্রেন্ড, মূল সাপোর্ট/রেজিস্ট্যান্স লেভেল এবং ক্যান্ডেলস্টিক প্যাটার্ন শনাক্ত করুন। শুধুমাত্র শক্তিশালী কনফার্মেশন থাকলেই সিগন্যাল (BUY, SELL, বা HOLD) প্রদান করুন। যদি মার্কেট সাইডওয়ে বা অনিশ্চিত থাকে, তবে HOLD সাজেস্ট করুন। একটি কনফিডেন্স লেভেল (০-১০০), একটি নির্দিষ্ট টাইমফ্রেম (১মি-৫মি) এবং একটি টেকনিক্যাল যুক্তি অন্তর্ভুক্ত করুন।";

  const response = await withRetry(() => ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: imageBase64.split(',')[1] || imageBase64
            }
          }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, description: "BUY, SELL, or HOLD" },
          confidence: { type: Type.NUMBER, description: "Confidence level from 0 to 100" },
          timeframe: { type: Type.STRING, description: "Recommended timeframe" },
          explanation: { type: Type.STRING, description: "Short explanation of the signal" }
        },
        required: ["type", "confidence", "timeframe", "explanation"]
      }
    }
  }));

  return JSON.parse(response.text) as TradingSignal;
}

export async function generateSpeech(text: string, lang: Language): Promise<string> {
  const model = "gemini-2.5-flash-preview-tts";
  
  const voiceName = lang === 'en' ? 'Zephyr' : 'Kore'; // Using available voices
  
  const response = await withRetry(() => ai.models.generateContent({
    model,
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
  }));

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("Failed to generate audio");
  
  return addWavHeader(base64Audio);
}

function addWavHeader(pcmBase64: string, sampleRate: number = 24000): string {
  const pcmData = Uint8Array.from(atob(pcmBase64), c => c.charCodeAt(0));
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = pcmData.length;
  
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  
  // RIFF identifier
  view.setUint32(0, 0x52494646, false); // "RIFF"
  // file length
  view.setUint32(4, 36 + dataSize, true);
  // RIFF type
  view.setUint32(8, 0x57415645, false); // "WAVE"
  // format chunk identifier
  view.setUint32(12, 0x666d7420, false); // "fmt "
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, numChannels, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, byteRate, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, blockAlign, true);
  // bits per sample
  view.setUint16(34, bitsPerSample, true);
  // data chunk identifier
  view.setUint32(36, 0x64617461, false); // "data"
  // data chunk length
  view.setUint32(40, dataSize, true);
  
  const wavData = new Uint8Array(header.byteLength + pcmData.byteLength);
  wavData.set(new Uint8Array(header), 0);
  wavData.set(pcmData, header.byteLength);
  
  let binary = '';
  for (let i = 0; i < wavData.length; i++) {
    binary += String.fromCharCode(wavData[i]);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}
