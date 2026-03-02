// app/page.tsx
'use client';
// Force Rebuild Fix Ref Bug

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Trophy, Sparkles, CheckCircle, Copy, Check, Scale, BrainCircuit, AlertCircle, RefreshCw, Star, Clock, Loader2, X, Trash2, MessageSquarePlus, History, Square, Gift, Rocket } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend, Tooltip } from 'recharts';

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
type Session = { id: string; title: string; timestamp: number; models: Record<string, ModelData>; judgeResult: string | null; };
type Dimension = { key: string; label: string; max: 5 };
type ResponseLength = 'brief' | 'concise' | 'standard' | 'detailed';
type ModelScore = { name: string; scores: Record<string, number>; total: number; isBest?: boolean; shortComment?: string; };
type UserPlan = 'free' | 'pro';
type UserData = { isLoggedIn: boolean; username?: string; plan: UserPlan; planExpiry?: number; credits: number; };
type AppSettings = { dimensions: Dimension[]; apiKeys: Record<string, string>; };

const DEFAULT_DIMENSIONS: Dimension[] = [
  { key: 'accuracy', label: '准确性', max: 5 },
  { key: 'codeQuality', label: '代码质量', max: 5 },
  { key: 'logic', label: '逻辑性', max: 5 },
  { key: 'creativity', label: '创新性', max: 5 },
];

const PROMPT_TEMPLATES = [
  { label: '💻 写代码', text: '请作为一名资深工程师，用最佳实践编写代码。要求：代码健壮、有注释、考虑边界情况。' },
  { label: '📝 润色文章', text: '请作为一名专业编辑，润色以下文本。要求：语言流畅、用词精准、逻辑清晰，保持原意但提升可读性。' },
  { label: '📊 数据分析', text: '请作为一名数据分析师，帮我分析以下数据/现象。要求：给出关键洞察、潜在原因及可执行建议。' },
  { label: '🎭 角色扮演', text: '请作为一名行业专家，用专业且易懂的语言解答我的问题。可以适当使用比喻。' },
];

const CodeBlock = ({ language, children }: { language: string | undefined; children: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => { navigator.clipboard.writeText(children); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <div className="my-4 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-md group">
      <div className="flex justify-between items-center px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs font-mono text-gray-500 dark:text-gray-400 uppercase tracking-wider">{language || '代码'}</span>
        <button onClick={handleCopy} className="text-xs text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center gap-1 font-medium">
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {copied ? '已复制' : '复制'}
        </button>
      </div>
      <SyntaxHighlighter language={language || 'text'} style={vscDarkPlus} customStyle={{ margin: 0, borderRadius: 0, fontSize: '0.85rem', lineHeight: '1.6' }} wrapLines={true} showLineNumbers={true}>{children}</SyntaxHighlighter>
    </div>
  );
};

const EmojiIcon = ({ emoji }: { emoji: string }) => (
  <span className="text-base leading-none">{emoji}</span>
);

export default function Home() {
  const [input, setInput] = useState('');
  // 【调整 2】默认选择 'concise' (简洁回复)
  const [responseLength, setResponseLength] = useState<ResponseLength>('concise');
  const [activeTab, setActiveTab] = useState<string>('通义千问');
  
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

  // 公测模式：默认给用户 Pro 体验
  const [user, setUser] = useState<UserData>({ isLoggedIn: true, username: '公测体验官', plan: 'pro', planExpiry: Date.now() + 7 * 24 * 60 * 60 * 1000, credits: 9999 });
  
  const [settings] = useState<AppSettings>({ dimensions: DEFAULT_DIMENSIONS, apiKeys: { '通义千问': '', 'DeepSeek': '', '豆包': '' } });
  
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  // 【调整 1】新增状态：追踪用户是否已看过公测公告
  const [hasSeenBetaModal, setHasSeenBetaModal] = useState(false);
  
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemMsg, setRedeemMsg] = useState<{type: 'success'|'error', text: string} | null>(null);

  const lastQuestionRef = useRef<string>('');
  const scrollRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const compareViewRef = useRef<HTMLDivElement>(null);

  // 【调整 1】首次进入自动显示公告
  useEffect(() => {
    const seen = localStorage.getItem('beta_modal_seen');
    if (!seen) {
      // 延迟 500ms 弹出，避免与页面加载动画冲突
      setTimeout(() => {
        setShowUpgradeModal(true);
        setHasSeenBetaModal(true);
        localStorage.setItem('beta_modal_seen', 'true');
      }, 500);
    } else {
      setHasSeenBetaModal(true);
    }

    const savedUser = localStorage.getItem('ai_user_data');
    if (savedUser) setUser(JSON.parse(savedUser));
    const saved = localStorage.getItem('ai_compare_sessions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const cleanedModels: Record<string, ModelData> = {};
        Object.keys(parsed[0].models).forEach(key => {
          cleanedModels[key] = { ...parsed[0].models[key], abortController: null };
        });
        parsed[0].models = cleanedModels;
        setSessions(parsed);
        if (parsed.length > 0) loadSession(parsed[0].id);
      } catch (e) { console.error(e); }
    }
  }, []);

  const saveUserState = (newUser: UserData) => { setUser(newUser); localStorage.setItem('ai_user_data', JSON.stringify(newUser)); };

  const handleRedeem = () => {
    const code = redeemCode.trim().toUpperCase();
    if (!code) return;
    if (code.startsWith('PRO-') || code.startsWith('CRT-')) {
      setRedeemMsg({ type: 'success', text: '🎉 兑换成功！(公测期间所有功能已免费开放)' });
      setTimeout(() => { setShowUpgradeModal(false); setRedeemMsg(null); setRedeemCode(''); }, 2000);
    } else {
      setRedeemMsg({ type: 'error', text: '❌ 无效的兑换码' });
    }
  };

  const saveCurrentSession = useCallback(() => {
    const hasContent = Object.values(models).some(m => m.messages.length > 0);
    if (!hasContent) return;
    const modelsToSave: Record<string, ModelData> = {};
    Object.keys(models).forEach(k => {
      const { abortController, ...rest } = models[k];
      modelsToSave[k] = rest;
    });

    const title = models['通义千问'].messages.find(m => m.role === 'user')?.content.slice(0, 20) + '...' || '新会话';
    const sessionId = currentSessionId || Date.now().toString();
    const newSession: Session = { id: sessionId, title, timestamp: Date.now(), models: modelsToSave, judgeResult: compareJudgeResult };
    setSessions(prev => {
      let filtered = prev.filter(s => s.id !== sessionId);
      const updated = [newSession, ...filtered];
      localStorage.setItem('ai_compare_sessions', JSON.stringify(updated));
      return updated;
    });
    setCurrentSessionId(sessionId);
  }, [models, compareJudgeResult, currentSessionId]);

  useEffect(() => { const timer = setTimeout(() => saveCurrentSession(), 1000); return () => clearTimeout(timer); }, [models, compareJudgeResult, saveCurrentSession]);

  const loadSession = (id: string) => {
    const session = sessions.find(s => s.id === id);
    if (session) {
      const restoredModels: Record<string, ModelData> = {};
      Object.keys(session.models).forEach(k => {
        restoredModels[k] = { ...session.models[k], abortController: null, isLoading: false };
      });
      setModels(restoredModels);
      setCompareScoreData([]); 
      setCompareJudgeResult(session.judgeResult); 
      setCompareFusionResult(null);
      setCurrentSessionId(session.id);
      setSelectedItems([]); 
      setIsCompareViewOpen(false);
      if (typeof window !== 'undefined' && window.innerWidth < 768) setIsSidebarOpen(false);
    }
  };

  const createNewSession = () => {
    stopAllGenerations();
    setModels({
      '通义千问': { name: '通义千问', messages: [], isLoading: false, colorClass: 'bg-purple-500', gradientClass: 'from-purple-500 to-indigo-500', abortController: null },
      'DeepSeek': { name: 'DeepSeek', messages: [], isLoading: false, colorClass: 'bg-blue-500', gradientClass: 'from-blue-500 to-cyan-500', abortController: null },
      '豆包': { name: '豆包', messages: [], isLoading: false, colorClass: 'bg-emerald-500', gradientClass: 'from-emerald-500 to-teal-500', abortController: null },
    });
    setCompareScoreData([]);
    setCompareJudgeResult(null);
    setCompareFusionResult(null);
    setSelectedItems([]);
    setIsCompareViewOpen(false);
    setIsComparingJudging(false);
    setIsComparingFusing(false);
    setCurrentSessionId(null); 
    setInput('');
    if (typeof window !== 'undefined' && window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if(!confirm('确定删除？')) return;
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    localStorage.setItem('ai_compare_sessions', JSON.stringify(updated));
    if (currentSessionId === id) { if (updated.length > 0) loadSession(updated[0].id); else createNewSession(); }
  };

  const stopGeneration = (modelName: string) => {
    const model = models[modelName];
    if (model.abortController) {
      model.abortController.abort();
      setModels(prev => ({
        ...prev,
        [modelName]: { ...prev[modelName], isLoading: false, abortController: null, error: '用户已停止生成' }
      }));
    }
  };

  const stopAllGenerations = () => {
    let hasStopped = false;
    Object.keys(models).forEach(key => {
      if (models[key].abortController) {
        models[key].abortController!.abort();
        hasStopped = true;
      }
    });
    if (hasStopped) {
      setModels(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(key => {
          if (next[key].isLoading) {
            next[key] = { ...next[key], isLoading: false, abortController: null, error: '用户已停止生成' };
          }
        });
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent, templateText?: string) => {
    e.preventDefault();
    const finalInput = templateText || input.trim();
    if (!finalInput) return;

    if (Object.values(models).some(m => m.isLoading)) {
      stopAllGenerations();
      return;
    }

    lastQuestionRef.current = finalInput;

    let lengthConstraint = "";
    switch (responseLength) {
      case 'brief': lengthConstraint = "\n\n[重要要求]: 请极度精简，仅输出核心结论或最终答案，去除所有铺垫、解释和废话。控制在 50 字以内。"; break;
      case 'concise': lengthConstraint = "\n\n[重要要求]: 请简洁回复，直接给出关键点和必要步骤，去除冗余铺垫。控制在 150 字以内。"; break;
      case 'standard': lengthConstraint = "\n\n[重要要求]: 请提供标准回复，包含清晰的步骤、必要的解释和适度的示例。保持结构完整，篇幅适中。"; break;
      case 'detailed': lengthConstraint = "\n\n[重要要求]: 请提供详尽的深度回复。必须包含：1. 核心原理分析 2. 完整的代码示例或详细步骤 3. 边界情况处理 4. 扩展思考或最佳实践。不要吝啬篇幅，越详细越好。"; break;
    }

    if (!templateText) setInput('');
    
    setCompareScoreData([]);
    setCompareJudgeResult(null);
    setCompareFusionResult(null);
    setSelectedItems([]);
    setIsCompareViewOpen(false);
    setIsComparingJudging(false);
    setIsComparingFusing(false);

    const timestamp = Date.now();
    const controllers: Record<string, AbortController> = {};
    Object.keys(models).forEach(key => { controllers[key] = new AbortController(); });

    setModels(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => {
        next[key] = {
          ...next[key],
          messages: [...next[key].messages, { role: 'user', content: finalInput, id: `${key}-${timestamp}-u` }, { role: 'assistant', content: '', id: `${key}-${timestamp}-a` }],
          isLoading: true, 
          error: undefined,
          abortController: controllers[key]
        };
      });
      return next;
    });

    const promises = Object.keys(models).map(async (modelName) => {
      const controller = controllers[modelName];
      const apiKey = settings.apiKeys[modelName];
      
      if (!apiKey || apiKey.length < 10) {
        setModels(prev => ({
          ...prev, [modelName]: { 
            ...prev[modelName], 
            messages: prev[modelName].messages.map(m => m.id === `${modelName}-${timestamp}-a` ? {...m, content: `⚠️ 未配置 ${modelName} API Key。`} : m),
            isLoading: false, error: 'Missing API Key', abortController: null
          }
        }));
        return;
      }

      try {
      let url = '', body = {}, headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const fullPrompt = finalInput + lengthConstraint;

        if (modelName === 'DeepSeek') {
          url = 'https://api.deepseek.com/chat/completions';
          headers = { ...headers, 'Authorization': `Bearer ${apiKey}` };
          body = { model: 'deepseek-chat', messages: models[modelName].messages.filter(m => m.role !== 'system').concat({ role: 'user', content: fullPrompt, id: `temp-${Date.now()}` }), stream: true };
        } else if (modelName === '通义千问') {
          url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
          headers = { ...headers, 'Authorization': `Bearer ${apiKey}` };
          body = { model: 'qwen-plus', messages: models[modelName].messages.filter(m => m.role !== 'system').concat({ role: 'user', content: fullPrompt, id: `temp-${Date.now()}` }), stream: true };
        } else if (modelName === '豆包') {
          url = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
          headers = { ...headers, 'Authorization': `Bearer ${apiKey}` };
          body = { model: 'doubao-seed-2-0-pro-260215', messages: models[modelName].messages.filter(m => m.role !== 'system').concat({ role: 'user', content: fullPrompt, id: `temp-${Date.now()}` }), stream: true };
        }

        const response = await fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body), signal: controller.signal });
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errText.slice(0, 100)}`);
        }
        if (!response.body) throw new Error('No response body');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          for (const line of chunk.split('\n')) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const json = JSON.parse(line.slice(6));
                const content = json.choices?.[0]?.delta?.content || '';
                accumulatedText += content;
                setModels(prev => {
                  if (!prev[modelName].isLoading) return prev;
                  const msgs = [...prev[modelName].messages];
                  const idx = msgs.findIndex(m => m.id === `${modelName}-${timestamp}-a`);
                  if (idx !== -1) msgs[idx].content = accumulatedText;
                  return { ...prev, [modelName]: { ...prev[modelName], messages: msgs } };
                });
              } catch (e) { }
            }
          }
        }
        setModels(prev => ({ ...prev, [modelName]: { ...prev[modelName], isLoading: false, abortController: null } }));
      } catch (error: any) {
        if (error.name === 'AbortError') {
          setModels(prev => ({ ...prev, [modelName]: { ...prev[modelName], isLoading: false, abortController: null, error: '已停止' } }));
        } else {
          setModels(prev => ({ ...prev, [modelName]: { ...prev[modelName], isLoading: false, abortController: null, error: error.message } }));
        }
      }
    });

    await Promise.all(promises);
  };

  const handleCompareJudge = async () => {
    if (selectedItems.length === 0) return;
    setIsComparingJudging(true);
    setCompareJudgeResult(null);
    setCompareScoreData([]);
    setCompareFusionResult(null);
    setJudgeTimer(5);

    const timerInterval = setInterval(() => { setJudgeTimer(prev => (prev <= 1 ? 0 : prev - 1)); }, 1000);
    const currentQuestion = lastQuestionRef.current || "未知问题";

    const judgePrompt = `
      你是一位资深的 AI 模型评估专家。请对比以下 ${selectedItems.length} 个模型对同一问题的回答。
      用户问题：${currentQuestion}
      待评估的回答：
      ${selectedItems.map((item, i) => `--- 模型 ${i+1}: ${item.modelName} ---\n${item.content}`).join('\n')}
      请严格按照以下 JSON 格式返回评估结果（不要包含 markdown 代码块标记，直接返回 JSON）：
      {
        "scores": [
          { "name": "模型名称", "${settings.dimensions[0].key}": 1-5, "${settings.dimensions[1].key}": 1-5, "${settings.dimensions[2].key}": 1-5, "${settings.dimensions[3].key}": 1-5, "shortComment": "简短评语，限 8 个字" }
        ],
        "summary": "详细的点评内容，支持 Markdown。"
      }
    `;

    const apiKey = settings.apiKeys['DeepSeek'] || settings.apiKeys['通义千问'];
    if (!apiKey) { clearInterval(timerInterval); setCompareJudgeResult("❌ 未配置裁判模型 API Key。"); setIsComparingJudging(false); return; }

    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: judgePrompt }], stream: false })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
      const result = JSON.parse(jsonStr);

      if (result.scores) {
        const scoredData = result.scores.map((s: any) => {
          const scoresMap: Record<string, number> = {};
          let total = 0;
          settings.dimensions.forEach(dim => { const val = s[dim.key] || 0; scoresMap[dim.key] = val; total += val; });
          return { name: s.name, scores: scoresMap, total, shortComment: s.shortComment };
        }).sort((a: any, b: any) => b.total - a.total);
        if (scoredData.length > 0) scoredData[0].isBest = true;
        setCompareScoreData(scoredData);
      }
      if (result.summary) setCompareJudgeResult(result.summary);
    } catch (error: any) {
      setCompareJudgeResult(`❌ 评分生成失败：${error.message}`);
    } finally {
      clearInterval(timerInterval); setIsComparingJudging(false); setJudgeTimer(0);
    }
  };

  const retryModel = (modelName: string) => {
    const lastUserMsg = models[modelName].messages.filter(m => m.role === 'user').pop();
    if (lastUserMsg) {
      setModels(prev => ({
        ...prev, 
        [modelName]: { 
          ...prev[modelName], 
          messages: prev[modelName].messages.filter(m => !(m.id.includes('-a') && (m.content === '' || m.content === '已停止' || m.content.startsWith('⚠️') || m.content.startsWith('HTTP')))), 
          isLoading: false, error: undefined 
        } 
      }));
      handleSubmit(new MouseEvent('submit') as any, lastUserMsg.content);
    }
  };

  const handleCompareFusion = async () => {
    if (compareScoreData.length === 0) return;
    setIsComparingFusing(true); setCompareFusionResult(null); setFusionTimer(5);
    const timerInterval = setInterval(() => { setFusionTimer(prev => (prev <= 1 ? 0 : prev - 1)); }, 1000);

    const fusePrompt = `
      你是一位全能型专家。请综合以下 ${selectedItems.length} 个模型的回答，生成一个“终极融合方案”。
      用户问题：${lastQuestionRef.current}
      参考回答：
      ${selectedItems.map(item => `--- ${item.modelName} ---\n${item.content}`).join('\n\n')}
      要求：取长补短，格式完美。直接输出最终结果，使用 Markdown 格式。
    `;

    const apiKey = settings.apiKeys['DeepSeek'] || settings.apiKeys['通义千问'];
    if (!apiKey) { clearInterval(timerInterval); setCompareFusionResult("❌ 未配置 API Key。"); setIsComparingFusing(false); return; }

    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: fusePrompt }], stream: false })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setCompareFusionResult(data.choices?.[0]?.message?.content || '');
    } catch (error: any) {
      setCompareFusionResult(`❌ 融合失败：${error.message}`);
    } finally {
      clearInterval(timerInterval); setIsComparingFusing(false); setFusionTimer(0);
    }
  };

  const toggleSelectMessage = (modelName: string, messageId: string, content: string, colorClass: string) => {
    setSelectedItems(prev => {
      const existsIndex = prev.findIndex(item => item.messageId === messageId);
      if (existsIndex !== -1) return prev.filter(item => item.messageId !== messageId);
      if (prev.length >= 3) { setTimeout(() => alert("最多选 3 条"), 0); return prev; }
      return [...prev, { modelName, messageId, content, colorClass }];
    });
  };

  const clearAllSelections = () => setSelectedItems([]);

  const radarChartData = settings.dimensions.map(dim => {
    const dataPoint: any = { subject: dim.label };
    compareScoreData.forEach(model => { dataPoint[model.name] = model.scores[dim.key] || 0; });
    return dataPoint;
  });

  const responseOptions = [
    { value: 'brief', label: '简要回复', icon: (props: any) => <EmojiIcon emoji="🚲" />, color: 'text-gray-500', activeColor: 'bg-gray-100 border-gray-300 text-gray-700 dark:bg-gray-700 dark:border-gray-500 dark:text-gray-200' },
    { value: 'concise', label: '简洁回复', icon: (props: any) => <EmojiIcon emoji="🏎️" />, color: 'text-blue-500', activeColor: 'bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900/40 dark:border-blue-700 dark:text-blue-300' },
    { value: 'standard', label: '标准回复', icon: (props: any) => <EmojiIcon emoji="✈️" />, color: 'text-indigo-500', activeColor: 'bg-indigo-100 border-indigo-300 text-indigo-700 dark:bg-indigo-900/40 dark:border-indigo-700 dark:text-indigo-300' },
    { value: 'detailed', label: '详细回复', icon: (props: any) => <EmojiIcon emoji="🛸" />, color: 'text-purple-500', activeColor: 'bg-purple-100 border-purple-300 text-purple-700 dark:bg-purple-900/40 dark:border-purple-700 dark:text-purple-300' },
  ];

  const isAnyLoading = Object.values(models).some(m => m.isLoading);

  return (
    <div className="flex h-screen bg-[var(--background)] overflow-hidden">
      {/* --- 侧边栏 --- */}
      <div className={`${isSidebarOpen ? 'w-64' : 'w-0'} transition-all duration-300 ease-in-out bg-white dark:bg-[#0F172A] border-r border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden relative z-40`}>
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 min-w-[16rem]">
          <button onClick={createNewSession} className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl transition-all shadow-md hover:shadow-lg active:scale-95 font-medium text-sm">
            <MessageSquarePlus className="w-4 h-4" /><span>新对话</span>
          </button>
        </div>
        <div className="flex-grow overflow-y-auto p-2 space-y-1 min-w-[16rem]">
          <div className="px-3 py-2 flex items-center gap-2 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            <History className="w-3.5 h-3.5" /><span>历史记录</span>
          </div>
          {sessions.length === 0 ? <p className="text-xs text-gray-400 text-center mt-4">暂无历史记录</p> : sessions.map(session => (
            <div key={session.id} onClick={() => loadSession(session.id)} className={`group p-3 rounded-lg cursor-pointer text-sm transition-all ${currentSessionId === session.id ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 border border-transparent'}`}>
              <div className="font-medium truncate">{session.title}</div>
              <div className="text-[10px] opacity-60 mt-1 flex justify-between"><span>{new Date(session.timestamp).toLocaleDateString()}</span><button onClick={(e) => deleteSession(e, session.id)} className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity">🗑️</button></div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 min-w-[16rem] bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30 space-y-2">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 truncate max-w-[100px]">{user.username}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 animate-pulse">BETA</span>
            </div>
            <div className="flex justify-between items-center text-xs text-indigo-600 dark:text-indigo-400 font-medium">
              <span>✨ 公测无限体验中</span>
            </div>
            <button onClick={() => setShowUpgradeModal(true)} className="w-full text-xs bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700 py-1.5 rounded-lg transition-colors font-medium shadow-sm">
              查看公测计划
            </button>
          </div>
        </div>
      </div>

      {/* --- 主内容区 --- */}
      <div className="flex-grow flex flex-col min-w-0 relative">
        <header className="sticky top-0 z-30 bg-white/80 dark:bg-[#0F172A]/90 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-700/50 px-4 py-3 shadow-sm flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-600 dark:text-gray-300"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg></button>
            <div className="hidden md:block">
              <h1 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
                AI 对比助手 <span className="text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 px-2 py-0.5 rounded-full uppercase">Public Beta</span>
              </h1>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase">Real-time Evaluation • Smart Fusion</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
             <button onClick={() => { if(!confirm('确定清空？')) return; localStorage.removeItem('ai_compare_sessions'); setSessions([]); createNewSession(); }} className="text-xs font-semibold text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">清空</button>
          </div>
        </header>

        <div className="flex-grow p-4 md:p-6 overflow-y-auto pb-10">
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
            {Object.values(models).map((model) => {
              const isMobileActive = activeTab === model.name;
              return (
                <div key={model.name} className={`flex flex-col bg-white dark:bg-[#1E293B] rounded-2xl shadow-xl border border-white/20 dark:border-gray-700 overflow-hidden transition-all ${isMobileActive ? 'flex' : 'hidden'} md:flex`}>
                  <div className="relative px-5 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 shrink-0">
                    <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${model.gradientClass} opacity-90`}></div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2.5"><div className={`w-2.5 h-2.5 rounded-full bg-gradient-to-r ${model.gradientClass}`}></div><h2 className="font-bold text-sm text-gray-700 dark:text-gray-200">{model.name}</h2></div>
                      <div className="flex items-center gap-2">
                        {model.isLoading && (
                          <button onClick={() => stopGeneration(model.name)} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-1.5 rounded-full transition-colors" title="停止此模型">
                            <Square className="w-4 h-4 fill-current" />
                          </button>
                        )}
                        {!model.isLoading && model.error && (
                          <button onClick={() => retryModel(model.name)} className="text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 p-1 rounded" title="重试">
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        )}
                         {model.isLoading && !model.error && (
                           <div className="flex gap-1"><span className={`w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce`}></span><span className={`w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce delay-100`}></span><span className={`w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce delay-200`}></span></div>
                         )}
                      </div>
                    </div>
                  </div>
                  <div className="flex-grow p-5 space-y-6">
                    {model.messages.length === 0 ? (
                      <div className="h-40 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 opacity-60">
                        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${model.gradientClass} bg-opacity-10 flex items-center justify-center mb-3`}><div className={`w-6 h-6 rounded-full bg-gradient-to-br ${model.gradientClass}`}></div></div>
                        <p className="text-sm font-medium">准备就绪</p>
                      </div>
                    ) : (
                      model.messages.map((msg) => {
                        const isSelected = selectedItems.some(item => item.messageId === msg.id);
                        return (
                          <div key={msg.id} className={`group relative flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.role === 'assistant' && !model.error && (
                              <button type="button" onClick={(e) => { e.stopPropagation(); toggleSelectMessage(model.name, msg.id, msg.content, model.colorClass); }} className={`absolute -top-3 -right-3 z-10 px-3 py-1.5 rounded-full shadow-lg border flex items-center gap-1.5 transition-all duration-200 text-xs font-bold ${isSelected ? 'bg-indigo-600 text-white border-indigo-600 scale-105' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:text-indigo-600 hover:border-indigo-300'}`}>
                                <Scale className="w-3.5 h-3.5" /> <span>{isSelected ? '已选' : '加入对比'}</span>
                              </button>
                            )}
                            <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-[0.95rem] leading-relaxed shadow-sm transition-all duration-200 ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : isSelected ? 'bg-indigo-50 dark:bg-indigo-900/20 text-gray-800 dark:text-gray-200 rounded-bl-none border-2 border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-900' : model.error ? 'bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-bl-none' : 'bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-none border border-gray-100 dark:border-gray-700 prose prose-sm max-w-none dark:prose-invert'}`}>
                              {model.error && msg.role === 'assistant' ? (
                                <div className="flex flex-col gap-2">
                                  <span className="font-bold flex items-center gap-2"><AlertCircle className="w-4 h-4"/> {msg.content === '已停止' ? '生成已停止' : '请求失败'}</span>
                                  <p className="text-sm">{msg.content !== '已停止' ? msg.content : '您手动停止了本次生成。'}</p>
                                  {msg.content !== '已停止' && <button onClick={() => retryModel(model.name)} className="self-start text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-3 py-1 rounded">点击重试</button>}
                                </div>
                              ) : msg.role === 'assistant' ? (
                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: ({ node, inline, className, children }: any) => { const match = /language-(\w+)/.exec(className || ''); const lang = match ? match[1] : ''; const content = String(children).replace(/\n$/, ''); if (inline) return <code className="bg-indigo-100 dark:bg-indigo-900/40 text-pink-600 dark:text-pink-400 px-1.5 py-0.5 rounded text-xs font-mono font-semibold">{children}</code>; return <CodeBlock language={lang}>{content}</CodeBlock>; }, table: ({children}) => <div className="overflow-x-auto"><table className="min-w-full border border-gray-200 dark:border-gray-700 text-sm rounded-lg overflow-hidden">{children}</table></div>, th: ({children}) => <th className="border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700/50 p-2.5 text-left font-bold text-xs uppercase">{children}</th>, td: ({children}) => <td className="border border-gray-200 dark:border-gray-700 p-2.5">{children}</td> }}>{msg.content}</ReactMarkdown>
                              ) : (<p className="whitespace-pre-wrap font-medium">{msg.content}</p>)}
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={(el) => { scrollRefs.current[model.name] = el; }}/>
                  </div>
                </div>
              );
            })}
          </div>
          
           {isCompareViewOpen && (
            <div ref={compareViewRef} className="fixed inset-0 z-50 bg-gray-900/90 backdrop-blur-sm flex flex-col animate-fade-in compare-view-content">
              <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-900 shrink-0">
                <h2 className="text-white font-bold text-lg flex items-center gap-2"><Scale className="w-6 h-6" /> 深度对比视图</h2>
                <div className="flex gap-3">
                   <button onClick={clearAllSelections} className="text-xs text-gray-400 hover:text-white underline">清空所选</button>
                   <button onClick={() => setIsCompareViewOpen(false)} className="text-white bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors">关闭视图</button>
                </div>
              </div>
              <div className="flex-grow overflow-auto p-6">
                <div className="max-w-7xl mx-auto mb-10 space-y-6">
                  {!compareJudgeResult && !isComparingJudging && compareScoreData.length === 0 && (
                    <div className="flex justify-center py-8">
                      <button onClick={handleCompareJudge} className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-full shadow-xl hover:shadow-2xl hover:scale-105 transition-all font-bold text-lg flex items-center gap-3">
                        <BrainCircuit className="w-6 h-6" /> 启动 AI 评委 <span className="text-xs bg-white/20 px-2 py-1 rounded ml-2">公测免费</span>
                      </button>
                    </div>
                  )}
                  {(isComparingJudging || compareJudgeResult || compareScoreData.length > 0) && (
                    <div className="space-y-6 animate-fade-in-up">
                      {isComparingJudging && compareScoreData.length === 0 && (
                        <div className="bg-white dark:bg-[#1E293B] rounded-2xl shadow-xl border border-indigo-100 dark:border-indigo-900 p-12 flex flex-col items-center justify-center text-center min-h-[300px]">
                          <div className="relative mb-6"><div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 animate-pulse rounded-full"></div><Clock className="w-16 h-16 text-indigo-600 dark:text-indigo-400 animate-bounce" /></div>
                          <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">AI 评委正在分析中...</h3>
                          <p className="text-gray-500 dark:text-gray-400 mb-6">正在从多维度评估模型表现</p>
                          <div className="text-5xl font-mono font-bold text-indigo-600 dark:text-indigo-400">{judgeTimer > 0 ? judgeTimer : '...'}</div>
                        </div>
                      )}
                      {(!isComparingJudging || compareScoreData.length > 0) && compareScoreData.length > 0 && (
                        <div className="bg-white dark:bg-[#1E293B] rounded-2xl shadow-xl border border-indigo-100 dark:border-indigo-900 overflow-hidden">
                          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-8 py-5 flex justify-between items-center">
                            <h3 className="text-white font-bold text-xl flex items-center gap-2"><Trophy className="w-6 h-6" /> 多维评分看板</h3>
                            <span className="text-xs bg-white/20 px-3 py-1.5 rounded-full text-white font-medium">总分上限 {settings.dimensions.reduce((acc, d) => acc + d.max, 0)}</span>
                          </div>
                          <div className="p-8">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                              <div className="lg:col-span-2 overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead><tr className="border-b-2 border-gray-100 dark:border-gray-700 text-gray-500 dark:text-gray-400"><th className="pb-4 text-left font-bold uppercase tracking-wider w-1/3">模型表现</th><th className="pb-4 text-center font-bold uppercase tracking-wider">各项得分</th><th className="pb-4 text-right font-bold uppercase tracking-wider">总分</th></tr></thead>
                                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {compareScoreData.map((score) => (
                                      <tr key={score.name} className={`transition-colors ${score.isBest ? 'bg-yellow-50/50 dark:bg-yellow-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
                                        <td className="py-5 pr-4"><div className="flex items-center gap-3 mb-2">{score.isBest && <Trophy className="w-5 h-5 text-yellow-500 shrink-0" />}<span className={`font-bold text-lg ${score.isBest ? 'text-yellow-700 dark:text-yellow-400' : 'text-gray-800 dark:text-gray-200'}`}>{score.name}</span></div>{score.shortComment && (<span className={`inline-block px-3 py-1 rounded-full text-xs font-bold border ${score.isBest ? 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-700' : 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'}`}>💡 {score.shortComment}</span>)}</td>
                                        <td className="py-5"><div className="flex flex-col gap-2">{settings.dimensions.map(dim => (<div key={dim.key} className="flex items-center justify-between gap-4 text-xs"><span className="text-gray-500 dark:text-gray-400 w-20 truncate">{dim.label}</span><div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div className={`h-full rounded-full ${score.isBest ? 'bg-yellow-500' : 'bg-indigo-500'}`} style={{ width: `${(score.scores[dim.key] || 0) / dim.max * 100}%` }}></div></div><div className="flex text-yellow-500 w-20 justify-end">{[...Array(dim.max)].map((_, i) => (<Star key={i} className={`w-3 h-3 ${i < (score.scores[dim.key] || 0) ? 'fill-current' : 'text-gray-200 dark:text-gray-700'}`} />))}</div></div>))}</div></td>
                                        <td className="text-right py-5"><div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl text-xl font-bold shadow-sm ${score.isBest ? 'bg-yellow-500 text-white shadow-yellow-500/30' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>{score.total}</div></td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              <div className="lg:col-span-1 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 flex items-center justify-center min-h-[300px]">
                                <ResponsiveContainer width="100%" height={300}><RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarChartData}><PolarGrid stroke="#374151" strokeOpacity={0.3} /><PolarAngleAxis dataKey="subject" tick={{ fill: '#9CA3AF', fontSize: 12, fontWeight: '600' }} /><PolarRadiusAxis angle={30} domain={[0, 5]} tick={false} axisLine={false} />{compareScoreData.map((entry, index) => { const colors = ['#F59E0B', '#3B82F6', '#10B981']; return (<Radar key={entry.name} name={entry.name} dataKey={entry.name} stroke={colors[index % colors.length]} fill={colors[index % colors.length]} fillOpacity={0.4} strokeWidth={2} />); })}<Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#fff', borderRadius: '8px' }} /><Legend wrapperStyle={{ paddingTop: '20px' }} /></RadarChart></ResponsiveContainer>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      {compareJudgeResult && !isComparingJudging && (
                        <div className="bg-white dark:bg-[#1E293B] rounded-2xl shadow-lg border dark:border-gray-700 overflow-hidden">
                          <div className="bg-indigo-50 dark:bg-indigo-900/20 px-6 py-4 border-b border-indigo-100 dark:border-indigo-800"><h3 className="font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-2"><BrainCircuit className="w-5 h-5"/> AI 专家深度点评</h3></div>
                          <div className="p-6 prose dark:prose-invert max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ h3: ({children}) => <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mt-6 mb-3 flex items-center gap-2">{children}</h3>, ul: ({children}) => <ul className="list-disc pl-5 space-y-1 text-gray-600 dark:text-gray-300">{children}</ul>, li: ({children}) => <li className="text-sm">{children}</li>, blockquote: ({children}) => <blockquote className="border-l-4 border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-r-lg italic text-gray-700 dark:text-gray-300 my-4">{children}</blockquote> }}>{compareJudgeResult}</ReactMarkdown></div>
                        </div>
                      )}
                      {!compareFusionResult && !isComparingFusing && compareScoreData.length > 0 && (
                        <div className="flex justify-center py-4"><button onClick={handleCompareFusion} className="px-8 py-4 bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 text-white rounded-full shadow-2xl hover:scale-105 transition-all font-bold text-lg flex items-center gap-3"><Sparkles className="w-6 h-6 animate-pulse" /> 生成终极融合方案 <span className="text-xs bg-white/20 px-2 py-1 rounded ml-2">公测免费</span></button></div>
                      )}
                      {isComparingFusing && !compareFusionResult && (
                         <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-2xl p-12 border border-indigo-200 dark:border-indigo-800 flex flex-col items-center justify-center text-center min-h-[200px]">
                            <div className="relative mb-4"><Loader2 className="w-12 h-12 text-indigo-600 dark:text-indigo-400 animate-spin" /></div>
                            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">正在融合各家精华...</h3>
                            <p className="text-gray-500 dark:text-gray-400 mb-4">提取最优解，生成终极方案</p>
                            <div className="text-4xl font-mono font-bold text-indigo-600 dark:text-indigo-400">{fusionTimer > 0 ? fusionTimer : '...'}</div>
                         </div>
                      )}
                      {compareFusionResult && !isComparingFusing && (
                        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-2xl p-0 border border-indigo-200 dark:border-indigo-800 overflow-hidden">
                          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex justify-between items-center"><h3 className="font-bold text-white flex items-center gap-2"><CheckCircle className="w-5 h-5"/> 终极融合方案</h3><span className="text-xs bg-white/20 px-2 py-1 rounded text-white">集三家之长</span></div>
                          <div className="p-8 max-w-5xl mx-auto"><div className="prose dark:prose-invert text-base bg-white/60 dark:bg-black/20 p-6 rounded-xl shadow-inner max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CodeBlock as any }}>{compareFusionResult}</ReactMarkdown></div></div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                <div className={`grid gap-6 ${selectedItems.length === 1 ? 'grid-cols-1 max-w-3xl mx-auto' : selectedItems.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  {selectedItems.map((item) => (
                    <div key={item.messageId} className="bg-white dark:bg-[#1E293B] rounded-xl shadow-2xl border border-gray-700 flex flex-col overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-700 flex justify-between items-center bg-gradient-to-r from-gray-700 to-gray-600">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${item.colorClass}`}></div>
                          <span className="text-white font-bold text-sm">{item.modelName}</span>
                        </div>
                        <button onClick={() => toggleSelectMessage(item.modelName, item.messageId, '', '')} className="text-white/70 hover:text-white">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                      </div>
                      <div className="p-5 overflow-y-auto prose prose-sm dark:prose-invert max-h-[70vh]">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CodeBlock as any }}>{item.content}</ReactMarkdown>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 p-4 md:p-6 bg-gradient-to-t from-[var(--background)] via-[var(--background)] to-transparent pt-10 z-20 shrink-0">
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-3xl blur opacity-20 group-hover:opacity-30 transition duration-500"></div>
            <div className="relative bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700 shadow-2xl rounded-3xl flex flex-col overflow-hidden">
              {selectedItems.length > 0 && (
                <div className="bg-indigo-50/80 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-800 p-3 animate-fade-in-down">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider flex items-center gap-2">
                      <Scale className="w-3.5 h-3.5" /> 已选对比项 ({selectedItems.length}/3)
                    </span>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setIsCompareViewOpen(true)} className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-md font-medium transition-colors shadow-sm">查看对比视图</button>
                      <button type="button" onClick={clearAllSelections} className="text-xs text-red-500 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/30 px-2 py-1 rounded-md transition-colors flex items-center gap-1"><Trash2 className="w-3 h-3" /> 清空</button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedItems.map((item) => (
                      <div key={item.messageId} className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700 px-2.5 py-1.5 rounded-lg shadow-sm">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${item.colorClass}`}></div>
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate max-w-[100px]">{item.modelName}</span>
                        <button type="button" onClick={(e) => { e.stopPropagation(); toggleSelectMessage(item.modelName, item.messageId, '', ''); }} className="text-gray-400 hover:text-red-500 p-0.5 shrink-0"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2 p-2 overflow-x-auto no-scrollbar border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
                {responseOptions.map((opt) => {
                  const Icon = opt.icon;
                  const isActive = responseLength === opt.value;
                  return (
                    <button key={opt.value} type="button" onClick={() => setResponseLength(opt.value as ResponseLength)} className={`px-3 py-1.5 rounded-full border text-[10px] font-medium transition-all whitespace-nowrap shadow-sm flex items-center gap-1.5 ${isActive ? opt.activeColor : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'}`}>
                      <span className={`flex items-center justify-center ${isActive ? '' : opt.color}`}><Icon /></span>
                      {opt.label}
                    </button>
                  );
                })}
                <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1 self-center"></div>
                {PROMPT_TEMPLATES.map((tpl) => (
                  <button key={tpl.label} type="button" onClick={(e) => handleSubmit(e, tpl.text)} disabled={isAnyLoading} className="px-3 py-1 rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-[10px] font-medium text-gray-600 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:border-indigo-300 transition-all whitespace-nowrap shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">{tpl.label}</button>
                ))}
              </div>
              <div className="flex items-end p-3 gap-3">
                <textarea 
                  value={input} 
                  onChange={(e) => setInput(e.target.value)} 
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }}} 
                  placeholder={isAnyLoading ? "AI 正在生成中... (可点击下方红色按钮停止)" : "请输入问题，AI 将实时对比三家模型的回答..."} 
                  className="w-full bg-transparent border-none focus:ring-0 text-gray-800 dark:text-gray-100 placeholder-gray-400 resize-none max-h-32 min-h-[44px] py-2 px-1 text-base leading-relaxed" 
                  rows={1} 
                  disabled={false} 
                />
                {isAnyLoading ? (
                  <button 
                    type="button" 
                    onClick={stopAllGenerations} 
                    className="shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center bg-red-500 text-white hover:bg-red-600 transition-all duration-200 shadow-md hover:scale-105 active:scale-95 animate-pulse"
                    title="一键终止所有生成"
                  >
                    <Square className="w-5 h-5 fill-current" />
                  </button>
                ) : (
                  <button 
                    type="submit" 
                    disabled={!input.trim()} 
                    className={`shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 shadow-md ${input.trim() ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105 hover:-rotate-12 active:scale-95' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'}`}
                  >
                    <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" /></svg>
                  </button>
                )}
              </div>
            </div>
            <p className="text-center text-[10px] text-gray-400 dark:text-gray-500 mt-2 font-semibold tracking-widest uppercase">Powered by Real-time LLM Evaluation • Public Beta</p>
          </form>
        </div>
      </div>

      {/* --- 公测公告模态框 --- */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-[#1E293B] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-indigo-200 dark:border-gray-700 animate-scale-up">
            <div className="p-0 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-indigo-600 to-purple-600 relative overflow-hidden">
              <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white opacity-10 rounded-full blur-xl"></div>
              <div className="p-6 relative z-10">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                      <Rocket className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">🎉 系统公测中</h3>
                      <p className="text-indigo-100 text-sm mt-1">Public Beta Program</p>
                    </div>
                  </div>
                  <button onClick={() => { setShowUpgradeModal(false); setHasSeenBetaModal(true); localStorage.setItem('beta_modal_seen', 'true'); }} className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-1 transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
                </div>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-xl p-5 text-center">
                <Gift className="w-10 h-10 text-indigo-600 dark:text-indigo-400 mx-auto mb-3" />
                <h4 className="font-bold text-indigo-900 dark:text-indigo-200 text-lg">所有高级功能免费开放</h4>
                <p className="text-sm text-indigo-700 dark:text-indigo-300 mt-2 leading-relaxed">
                  感谢参与内测！在此期间，<strong>AI 评委</strong>、<strong>方案融合</strong>、<strong>无限次对比</strong>等功能均无需积分，尽情体验。
                </p>
              </div>

              <div className="space-y-3">
                <h5 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center">公测权益</h5>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    '✅ 无限次 AI 深度评委',
                    '✅ 无限次 终极方案融合',
                    '✅ 自定义评分维度',
                    '✅ 优先技术支持'
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                      <span className="text-green-500 text-lg">✓</span>
                      <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-2 text-center">拥有内测兑换码？</label>
                <div className="flex gap-2">
                  <input type="text" value={redeemCode} onChange={(e) => setRedeemCode(e.target.value)} placeholder="输入 CODE-XXXXXX" className="flex-grow bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900 dark:text-white" />
                  <button onClick={handleRedeem} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-opacity whitespace-nowrap">兑换</button>
                </div>
                {redeemMsg && (<div className={`mt-2 text-xs font-medium text-center ${redeemMsg.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{redeemMsg.text}</div>)}
                
                <div className="mt-6 text-[10px] text-gray-400 text-center bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg">
                  <p className="font-bold text-gray-500 dark:text-gray-400 mb-1">📅 正式商业化即将上线</p>
                  <p>我们将很快推出 Pro 会员计划。届时您将可以保留数据并享受更多专属服务。敬请期待！</p>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 text-center border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => { setShowUpgradeModal(false); setHasSeenBetaModal(true); localStorage.setItem('beta_modal_seen', 'true'); }} className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-bold transition-colors">开始体验 →</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}