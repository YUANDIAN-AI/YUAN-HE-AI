// app/api/judge/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { prompt, modelType } = await req.json();

    // 1. 从环境变量获取 Key (确保在 Vercel Settings -> Environment Variables 中配置了 DEEPSEEK_API_KEY)
    // 如果你想用通义做评委，可以改成 process.env.DASHSCOPE_API_KEY
    const apiKey = process.env.DEEPSEEK_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: '服务器未配置 API Key' }, { status: 500 });
    }

    // 2. 配置请求参数 (默认使用 DeepSeek，因为它性价比高且逻辑强)
    const url = 'https://api.deepseek.com/chat/completions';
    const modelName = 'deepseek-chat';

    // 3. 构建发送给大模型的请求
    const body = {
      model: modelName,
      messages: [
        { 
          role: 'system', 
          content: '你是一位公正、专业且犀利的 AI 评委。你的任务是比较两个 AI 模型的回答。请严格按照以下格式输出：\n1. 简短点评两者的优缺点。\n2. 给出最终获胜者（模型 A 或 模型 B）。\n3. 分别打分（0-100 分）。' 
        },
        { role: 'user', content: prompt }
      ],
      stream: true, // 开启流式输出
      temperature: 0.7
    };

    // 4. 向大模型发起请求
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

    // 5. 将流式数据直接转发给前端
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('Judge API Error:', error);
    return NextResponse.json({ error: error.message || '评委服务异常' }, { status: 500 });
  }
}