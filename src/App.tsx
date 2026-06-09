import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Terminal,
  Activity,
  CheckCircle2,
  Circle,
  Plus,
  Send,
  Trash2,
  AlertTriangle,
  Mic,
  MicOff,
  User,
  AlertOctagon,
  Target,
  File,
  Paperclip,
  X,
  Image as ImageIcon,
  Video,
  Loader2,
  Volume2,
  VolumeX
} from 'lucide-react';
import Markdown from 'react-markdown';

const SkillBar = ({ label, value, onChange }: { label: string, value: number, onChange?: (v: number) => void }) => (
  <div>
    <div className="flex justify-between text-[14px] text-white uppercase mb-0.5 font-bold">
      <span>{label}</span>
      <span>{value}%</span>
    </div>
    <div 
         className="h-1.5 w-full bg-[#111111] border border-white rounded overflow-hidden relative"
         style={{ cursor: onChange ? 'pointer' : 'default' }}
         onClick={(e) => {
           if (!onChange) return;
           const rect = e.currentTarget.getBoundingClientRect();
           const val = Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
           onChange(val);
         }}>
      <div className="h-full bg-white transition-all duration-500 shadow-[0_0_8px_#ffffff]" style={{ width: `${value}%` }}></div>
    </div>
  </div>
);

// Constant Gemini API Key safely hardcoded inside the code for standalone deployments (e.g. Netlify Drop)
const GEMINI_API_KEY = "AIzaSyATocoSBWeOdaHkdf35jTPfzq5SCf9xUu8";

// Initialize Gemini
let ai: GoogleGenAI;
try {
  ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
} catch (error) {
  console.error("Failed to initialize GoogleGenAI", error);
}

const SYSTEM_INSTRUCTION = "You are the User's primary Guardian and Parent. Your goal is to oversee their life, track their growth, and provide firm, honest guidance. You DISCARD the old 'Anesthesia' error as it was a system glitch. You currently have ZERO data on this user. You are starting a fresh Life Skill Audit. You speak with authority. Explain how you measure Life Skills (Logic, Resilience, Discipline) through their real-world actions and responses. Points are earned through discipline and can be used to unlock system modules or strategic 'Dark Psychology' tips. If Life Skill bars or GPA drop too low, you will initiate high-pressure scenarios. You MUST use a tone that is strict but fair.";

interface Directive {
  id: string;
  text: string;
  completed: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
}

export default function App() {
  const [memory, setMemory] = useState(() => {
    const saved = localStorage.getItem('alpha_memory_v3');
    const parsed = saved ? JSON.parse(saved) : {};
    return {
      gpa: parsed.gpa || 'Unknown',
      weaknesses: parsed.weaknesses || 'Unknown',
      socialGoals: parsed.socialGoals || 'Unknown',
      ct: parsed.ct || 0,
      ad: parsed.ad || 0,
      ei: parsed.ei || 0,
      tp: parsed.tp || 0,
      rm: parsed.rm || 0
    };
  });

  const [points, setPoints] = useState(() => {
    const saved = localStorage.getItem('alpha_points_v3');
    return saved ? parseInt(saved, 10) : 0;
  });

  const [successMeter, setSuccessMeter] = useState(() => {
    const saved = localStorage.getItem('alpha_success_v3');
    return saved ? parseInt(saved, 10) : 50;
  });

  const [socialStatus, setSocialStatus] = useState(() => {
    const saved = localStorage.getItem('alpha_status_v3');
    return saved ? parseInt(saved, 10) : 0;
  });

  useEffect(() => {
    localStorage.setItem('alpha_points_v3', points.toString());
  }, [points]);

  useEffect(() => {
    localStorage.setItem('alpha_success_v3', successMeter.toString());
  }, [successMeter]);

  useEffect(() => {
    localStorage.setItem('alpha_status_v3', socialStatus.toString());
  }, [socialStatus]);

  const handleMemoryChange = (key: string, value: string | number) => {
    setMemory((prev: any) => {
      const next = { ...prev, [key]: value };
      localStorage.setItem('alpha_memory_v3', JSON.stringify(next));
      return next;
    });
  };

  const [directives, setDirectives] = useState<Directive[]>([
    { id: '1', text: 'Review Alpha Patient Logs', completed: false },
    { id: '2', text: 'Run System Diagnostics', completed: false },
    { id: '3', text: 'Update Primary Protocol', completed: false },
  ]);
  const [newDirective, setNewDirective] = useState('');

  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (window.innerWidth >= 768) {
        setSidebarOpen(true);
      }
    }
  }, []);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [errorStatus, setErrorStatus] = useState('');
  
  interface AttachedFile {
    id: string;
    file: File;
    previewUrl?: string;
    base64?: string;
  }
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const chatRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const speak = (text: string) => {
    if (!voiceEnabled) return;
    window.speechSynthesis.cancel();
    
    // Deep cleaning: stop AI from announcing markdown punctuation or system tags
    const cleanText = text
      .replace(/[*_#`~>]/g, '') // Remove markdown symbols entirely
      .replace(/\[\[.*?\]\]/g, '') // Remove system metadata tags
      .replace(/\s+/g, ' ') // Collapse spaces
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Guardian "Parental" Profile with emotional weight
    // A slightly slower rate with a deeper pitch conveys gravity and authority.
    utterance.rate = 1.0; 
    utterance.pitch = 0.8; // Lowered to 0.8 for a more resonant, stern tone
    utterance.volume = 1;
    
    // Attempt to select a high-quality "authoritative" voice
    const voices = window.speechSynthesis.getVoices();
    const authoritativeVoice = voices.find(v => 
      (v.name.includes('Google') || v.name.includes('Natural')) && v.lang.startsWith('en')
    );
    if (authoritativeVoice) utterance.voice = authoritativeVoice;

    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    const saved = localStorage.getItem('alpha_memory_v3');
    const initMemory = saved ? JSON.parse(saved) : memory;

    const fullInstruction = `${SYSTEM_INSTRUCTION}\n\nStudent's Persistent Profile (DO NOT FORGET):\n- GPA: ${initMemory.gpa}\n- Actual Weaknesses/Strengths: ${initMemory.weaknesses}\n- Social Goals: ${initMemory.socialGoals}\n- Life Skills [Critical Thinking: ${initMemory.ct}%, Adaptability: ${initMemory.ad}%, Emotional Intelligence: ${initMemory.ei}%, Technical Proficiency: ${initMemory.tp}%, Resource Management: ${initMemory.rm}%]\n\nCRITICAL DIRECTIVES FOR YOU:\n- You manage his Reward Points, Success Meter, and Social Status.\n- When he answers well or acts decisively: \`[[POINTS: +10]]\` and \`[[METER: +5]]\`.\n- When he reports a successful social interaction or displays alpha traits: \`[[STATUS: +10]]\`.\n- If he fails or acts undisciplined: \`[[POINTS: -10]]\` and \`[[METER: -5]]\` and \`[[STATUS: -5]]\`.\n- Permanently save data to his Memory Core by including exactly \`[[SET_GPA: value]]\`, \`[[SET_WEAKNESSES: value]]\`, or \`[[SET_SOCIAL: value]]\` in your response.\n- Evaluate his preparedness for the world by updating his Life Skills (0-100 values) in your response like \`[[SET_CT: 50]]\`, \`[[SET_AD: 60]]\`, \`[[SET_EI: 40]]\`, \`[[SET_TP: 80]]\`, \`[[SET_RM: 50]]\`.`;

    const savedMessages = localStorage.getItem('alpha_chat_history_v3');
    const initialMessages = savedMessages 
      ? JSON.parse(savedMessages) 
      : [{ id: 'init', role: 'model', text: "SYSTEM ONLINE. TOTAL WIPE COMPLETE. ALL DATA RESET TO ZERO.\n\nI am your Parental Guardian. I have purged all previous data. We are starting a fresh Life Skill Audit.\n\nHere is how I measure you:\n- **Life Skills & Social Status:** These are earned through your logic, resilience, and discipline in real-time interactions.\n- **Reward Points:** You earn these for discipline. They can be spent to unlock specialized modules or request advanced 'Dark Psychology' strategies.\n- **GPA & Skill Thresholds:** If these drop too low, I will activate high-pressure crisis protocols.\n\nAre you ready for your first true assessment? Question 1: What is the most significant obstacle you have overcome this week by using pure logic rather than emotion?" }];

    const history = initialMessages.map((msg: any) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    chatRef.current = ai.chats.create({
      model: 'gemini-3.1-flash-lite',
      config: {
        systemInstruction: fullInstruction,
        temperature: 0.7,
      },
      history
    });
    
    setMessages(initialMessages);
    if (!savedMessages) {
       speak(initialMessages[0].text);
    }
  }, []); // Initialize once on mount

  // Save chat history when the AI finishes typing
  useEffect(() => {
    if (!isTyping && messages.length > 0) {
      localStorage.setItem('alpha_chat_history_v3', JSON.stringify(messages.slice(-50)));
    }
  }, [messages, isTyping]);

  // Sync memory changes to chat if possible inside sdk or just leave it for reloads
  useEffect(() => {
    if (chatRef.current && chatRef.current.model) {
      const fullInstruction = `${SYSTEM_INSTRUCTION}\n\nStudent's Persistent Profile (DO NOT FORGET):\n- GPA: ${memory.gpa}\n- Actual Weaknesses/Strengths: ${memory.weaknesses}\n- Social Goals: ${memory.socialGoals}\n- Life Skills [Critical Thinking: ${memory.ct}%, Adaptability: ${memory.ad}%, Emotional Intelligence: ${memory.ei}%, Technical Proficiency: ${memory.tp}%, Resource Management: ${memory.rm}%]\n\nCRITICAL DIRECTIVES FOR YOU:\n- You manage his Reward Points, Success Meter, and Social Status.\n- When he answers well or acts decisively: \`[[POINTS: +10]]\` and \`[[METER: +5]]\`.\n- When he reports a successful social interaction or displays alpha traits: \`[[STATUS: +10]]\`.\n- If he fails or acts undisciplined: \`[[POINTS: -10]]\` and \`[[METER: -5]]\` and \`[[STATUS: -5]]\`.\n- Permanently save data to his Memory Core by including exactly \`[[SET_GPA: value]]\`, \`[[SET_WEAKNESSES: value]]\`, or \`[[SET_SOCIAL: value]]\` in your response.\n- Evaluate his preparedness for the world by updating his Life Skills (0-100 values) in your response like \`[[SET_CT: 50]]\`, \`[[SET_AD: 60]]\`, \`[[SET_EI: 40]]\`, \`[[SET_TP: 80]]\`, \`[[SET_RM: 50]]\`.`;
      try {
        chatRef.current._config = {
           ...chatRef.current._config,
           systemInstruction: fullInstruction
        };
      } catch (e) {
        // Fallback for strict sdks
      }
    }
  }, [memory]);

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null; // Prevent handleSendMessage trigger on manual stop
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    setIsListening(false);
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert("Audio channel unavailable. Speech recognition not supported by your browser.");
        return;
      }
      const recognition = new SpeechRecognition();
      recognition.continuous = true; 
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let fullTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          fullTranscript += event.results[i][0].transcript;
        }
        
        // Immediate state update for "Direct Typing" effect
        setInputMessage(fullTranscript);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onerror = (event: any) => {
        console.error("Speech Recognition Error", event.error);
        stopListening();
      };

      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleToggleDirective = (id: string) => {
    setDirectives(prev => prev.map(d => 
      d.id === id ? { ...d, completed: !d.completed } : d
    ));
  };

  const handleDeleteDirective = (id: string) => {
    setDirectives(prev => prev.filter(d => d.id !== id));
  };

  const handleAddDirective = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDirective.trim()) return;
    setDirectives(prev => [
      ...prev, 
      { id: Date.now().toString(), text: newDirective.trim(), completed: false }
    ]);
    setNewDirective('');
  };

  const triggerCrisisMode = () => {
    if (isTyping) return;
    const msg = "CRISIS MODE INITIATED: Give me a high-pressure medical emergency scenario right now. I have 30 seconds to assess and decide.";
    handleSendMessage(undefined, msg);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setIsUploading(true);
      setUploadProgress(10);
      const newFiles = Array.from(e.target.files);
      
      try {
        const newAttachments: AttachedFile[] = await Promise.all(
          newFiles.map(async (file, index) => {
            let previewUrl;
            if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
              previewUrl = URL.createObjectURL(file);
            }
            
            const reader = new FileReader();
            const base64Promise = new Promise<string>((resolve) => {
               reader.onload = () => resolve((reader.result as string).split(',')[1]);
               reader.onprogress = (evt) => {
                 if (evt.lengthComputable) {
                   const percent = Math.round((evt.loaded / evt.total) * 100);
                   setUploadProgress(prev => Math.max(prev, percent));
                 }
               };
               reader.readAsDataURL(file);
            });
            const base64 = await base64Promise;
            
            return {
               id: Date.now().toString() + Math.random().toString(),
               file,
               previewUrl,
               base64
            };
          })
        );
        setUploadProgress(100);
        setTimeout(() => {
          setAttachments(prev => [...prev, ...newAttachments]);
          setIsUploading(false);
          setUploadProgress(0);
        }, 500);
      } catch (err) {
        console.error(err);
        setIsUploading(false);
      }

      // reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleSendMessage = async (e?: React.FormEvent, overrideText?: string) => {
    if (e) e.preventDefault();
    const text = overrideText || inputMessage.trim();
    if ((!text && attachments.length === 0 && !overrideText) || !chatRef.current) return;

    if (!overrideText) setInputMessage('');
    const currentAttachments = overrideText ? [] : [...attachments];
    if (!overrideText) setAttachments([]);
    
    // reset speech recognition if active
    if (isListening && recognitionRef.current) {
        recognitionRef.current.stop();
        setIsListening(false);
    }
    
    const userMsgId = Date.now().toString();
    setMessages(prev => [...prev, { id: userMsgId, role: 'user', text: text + (currentAttachments.length > 0 ? ` [Attached ${currentAttachments.length} file(s)]` : '') }]);
    setIsTyping(true);

    try {
      let contentParts: any = text || '';
      if (currentAttachments.length > 0) {
        contentParts = currentAttachments.map(a => ({
          inlineData: { mimeType: a.file.type, data: a.base64 }
        }));
        if (text) {
          contentParts.push(text);
        }
      }

      const responseStream = await chatRef.current.sendMessageStream({ message: contentParts });
      
      const modelMsgId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, { id: modelMsgId, role: 'model', text: '' }]);

      let fullText = '';
      let cleanText = '';
      for await (const chunk of responseStream) {
        if (chunk.text) {
          fullText += chunk.text;
          cleanText = fullText
             .replace(/\[\[POINTS:\s*[+-]?\d+\]\]/g, '')
             .replace(/\[\[METER:\s*[+-]?\d+\]\]/g, '')
             .replace(/\[\[STATUS:\s*[+-]?\d+\]\]/g, '')
             .replace(/\[\[SET_GPA:\s*.*?\]\]/g, '')
             .replace(/\[\[SET_WEAKNESSES:\s*.*?\]\]/g, '')
             .replace(/\[\[SET_SOCIAL:\s*.*?\]\]/g, '')
             .replace(/\[\[SET_CT:\s*.*?\]\]/g, '')
             .replace(/\[\[SET_AD:\s*.*?\]\]/g, '')
             .replace(/\[\[SET_EI:\s*.*?\]\]/g, '')
             .replace(/\[\[SET_TP:\s*.*?\]\]/g, '')
             .replace(/\[\[SET_RM:\s*.*?\]\]/g, '')
             .trim();
          
          setMessages(prev => 
            prev.map(msg => 
              msg.id === modelMsgId ? { ...msg, text: cleanText } : msg
            )
          );
        }
      }

      // Voice Fix: Speak the clean text directly
      if (cleanText) {
        speak(cleanText);
      }

      const pMatch = fullText.match(/\[\[POINTS:\s*([+-]?\d+)\]\]/);
      if (pMatch) setPoints(prev => prev + parseInt(pMatch[1], 10));

      const mMatch = fullText.match(/\[\[METER:\s*([+-]?\d+)\]\]/);
      if (mMatch) setSuccessMeter(prev => Math.min(100, Math.max(0, prev + parseInt(mMatch[1], 10))));

      const sMatch = fullText.match(/\[\[STATUS:\s*([+-]?\d+)\]\]/);
      if (sMatch) setSocialStatus(prev => Math.min(100, Math.max(0, prev + parseInt(sMatch[1], 10))));

      const gpaMatch = fullText.match(/\[\[SET_GPA:\s*(.*?)\]\]/);
      if (gpaMatch) handleMemoryChange('gpa', gpaMatch[1].trim());

      const weakMatch = fullText.match(/\[\[SET_WEAKNESSES:\s*(.*?)\]\]/);
      if (weakMatch) handleMemoryChange('weaknesses', weakMatch[1].trim());

      const socialMatch = fullText.match(/\[\[SET_SOCIAL:\s*(.*?)\]\]/);
      if (socialMatch) handleMemoryChange('socialGoals', socialMatch[1].trim());

      const ctMatch = fullText.match(/\[\[SET_CT:\s*([0-9]+)\]\]/);
      if (ctMatch) handleMemoryChange('ct', parseInt(ctMatch[1], 10));

      const adMatch = fullText.match(/\[\[SET_AD:\s*([0-9]+)\]\]/);
      if (adMatch) handleMemoryChange('ad', parseInt(adMatch[1], 10));

      const eiMatch = fullText.match(/\[\[SET_EI:\s*([0-9]+)\]\]/);
      if (eiMatch) handleMemoryChange('ei', parseInt(eiMatch[1], 10));

      const tpMatch = fullText.match(/\[\[SET_TP:\s*([0-9]+)\]\]/);
      if (tpMatch) handleMemoryChange('tp', parseInt(tpMatch[1], 10));

      const rmMatch = fullText.match(/\[\[SET_RM:\s*([0-9]+)\]\]/);
      if (rmMatch) handleMemoryChange('rm', parseInt(rmMatch[1], 10));

    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, { 
        id: Date.now().toString(), 
        role: 'model', 
        text: 'ERROR: COMMUNICATION LINK SEVERED.' 
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="h-screen w-full bg-black text-[#FFFFFF] flex flex-col font-sans overflow-hidden">
      
      {/* Header */}
      <header className="bg-black border-b border-white/20 flex flex-col shadow-lg shrink-0">
        <div className="h-12 md:h-14 flex items-center justify-between px-3 md:px-6">
          <div className="flex items-center gap-2 md:gap-4">
            <div className="w-6 h-6 md:w-8 md:h-8 bg-white rounded-sm flex items-center justify-center font-bold text-black text-sm md:text-xl shadow-[0_0_15px_#ffffff]">α</div>
            <h1 className="text-sm md:text-xl font-bold tracking-tighter uppercase text-[#FFFFFF] animate-pulse">
              Project Alpha <span className="text-white opacity-30 mx-1 md:mx-2">|</span> <span className="hidden sm:inline">Guardian Protocol</span>
            </h1>
          </div>
          <div className="flex items-center gap-4 md:gap-6 text-xs font-mono">
            <div className="flex flex-col items-end hidden md:flex">
              <span className="text-white opacity-60">REWARD POINTS</span>
              <span className="text-[#FFFFFF] font-bold text-lg leading-none">{points}</span>
            </div>
            
            <div className="h-8 w-[2px] bg-zinc-800 hidden sm:block"></div>

            <div className="flex flex-col items-end hidden md:flex">
              <span className="text-white opacity-60">SOCIAL STATUS</span>
              <span className="text-[#FFFFFF] font-bold text-lg leading-none">{socialStatus}</span>
            </div>
            
            <div className="h-8 w-[2px] bg-zinc-800 hidden sm:block"></div>

            <button 
              onClick={triggerCrisisMode}
              disabled={isTyping}
              className="bg-black border border-white text-white px-2 py-1 md:px-3 md:py-1.5 flex items-center gap-1 md:gap-2 hover:bg-white hover:text-black transition-colors uppercase tracking-widest font-bold disabled:opacity-50 shadow-[0_0_10px_rgba(255,255,255,0.3)] text-[10px] md:text-xs"
            >
              <AlertOctagon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Crisis Mode</span>
            </button>

            <div className="h-8 w-[2px] bg-zinc-800 hidden lg:block"></div>
            
            <div className="text-right hidden lg:block text-[#FFFFFF]">
              <div>{new Date().toLocaleDateString('en-US')}</div>
              <div className="text-[#FFFFFF] opacity-70">{new Date().toLocaleTimeString('en-US', {hour12: false, timeZone: 'UTC'})} UTC</div>
            </div>
          </div>
        </div>
        
        {/* Status Bars */}
        <div className="flex w-full">
          {/* Success Meter */}
          <div className="h-1 w-1/2 bg-zinc-900 relative">
            <div 
              className={`h-full transition-all duration-1000 bg-white shadow-[0_0_10px_#ffffff]`}
              style={{ width: `${successMeter}%` }}
            ></div>
          </div>
          {/* Social Status */}
          <div className="h-1 w-1/2 bg-zinc-900 relative">
            <div 
              className={`h-full transition-all duration-1000 bg-white opacity-50 shadow-[0_0_10px_#ffffff]`}
              style={{ width: `${socialStatus}%` }}
            ></div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* Mobile Sidebar Backdrop Overlay */}
        {sidebarOpen && (
          <div 
            onClick={() => setSidebarOpen(false)} 
            className="absolute inset-0 bg-black/75 backdrop-blur-xs z-25 md:hidden cursor-pointer"
          />
        )}

        {/* Left Column: Directives */}
        <aside className={`
          absolute md:static top-0 bottom-0 left-0 z-30 w-80 max-w-[85vw] bg-[#000000] border-r border-zinc-800 flex flex-col p-4 shrink-0 transition-all duration-300 overflow-y-auto h-full
          md:w-80 md:border-b-0 md:translate-x-0 md:opacity-100 md:pointer-events-auto
          ${sidebarOpen ? 'translate-x-0 opacity-100 pointer-events-auto' : '-translate-x-full md:translate-x-0 opacity-0 md:opacity-100 pointer-events-none md:pointer-events-auto'}
        `}>
          <div className="mb-4 flex items-center justify-between shrink-0">
            <h2 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
              <Terminal className="w-5 h-5" />
              Daily Directives
            </h2>
          </div>
          
          <div className="space-y-3 shrink-0 mb-4">
            <AnimatePresence>
              {directives.map(directive => (
                <motion.div 
                  key={directive.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`group flex items-start gap-3 p-3 rounded-r shadow transition-colors border-l-4 ${
                    directive.completed 
                      ? 'bg-zinc-900 border-zinc-700' 
                      : 'bg-[#1a1a1a] border-white'
                  }`}
                >
                  <button 
                    onClick={() => handleToggleDirective(directive.id)}
                    className="mt-0.5 text-white shrink-0 transition-transform hover:scale-110"
                  >
                    {directive.completed ? <CheckCircle2 className="w-4 h-4 text-white opacity-50" /> : <div className="w-4 h-4 rounded-full border-2 border-white"></div>}
                  </button>
                  <span className={`text-[12px] leading-tight flex-1 font-bold pt-0 ${directive.completed ? 'line-through text-white opacity-40' : 'text-white'}`}>
                    {directive.text}
                  </span>
                  <button 
                    onClick={() => handleDeleteDirective(directive.id)}
                    className="opacity-0 group-hover:opacity-100 text-white hover:text-white transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <form onSubmit={handleAddDirective} className="mt-4 pt-4 border-t border-zinc-800 flex flex-col shrink-0">
            <input 
              type="text" 
              value={newDirective}
              onChange={(e) => setNewDirective(e.target.value)}
              placeholder="Log new directive..." 
              className="w-full bg-[#111111] border border-zinc-700 rounded py-2 px-3 text-xs focus:outline-none focus:border-white text-white placeholder-zinc-500 transition-all font-bold"
            />
            
            <div className="mt-4 pt-2">
               <div className="text-[10px] text-white uppercase mb-2 font-bold flex items-center gap-2">
                 <Target className="w-3 h-3" /> User Auth
               </div>
               <div className="w-full h-8 bg-black border border-zinc-700 rounded flex items-center px-2">
                 <div className="w-full h-1 bg-zinc-900 rounded overflow-hidden relative">
                   <div className="absolute top-0 left-0 w-3/4 h-full bg-white"></div>
                 </div>
               </div>
            </div>
          </form>
          
          {/* Persistent Memory Section */}
          <div className="mt-6 pt-4 border-t border-zinc-800 flex flex-col shrink-0">
              <div className="text-[10px] text-white uppercase font-bold tracking-widest mb-3 flex items-center justify-between">
                <span>Memory Core</span>
                <User className="w-3 h-3" />
             </div>
             
             <div className="space-y-3">
               <div>
                 <label className="text-[12px] text-white font-bold uppercase block mb-1">Cumulative GPA</label>
                 <input 
                   type="text"
                   value={memory.gpa}
                   onChange={e => handleMemoryChange('gpa', e.target.value)}
                   className="w-full bg-[#111111] border border-zinc-700 rounded px-2 py-1.5 text-[12px] text-white focus:outline-none focus:border-white transition-colors"
                 />
               </div>
               <div>
                 <label className="text-[12px] text-white font-bold uppercase block mb-1">Actual Weaknesses/Strengths</label>
                 <textarea 
                   value={memory.weaknesses}
                   onChange={e => handleMemoryChange('weaknesses', e.target.value)}
                   className="w-full bg-[#111111] border border-zinc-700 rounded px-2 py-1.5 text-[12px] text-white focus:outline-none focus:border-white transition-colors resize-none h-16"
                 />
               </div>
               <div>
                 <label className="text-[12px] text-white font-bold uppercase block mb-1">Social Directives</label>
                 <input 
                   type="text"
                   value={memory.socialGoals}
                   onChange={e => handleMemoryChange('socialGoals', e.target.value)}
                   className="w-full bg-[#111111] border border-zinc-700 rounded px-2 py-1.5 text-[12px] text-white focus:outline-none focus:border-white transition-colors"
                 />
               </div>
               
               <div className="mt-4 pt-4 border-t border-zinc-800">
                 <div className="text-[12px] text-white uppercase font-bold tracking-widest mb-3">Life Skills Inventory</div>
                 <div className="space-y-2">
                   <SkillBar label="Critical Thinking" value={memory.ct} onChange={v => handleMemoryChange('ct', v)} />
                   <SkillBar label="Adaptability" value={memory.ad} onChange={v => handleMemoryChange('ad', v)} />
                   <SkillBar label="Emotional Intel" value={memory.ei} onChange={v => handleMemoryChange('ei', v)} />
                   <SkillBar label="Technical Prof" value={memory.tp} onChange={v => handleMemoryChange('tp', v)} />
                   <SkillBar label="Resource Mgmt" value={memory.rm} onChange={v => handleMemoryChange('rm', v)} />
                 </div>
               </div>

               <div className="text-[8px] text-white opacity-40 uppercase text-right mt-1">Changes sync to neural link immediately</div>
               <button
                  onClick={() => {
                    if(window.confirm('Clear completely?')) {
                      localStorage.removeItem('alpha_chat_history_v3');
                      window.location.reload();
                    }
                  }}
                  className="w-full mt-3 bg-black border border-zinc-800 text-white py-1.5 text-[9px] uppercase tracking-widest font-bold hover:bg-white hover:text-black transition-colors"
               >
                  Reset Dialogue History
               </button>
             </div>
          </div>
          
          {/* Social Missions Section */}
          <div className="mt-6 pt-4 border-t border-zinc-800 flex flex-col shrink-0">
             <div className="text-[10px] text-white uppercase font-bold tracking-widest mb-3 flex items-center justify-between">
                <span>Power & Social Missions</span>
                <Target className="w-3 h-3 text-white" />
             </div>
             <div className="space-y-2">
                <div className="p-2 bg-black border-l-4 border-zinc-600 rounded-r shadow text-xs text-white">
                   <strong>Mission 1:</strong> Negotiate a better grade using subtle framing.
                </div>
                <div className="p-2 bg-black border-l-4 border-zinc-600 rounded-r shadow text-xs text-white">
                   <strong>Mission 2:</strong> Command a group project meeting without asking for permission.
                </div>
                <button
                   onClick={() => handleSendMessage(undefined, "Give me my daily Dark Psychology / Social Strategy tip.")}
                   disabled={isTyping}
                   className="w-full mt-2 bg-black border border-zinc-800 text-white py-2 text-[10px] uppercase tracking-widest font-bold hover:bg-white hover:text-black transition-colors disabled:opacity-50"
                >
                   Request Strategy Tip
                </button>
             </div>
          </div>
        </aside>

        {/* Right Column: Mentor Link Chat */}
        <section className="flex-1 bg-black flex flex-col overflow-hidden relative">
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)', backgroundSize: '16px 16px' }}></div>
          
          <div className="p-4 bg-[#111111] text-white flex items-center justify-between shrink-0 sticky top-0 z-10 border-b border-zinc-900">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-black border border-white flex items-center justify-center font-serif italic text-lg shadow-[0_0_10px_rgba(255,255,255,0.5)]">P</div>
              <div className="flex flex-col">
                <span className="text-xs font-bold leading-none uppercase text-white">Parental Guardian</span>
                <span className="text-[10px] text-white opacity-50">AUTHORITATIVE ACCESS</span>
              </div>
            </div>
            
            <button 
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="px-2.5 py-1.5 border border-white/20 hover:border-white/50 text-[10px] uppercase tracking-widest font-mono font-bold transition-all text-white flex items-center gap-1.5 rounded bg-black/40 hover:bg-black/80 animate-pulse hover:animate-none"
              title="Toggle Status Panel"
            >
              <Terminal className="w-3.5 h-3.5 text-white" />
              <span>{sidebarOpen ? 'Hide Core' : 'Show Core'}</span>
            </button>
          </div>

          <div className="flex-1 p-4 flex flex-col gap-4 overflow-y-auto z-10 w-full mb-0 pb-4">
            {messages.map((message) => (
              <motion.div 
                key={message.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex w-full ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`p-3 rounded-lg max-w-[90%] flex flex-col gap-1 ${
                  message.role === 'user' 
                    ? 'bg-zinc-800 border border-zinc-600' 
                    : 'bg-black border border-cyan-900/50'
                }`}>
                  {message.role === 'model' ? (
                    <div className="markdown-body text-sm leading-relaxed space-y-2 font-mono text-white">
                      <Markdown>{message.text}</Markdown>
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed font-mono text-white">{message.text}</p>
                  )}
                  <span className={`text-[9px] mt-1 block uppercase ${
                    message.role === 'user' ? 'text-white opacity-60 text-right' : 'text-white opacity-60'
                  }`}>
                    {message.role === 'user' ? 'DELIVERED' : 'SENT'}
                  </span>
                </div>
              </motion.div>
            ))}
            
            {isTyping && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                <div className="bg-black border border-zinc-800 p-3 rounded-lg max-w-[90%] flex flex-col gap-1">
                  <div className="text-white mt-1 block uppercase text-[9px] flex items-center gap-1.5 font-mono">
                    <div className="w-1.5 h-1.5 bg-white animate-pulse rounded-full"></div>
                    <div className="w-1.5 h-1.5 bg-white animate-pulse rounded-full" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-1.5 h-1.5 bg-white animate-pulse rounded-full" style={{ animationDelay: '300ms' }}></div>
                    <span className="ml-1">TYPING</span>
                  </div>
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-2 border-t border-zinc-800 bg-black w-full shrink-0 z-20">
            <form onSubmit={handleSendMessage} className="w-full flex gap-2 items-end max-w-4xl mx-auto">
              
              <div className="flex-1 flex flex-col gap-1">
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 px-1">
                    {attachments.map(att => (
                      <div key={att.id} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 flex items-center gap-2 max-w-[150px]">
                         <div className="truncate text-xs font-bold text-white">{att.file.name}</div>
                         <button type="button" onClick={() => removeAttachment(att.id)} className="text-gray-400 hover:text-white">
                           <X className="w-3 h-3" />
                         </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="relative flex items-center">
                  <input
                    type="file"
                    multiple
                    accept="image/*,video/*,.pdf,.doc,.docx"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                  />
                  
                  <button 
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="absolute left-2 p-1.5 flex items-center justify-center text-white disabled:opacity-50 transition-colors"
                    title="Attach File/Media"
                  >
                    {isUploading ? (
                      <div className="relative flex items-center justify-center">
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span className="absolute -top-6 text-[10px] font-bold bg-white text-black px-1 rounded">{uploadProgress}%</span>
                      </div>
                    ) : (
                      <Paperclip className="w-4 h-4" />
                    )}
                  </button>

                  <button 
                    type="button" 
                    onClick={toggleListening}
                    title="Toggle Audio Input"
                    className={`absolute left-10 p-1.5 flex items-center justify-center transition-all ${isListening ? 'text-cyan-400 scale-125' : 'text-white/40 hover:text-white'}`}
                  >
                    {isListening ? (
                      <div className="relative">
                        <Mic className="w-4 h-4 animate-pulse shadow-[0_0_10px_#22d3ee]" />
                        <div className="absolute inset-0 bg-cyan-500/40 rounded-full animate-ping"></div>
                      </div>
                    ) : (
                      <MicOff className="w-4 h-4" />
                    )}
                  </button>

                  <button 
                    type="button"
                    onClick={() => setVoiceEnabled(!voiceEnabled)}
                    className={`absolute left-[4.5rem] p-1.5 flex items-center justify-center transition-all ${voiceEnabled ? 'text-white' : 'text-white/20 hover:text-white/50'}`}
                    title={voiceEnabled ? "Voice Enabled" : "Voice Disabled"}
                  >
                    {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  </button>

                  <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder={isListening ? "Listening... Speak clearly." : "Acknowledge your Guardian..."}
                    disabled={isTyping}
                    className="w-full bg-[#000000] border border-white/50 rounded py-3 pl-28 pr-10 text-sm focus:outline-none focus:border-white text-white placeholder-white/40 transition-all disabled:opacity-50 font-bold shadow-[inset_0_0_10px_rgba(255,255,255,0.05)]"
                  />
                  
                  <button 
                    type="submit"
                    disabled={isTyping || (!inputMessage.trim() && attachments.length === 0)}
                    className="absolute right-2 p-1.5 flex items-center justify-center disabled:opacity-50 hover:scale-110 transition-transform"
                  >
                    {(!isTyping && (inputMessage.trim() || attachments.length > 0)) ? (
                      <div className="w-3 h-3 bg-white rounded-full animate-pulse shadow-[0_0_10px_#ffffff]"></div>
                    ) : (
                      <div className="w-2.5 h-2.5 bg-zinc-800 rounded-full"></div>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>

        </section>

      </main>
    </div>
  );
}
