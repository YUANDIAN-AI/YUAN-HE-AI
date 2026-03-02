// app/api/judge/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: '缺少提示词' }, { status: 400 });
    }

    // 1. 智能获取 Key (优先 DeepSeek，其次通义)
    let apiKey = process.env.DEEPSEEK_API_KEY;
    let url = 'https://api.deepseek.com/chat/completions';
    let model = 'deepseek-chat';

    if (!apiKey) {
      apiKey = process.env.DASHSCOPE_API_KEY;
      url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
      model = 'qwen-plus';
    }

    if (!apiKey) {
      return NextResponse.json({ error: '服务器未配置任何可用的 API Key (DeepSeek 或 通义千问)' }, { status: 500 });
    }

    // 2. 构建评委 Prompt
    const body = {
      model: model,
      messages: [
        { 
          role: 'system', 
          content: '你是一位公正、专业且犀利的 AI 评委。请严格按照 JSON 格式返回评分和点评。不要输出 Markdown 代码块标记。' 
        },
        { role: 'user', content: prompt }
      ],
      stream: false, // 评委不需要流式，一次性返回
      temperature: 0.7
    };

    // 3. 发起请求
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API 请求失败: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    
    // 4. 返回结果
    return NextResponse.json({ result: data.choices?.[0]?.message?.content });

  } catch (error: any) {
    console.error('🔴 Judge API 内部错误:', error);
    return NextResponse.json({ error: error.message || '评委服务异常' }, { status: 500 });
  }
}