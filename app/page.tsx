// app/page.tsx
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { 
  Trophy, Sparkles, CheckCircle, Copy, Check, Scale, BrainCircuit, AlertCircle, 
  RefreshCw, Clock, Loader2, X, Trash2, MessageSquarePlus, Menu, Zap, Rocket, 
  Layers, ChevronRight, Gift, BarChart3 
} from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts';

// --- 类型定义 ---
type Message = { role: 'user' | 'assistant' | 'system'; content: string; id: string }; 
type ModelData = { 
  name: string; 
  messages: Message[]; 
  isLoading: boolean; 
  colorClass: string; 
  gradientClass: string; 
  error?: string; 
  abortController?: AbortController | null; 
};
type SelectedItem = { modelName: string; messageId: string; content: string; colorClass: string; };
type Session = { id: string; title: string; timestamp: number; models: Record<string, Omit<ModelData, 'abortController'>>; judgeResult: string | null; };
type Dimension = { key: string; label: string; max: number };
type ResponseLength = 'brief' | 'concise' | 'standard' | 'detailed';
type ModelScore = { name: string; scores: Record<string, number>; total: number; isBest?: boolean; shortComment?: string; };
type UserData = { isLoggedIn: boolean; username?: string; plan: 'pro'; credits: number; };

const DEFAULT_DIMENSIONS: Dimension[] = [
  { key: 'accuracy', label: '准确性', max: 5 },
  { key: 'codeQuality', label: '代码质量', max: 5 },
  { key: 'logic', label: '逻辑性', max: 5 },
  { key: 'creativity', label: '创新性', max: 5 },
];

const PROMPT_TEMPLATES = [
  { label: '💻 写代码', text: '请作为一名资深工程师，用最佳实践编写代码。要求：代码健壮、有注释、考虑边界情况。' },
  { label: '📝 润色文章', text: '请作为一名专业编辑，润色以下文本。要求：语言流畅、用词精准、逻辑清晰。' },
  { label: '📊 数据分析', text: '请作为一名数据分析师，帮我分析以下数据。要求：给出关键洞察及可执行建议。' },
  { label: '🎭 角色扮演', text: '请作为一名行业专家，用专业且易懂的语言解答我的问题。' },
];

// --- 组件：代码块 ---
const CodeBlock = ({ language, children }: { language: string | undefined; children: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => { 
    navigator.clipboard.writeText(children); 
    setCopied(true); 
    setTimeout(() => setCopied(false), 1500); 
  };
  return (
    <div className="relative group rounded-lg overflow-hidden my-4 border border-gray-700 bg-[#1e1e1e]">
      <div className="flex justify-between items-center px-4 py-2 bg-[#2d2d2d] text-xs text-gray-400">
        <span>{language || 'Code'}</span>
        <button onClick={handleCopy} className="flex items-center gap-1 hover:text-white transition-colors">
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? '已复制' : '复制'}
        </button>
      </div>
      <SyntaxHighlighter language={language || 'text'} style={vscDarkPlus} customStyle={{ margin: 0, padding: '1rem', background: 'transparent', fontSize: '0.85rem' }}>
        {children}
      </SyntaxHighlighter>
    </div>
  );
};

export default function Home() {
  // --- 状态管理 ---
  const [input, setInput] = useState('');
  const [responseLength, setResponseLength] = useState<ResponseLength>('concise');
  const [activeTab, setActiveTab] = useState('通义千问');
  
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [isCompareViewOpen, setIsCompareViewOpen] = useState(false);
  const [compareScoreData, setCompareScoreData] = useState<ModelScore[]>([]);
  const [compareJudgeResult, setCompareJudgeResult] = useState<string | null>(null);
  const [isComparingJudging, setIsComparingJudging] = useState(false);
  const [compareFusionResult, setCompareFusionResult] = useState<string | null>(null);
  const [isComparingFusing, setIsComparingFusing] = useState(false);
  const [judgeTimer, setJudgeTimer] = useState(5);
  const [fusionTimer, setFusionTimer] = useState(5);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const [models, setModels] = useState<Record<string, ModelData>>({
    '通义千问': { name: '通义千问', messages: [], isLoading: false, colorClass: 'bg-purple-500', gradientClass: 'from-purple-500 to-indigo-500', abortController: null },
    'DeepSeek': { name: 'DeepSeek', messages: [], isLoading: false, colorClass: 'bg-blue-500', gradientClass: 'from-blue-500 to-cyan-500', abortController: null },
    '豆包': { name: '豆包', messages: [], isLoading: false, colorClass: 'bg-emerald-500', gradientClass: 'from-emerald-500 to-teal-500', abortController: null },
  });

  const [user] = useState<UserData>({ isLoggedIn: true, username: 'Guest', plan: 'pro', credits: 9999 });
  const [showBetaModal, setShowBetaModal] = useState(false);
  
  const lastQuestionRef = useRef('');
  const scrollRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // --- 初始化 ---
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const seen = localStorage.getItem('beta_modal_seen_v2');
      if (!seen) {
        const timer = setTimeout(() => setShowBetaModal(true), 300);
        return () => clearTimeout(timer);
      }
      
      const saved = localStorage.getItem('ai_compare_sessions');
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as Session[];
          if (parsed.length > 0) {
            const cleanSessions = parsed.map(s => ({
              ...s,
              models: Object.fromEntries(
                Object.entries(s.models).map(([k, v]) => [k, { ...v, abortController: null }])
              )
            })) as Session[];
            setSessions(cleanSessions);
            loadSession(cleanSessions[0].id);
          }
        } catch (e) { console.error(e); }
      }
    }
  }, []);

  // --- 核心逻辑 ---
  const saveCurrentSession = useCallback(() => {
    const hasContent = Object.values(models).some(m => m.messages.length > 0);
    if (!hasContent) return;
    const modelsToSave = Object.fromEntries(
      Object.entries(models).map(([k, v]) => {
        const { abortController, ...rest } = v;
        return [k, rest];
      })
    ) as Record<string, Omit<ModelData, 'abortController'>>;
    const firstUserMsg = models['通义千问'].messages.find(m => m.role === 'user')?.content || models['DeepSeek'].messages.find(m => m.role === 'user')?.content || '新会话';
    const title = firstUserMsg.slice(0, 20) + (firstUserMsg.length > 20 ? '...' : '');
    const sessionId = currentSessionId || Date.now().toString();
    const newSession: Session = { id: sessionId, title, timestamp: Date.now(), models: modelsToSave, judgeResult: compareJudgeResult };
    setSessions(prev => {
      const updated = [newSession, ...prev.filter(s => s.id !== sessionId)];
      if (typeof window !== 'undefined') localStorage.setItem('ai_compare_sessions', JSON.stringify(updated));
      return updated;
    });
    setCurrentSessionId(sessionId);
  }, [models, compareJudgeResult, currentSessionId]);

  useEffect(() => { const t = setTimeout(() => saveCurrentSession(), 1500); return () => clearTimeout(t); }, [models, compareJudgeResult, saveCurrentSession]);

  const loadSession = (id: string) => {
    const session = sessions.find(s => s.id === id);
    if (!session) return;
    const restored = Object.fromEntries(Object.entries(session.models).map(([k, v]) => [k, { ...v, abortController: null, isLoading: false }])) as Record<string, ModelData>;
    setModels(restored);
    setCompareScoreData([]); setCompareJudgeResult(session.judgeResult); setCompareFusionResult(null);
    setCurrentSessionId(id); setSelectedItems([]); setIsCompareViewOpen(false);
    if (typeof window !== 'undefined' && window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const createNewSession = () => {
    stopAllGenerations();
    setModels({
      '通义千问': { name: '通义千问', messages: [], isLoading: false, colorClass: 'bg-purple-500', gradientClass: 'from-purple-500 to-indigo-500', abortController: null },
      'DeepSeek': { name: 'DeepSeek', messages: [], isLoading: false, colorClass: 'bg-blue-500', gradientClass: 'from-blue-500 to-cyan-500', abortController: null },
      '豆包': { name: '豆包', messages: [], isLoading: false, colorClass: 'bg-emerald-500', gradientClass: 'from-emerald-500 to-teal-500', abortController: null },
    });
    setCompareScoreData([]); setCompareJudgeResult(null); setCompareFusionResult(null);
    setSelectedItems([]); setIsCompareViewOpen(false); setIsComparingJudging(false); setIsComparingFusing(false);
    setCurrentSessionId(null); setInput('');
    if (typeof window !== 'undefined' && window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if(!confirm('确定删除？')) return;
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    if (typeof window !== 'undefined') localStorage.setItem('ai_compare_sessions', JSON.stringify(updated));
    if (currentSessionId === id) updated.length > 0 ? loadSession(updated[0].id) : createNewSession();
  };

  const stopGeneration = (modelName: string) => {
    const m = models[modelName];
    if (m.abortController) {
      m.abortController.abort();
      setModels(prev => ({ ...prev, [modelName]: { ...prev[modelName], isLoading: false, abortController: null, error: '已停止' } }));
    }
  };

  const stopAllGenerations = () => {
    Object.values(models).forEach(m => m.abortController?.abort());
    setModels(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if (next[k].isLoading) next[k] = { ...next[k], isLoading: false, abortController: null, error: '已停止' }; });
      return next;
    });
  };

  // 【核心修改】提交逻辑：调用本地 API /api/chat
  const handleSubmit = async (e?: React.FormEvent, templateText?: string) => {
    if (e) e.preventDefault();
    const finalInput = templateText || input.trim();
    if (!finalInput) return;
    if (Object.values(models).some(m => m.isLoading)) { stopAllGenerations(); return; }

    lastQuestionRef.current = finalInput;
    const constraints: Record<ResponseLength, string> = {
      brief: "\n[要求]: 极度精简，50 字内。", concise: "\n[要求]: 简洁回复，150 字内。",
      standard: "\n[要求]: 标准回复，结构完整。", detailed: "\n[要求]: 详尽深度回复。"
    };
    const constraint = constraints[responseLength];
    if (!templateText) setInput('');
    
    setCompareScoreData([]); setCompareJudgeResult(null); setCompareFusionResult(null);
    setSelectedItems([]); setIsCompareViewOpen(false);

    const timestamp = Date.now();
    const controllers: Record<string, AbortController> = {};
    Object.keys(models).forEach(k => controllers[k] = new AbortController());

    setModels(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        next[k] = {
          ...next[k],
          messages: [...next[k].messages, { role: 'user', content: finalInput, id: `${k}-${timestamp}-u` }, { role: 'assistant', content: '', id: `${k}-${timestamp}-a` }],
          isLoading: true, error: undefined, abortController: controllers[k]
        };
      });
      return next;
    });

    const promises = Object.keys(models).map(async (modelName) => {
      const controller = controllers[modelName];
      try {
        // 调用本地后端接口，而不是直接调用第三方
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modelType: modelName,
            prompt: finalInput + constraint,
            history: models[modelName].messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }))
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || `HTTP ${response.status}`);
        }
        if (!response.body) throw new Error('No response body');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let acc = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          for (const line of chunk.split('\n')) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const json = JSON.parse(line.slice(6));
                const content = json.choices?.[0]?.delta?.content || '';
                acc += content;
                setModels(prev => {
                  if (!prev[modelName].isLoading) return prev;
                  const msgs = [...prev[modelName].messages];
                  const idx = msgs.findIndex(m => m.id === `${modelName}-${timestamp}-a`);
                  if (idx !== -1) msgs[idx].content = acc;
                  return { ...prev, [modelName]: { ...prev[modelName], messages: msgs } };
                });
              } catch (e) {}
            }
          }
        }
        setModels(prev => ({ ...prev, [modelName]: { ...prev[modelName], isLoading: false, abortController: null } }));
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          setModels(prev => ({ ...prev, [modelName]: { ...prev[modelName], isLoading: false, abortController: null, error: error.message } }));
        }
      }
    });
    await Promise.all(promises);
  };

  // 【核心修改】评委逻辑：调用本地 API /api/judge
  const handleCompareJudge = async () => {
    if (selectedItems.length === 0) return;
    setIsComparingJudging(true); setCompareJudgeResult(null); setCompareScoreData([]); setJudgeTimer(5);
    const timer = setInterval(() => setJudgeTimer(p => Math.max(0, p - 1)), 1000);

    const prompt = `请对比以下回答。\n问题：${lastQuestionRef.current}\n\n${selectedItems.map((item, i) => `--- ${item.modelName} ---\n${item.content}`).join('\n\n')}\n\n请严格按 JSON 返回：{"scores":[{"name":"模型","accuracy":1-5,"codeQuality":1-5,"logic":1-5,"creativity":1-5,"shortComment":"8 字评语"}],"summary":"详细点评"}`;

    try {
      const res = await fetch('/api/judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      if (!res.ok) throw new Error('评委服务失败');
      const data = await res.json();
      const content = data.result || '';
      const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
      const result = JSON.parse(jsonStr);

      if (result.scores) {
        const scored = result.scores.map((s: any) => {
          const scoresMap: Record<string, number> = {};
          let total = 0;
          DEFAULT_DIMENSIONS.forEach(d => { const v = Number(s[d.key])||0; scoresMap[d.key]=v; total+=v; });
          return { name: s.name, scores: scoresMap, total, shortComment: s.shortComment };
        }).sort((a:any,b:any)=>b.total-a.total);
        if(scored.length) scored[0].isBest = true;
        setCompareScoreData(scored);
      }
      if(result.summary) setCompareJudgeResult(result.summary);
    } catch (error: any) {
      setCompareJudgeResult(`❌ 出错：${error.message}`);
    } finally {
      clearInterval(timer); setIsComparingJudging(false); setJudgeTimer(0);
    }
  };

  const retryModel = (modelName: string) => {
    const last = models[modelName].messages.filter(m => m.role === 'user').pop();
    if (last) {
      setModels(prev => ({ ...prev, [modelName]: { ...prev[modelName], messages: prev[modelName].messages.filter(m => !m.id.endsWith('-a') || (m.content && !m.content.startsWith('⚠️') && m.content !== '已停止')), isLoading: false, error: undefined } }));
      handleSubmit(undefined, last.content);
    }
  };

  const toggleSelectMessage = (modelName: string, messageId: string, content: string, colorClass: string) => {
    setSelectedItems(prev => {
      if (prev.some(i => i.messageId === messageId)) return prev.filter(i => i.messageId !== messageId);
      if (prev.length >= 3) { alert("最多选 3 条"); return prev; }
      return [...prev, { modelName, messageId, content, colorClass }];
    });
  };

  const radarChartData = DEFAULT_DIMENSIONS.map(dim => {
    const pt: any = { subject: dim.label };
    compareScoreData.forEach(m => pt[m.name] = m.scores[dim.key] || 0);
    return pt;
  });

  const responseOptions = [
    { value: 'brief', label: '极简', icon: Zap, color: 'text-gray-500', activeColor: 'bg-gray-100 border-gray-300 text-gray-700 dark:bg-gray-700 dark:text-gray-200' },
    { value: 'concise', label: '简洁', icon: Rocket, color: 'text-blue-500', activeColor: 'bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
    { value: 'standard', label: '标准', icon: Scale, color: 'text-indigo-500', activeColor: 'bg-indigo-100 border-indigo-300 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' },
    { value: 'detailed', label: '详细', icon: Layers, color: 'text-purple-500', activeColor: 'bg-purple-100 border-purple-300 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  ];
  const isAnyLoading = Object.values(models).some(m => m.isLoading);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans overflow-hidden">
      {/* 侧边栏 */}
      <div className={`${isSidebarOpen ? 'w-64' : 'w-0'} flex-shrink-0 bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 transition-all duration-300 overflow-hidden flex flex-col relative z-20`}>
        <div className="p-4"><button onClick={createNewSession} className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg font-medium shadow-sm"><MessageSquarePlus size={18}/> 新对话</button></div>
        <div className="flex-1 overflow-y-auto px-3 space-y-1">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2 mt-2">历史记录</div>
          {sessions.length === 0 ? <div className="text-sm text-gray-400 px-3">暂无记录</div> : sessions.map(s => (
            <div key={s.id} onClick={() => loadSession(s.id)} className={`group p-3 rounded-lg cursor-pointer text-sm transition-all relative ${currentSessionId === s.id ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200' : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
              <div className="font-medium truncate pr-6">{s.title}</div><div className="text-xs opacity-70 mt-1">{new Date(s.timestamp).toLocaleDateString()}</div>
              <button onClick={(e) => deleteSession(e, s.id)} className="absolute right-2 top-3 opacity-0 group-hover:opacity-100 hover:text-red-500"><Trash2 size={14}/></button>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3 mb-3"><div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs">{user.username.charAt(0)}</div><div><div className="text-sm font-medium">{user.username}</div><div className="text-xs text-green-600 dark:text-green-400 font-bold flex items-center gap-1"><Sparkles size={10}/> 公测中</div></div></div>
          <button onClick={() => setShowBetaModal(true)} className="w-full text-xs bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700 py-1.5 rounded-lg font-medium">查看公测权益</button>
        </div>
      </div>

      {/* 主内容 */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <header className="h-14 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur flex items-center justify-between px-4 z-10">
          <div className="flex items-center gap-3"><button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><Menu size={20}/></button><h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 hidden sm:block">AI 对比助手</h1></div>
          <button onClick={() => {if(confirm('清空？')){localStorage.removeItem('ai_compare_sessions');setSessions([]);createNewSession();}}} className="text-xs text-gray-500 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">清空历史</button>
        </header>
        
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {Object.values(models).map(model => (
            <div key={model.name} className={`flex-1 flex flex-col min-w-0 border-r border-gray-200 dark:border-gray-800 last:border-0 ${activeTab === model.name ? 'flex' : 'hidden md:flex'}`}>
              <div className="h-10 flex items-center justify-between px-4 bg-white/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
                <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${model.colorClass}`}/><span className="font-semibold text-sm">{model.name}</span></div>
                <div className="flex items-center gap-1">
                  {model.isLoading ? <button onClick={() => stopGeneration(model.name)} className="text-red-500 hover:bg-red-50 p-1 rounded"><X size={16}/></button> : model.error ? <button onClick={() => retryModel(model.name)} className="text-orange-500 hover:bg-orange-50 p-1 rounded"><RefreshCw size={14}/></button> : null}
                  {model.isLoading && !model.error && <Loader2 size={14} className="animate-spin text-indigo-500"/>}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {model.messages.length === 0 ? <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60"><BrainCircuit size={48} strokeWidth={1} className="mb-2"/><span className="text-sm">准备就绪</span></div> : model.messages.map(msg => {
                  const isSelected = selectedItems.some(i => i.messageId === msg.id);
                  return (
                    <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      {msg.role === 'assistant' && !model.error && <button onClick={(e) => {e.stopPropagation(); toggleSelectMessage(model.name, msg.id, msg.content, model.colorClass);}} className={`absolute -top-3 -right-3 z-10 px-3 py-1.5 rounded-full shadow-lg border text-xs font-bold transition-all ${isSelected ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:text-indigo-600'}`}>{isSelected ? '已选' : '对比'}</button>}
                      <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : model.error ? 'bg-red-50 dark:bg-red-900/20 text-red-700 border border-red-200 dark:border-red-800 rounded-bl-none w-full' : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-bl-none w-full'}`}>
                        {model.error ? <div><div className="font-bold flex items-center gap-2"><AlertCircle size={16}/> 失败</div><div className="text-xs mt-1 opacity-90">{msg.content}</div><button onClick={() => retryModel(model.name)} className="mt-2 text-xs bg-red-100 text-red-700 px-2 py-1 rounded">重试</button></div> : msg.role === 'assistant' ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: ({node, inline, className, children, ...props}: any) => { const match = /language-(\w+)/.exec(className || ''); return inline ? <code {...props}>{children}</code> : <CodeBlock language={match?.[1]}>{String(children).replace(/\n$/, '')}</CodeBlock>; } }}>{msg.content}</ReactMarkdown> : <div className="whitespace-pre-wrap">{msg.content}</div>}
                      </div>
                    </div>
                  );
                })}
                <div ref={el => scrollRefs.current[model.name] = el} />
              </div>
            </div>
          ))}
        </div>

        {/* 输入区 */}
        <div className="p-4 bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 z-10">
          {selectedItems.length > 0 && (
            <div className="mb-3 flex items-center justify-between bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg px-3 py-2 animate-in slide-in-from-bottom-2">
              <div className="flex items-center gap-2 overflow-x-auto max-w-[70%]">
                <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 whitespace-nowrap">已选 {selectedItems.length}/3</span>
                {selectedItems.map(item => <span key={item.messageId} className="inline-flex items-center gap-1 px-2 py-1 bg-white dark:bg-gray-800 rounded text-xs border border-indigo-200 dark:border-indigo-700">{item.modelName} <button onClick={() => toggleSelectMessage(item.modelName, item.messageId, '', '')}><X size={12}/></button></span>)}
              </div>
              <div className="flex gap-2"><button onClick={() => setIsCompareViewOpen(true)} className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700">查看对比</button><button onClick={() => setSelectedItems([])} className="text-xs text-gray-500 hover:text-red-500">清空</button></div>
            </div>
          )}
          <div className="flex flex-col gap-3 max-w-4xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1">{responseOptions.map(opt => { const Icon = opt.icon; const isActive = responseLength === opt.value; return (<button key={opt.value} onClick={() => setResponseLength(opt.value)} className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all flex items-center gap-1.5 ${isActive ? opt.activeColor : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50'}`}><Icon size={12}/> {opt.label}</button>); })}</div>
              <div className="flex gap-1 overflow-x-auto pb-1">{PROMPT_TEMPLATES.map(tpl => (<button key={tpl.label} onClick={(e) => handleSubmit(e, tpl.text)} disabled={isAnyLoading} className="px-3 py-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:border-indigo-300 transition-all whitespace-nowrap disabled:opacity-50">{tpl.label}</button>))}</div>
            </div>
            <div className="relative flex items-end gap-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl p-2 focus-within:ring-2 focus-within:ring-indigo-500 transition-all">
              <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => {if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSubmit();}}} placeholder={isAnyLoading?"生成中...":"输入问题，对比三家模型..."} disabled={isAnyLoading} className="w-full bg-transparent border-none focus:ring-0 text-sm max-h-32 min-h-[44px] resize-none py-2.5 px-2 text-gray-800 dark:text-gray-100 placeholder-gray-400" rows={1}/>
              <button onClick={() => handleSubmit()} disabled={!input.trim()||isAnyLoading} className="p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-lg transition-colors shadow-sm shrink-0">{isAnyLoading?<Loader2 size={18} className="animate-spin"/>:<ChevronRight size={18}/>}</button>
            </div>
          </div>
        </div>

        {/* 对比视图 */}
        {isCompareViewOpen && (
          <div className="absolute inset-0 z-30 bg-gray-50 dark:bg-gray-900 flex flex-col animate-in fade-in slide-in-from-bottom-4">
            <div className="h-14 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 bg-white dark:bg-gray-950">
              <h2 className="text-lg font-bold flex items-center gap-2"><Trophy className="text-yellow-500"/> 深度对比</h2>
              <div className="flex gap-2"><button onClick={()=>{setSelectedItems([]);setIsCompareViewOpen(false);}} className="text-xs text-gray-500 hover:text-red-500 px-3 py-1.5">清空</button><button onClick={()=>setIsCompareViewOpen(false)} className="text-white bg-gray-700 hover:bg-gray-600 px-4 py-1.5 rounded-lg text-sm">关闭</button></div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {!compareJudgeResult && !isComparingJudging && compareScoreData.length===0 ? (
                <div className="h-full flex flex-col items-center justify-center"><button onClick={handleCompareJudge} className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-full shadow-xl hover:shadow-2xl hover:scale-105 transition-all font-bold text-lg flex items-center gap-3"><BrainCircuit size={24}/> 启动 AI 评委 <span className="text-xs bg-white/20 px-2 py-1 rounded">公测免费</span></button></div>
              ) : (
                <div className="space-y-6 max-w-5xl mx-auto">
                  {isComparingJudging && compareScoreData.length===0 && <div className="text-center py-20"><Loader2 size={48} className="animate-spin text-indigo-600 mx-auto mb-4"/><h3 className="text-xl font-bold">分析中...</h3><p className="text-gray-500 mt-2">{judgeTimer}s</p></div>}
                  {compareScoreData.length>0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                      <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><BarChart3 size={20}/> 多维评分</h3>
                      <div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><RadarChart data={radarChartData}><PolarGrid stroke="#e5e7eb"/><PolarAngleAxis dataKey="subject" tick={{fill:'#6b7280',fontSize:12}}/><PolarRadiusAxis angle={30} domain={[0,5]} tick={false} axisLine={false}/>{compareScoreData.map((entry,i)=><Radar key={entry.name} name={entry.name} dataKey={entry.name} stroke={i===0?'#F59E0B':'#6366f1'} fill={i===0?'#F59E0B':'#6366f1'} fillOpacity={0.3}/>)}<Tooltip/><Legend/></RadarChart></ResponsiveContainer></div>
                      <div className="mt-4 space-y-2">{compareScoreData.map((score,i)=><div key={score.name} className={`flex items-center justify-between p-3 rounded-lg border ${score.isBest?'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800':'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700'}`}><div className="flex items-center gap-3">{score.isBest&&<Trophy size={16} className="text-yellow-500"/>}<span className="font-bold">{score.name}</span>{score.shortComment&&<span className="text-xs text-gray-500 bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded">{score.shortComment}</span>}</div><div className="flex items-center gap-4"><div className="flex gap-1">{DEFAULT_DIMENSIONS.map(d=><div key={d.key} className="flex flex-col items-center"><div className="text-[10px] text-gray-400">{d.label[0]}</div><div className="w-2 h-2 rounded-full bg-gray-300 overflow-hidden"><div className="bg-indigo-500 h-full" style={{height:`${(score.scores[d.key]/d.max)*100}%`}}/></div></div>)}</div><span className={`text-lg font-bold ${score.isBest?'text-yellow-600':'text-gray-700 dark:text-gray-300'}`}>{score.total}<span className="text-xs text-gray-400 font-normal">/{DEFAULT_DIMENSIONS.reduce((a,b)=>a+b.max,0)}</span></span></div></div>)}</div>
                    </div>
                  )}
                  {compareJudgeResult && <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"><h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Sparkles size={20} className="text-purple-500"/> 专家点评</h3><div className="prose dark:prose-invert max-w-none text-sm"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: ({node, inline, className, children, ...props}: any) => { const match = /language-(\w+)/.exec(className || ''); return inline ? <code {...props}>{children}</code> : <CodeBlock language={match?.[1]}>{String(children).replace(/\n$/, '')}</CodeBlock>; } }}>{compareJudgeResult}</ReactMarkdown></div></div>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 公告模态框 */}
      {showBetaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={()=>{setShowBetaModal(false);if(typeof window!=='undefined')localStorage.setItem('beta_modal_seen_v2','true');}}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full border border-gray-200 dark:border-gray-800 relative overflow-hidden" onClick={e=>e.stopPropagation()}>
            <button onClick={()=>{setShowBetaModal(false);if(typeof window!=='undefined')localStorage.setItem('beta_modal_seen_v2','true');}} className="absolute top-4 right-4 p-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors z-10"><X size={18} className="text-gray-500 dark:text-gray-400"/></button>
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg transform rotate-3"><Gift size={32} className="text-white"/></div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">🎉 系统公测开启</h2>
              <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm leading-relaxed">感谢参与内测！即日起，<strong className="text-indigo-600 dark:text-indigo-400">AI 评委</strong>、<strong className="text-indigo-600 dark:text-indigo-400">方案融合</strong>及<strong className="text-indigo-600 dark:text-indigo-400">无限次对比</strong>功能全部免费开放。</p>
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6 text-left"><div className="flex items-start gap-3"><CheckCircle size={20} className="text-green-600 dark:text-green-400 shrink-0 mt-0.5"/><div className="text-sm text-green-800 dark:text-green-200"><p className="font-bold mb-1">当前权益：</p><ul className="list-disc list-inside space-y-1 opacity-90"><li>无限次 AI 深度评委</li><li>无限次 终极方案融合</li><li>无需积分，直接可用</li></ul></div></div></div>
              <button onClick={()=>{setShowBetaModal(false);if(typeof window!=='undefined')localStorage.setItem('beta_modal_seen_v2','true');}} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5">开始体验 →</button>
              <p className="text-xs text-gray-400 mt-4">正式商业化即将上线，敬请期待</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}