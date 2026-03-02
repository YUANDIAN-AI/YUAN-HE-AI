// app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { model, messages, stream } = await req.json();
    
    let url = '';
    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // 1. 根据模型名称，从 Vercel 环境变量中获取对应的 Key
    if (model === 'deepseek-chat') {
      const apiKey = process.env.DEEPSEEK_API_KEY;
      if (!apiKey) return NextResponse.json({ error: 'DeepSeek Key not configured' }, { status: 500 });
      
      url = 'https://api.deepseek.com/chat/completions';
      headers['Authorization'] = `Bearer ${apiKey}`;
    } 
    else if (model === 'qwen-plus') {
      const apiKey = process.env.DASHSCOPE_API_KEY;
      if (!apiKey) return NextResponse.json({ error: 'DashScope Key not configured' }, { status: 500 });
      
      url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
      headers['Authorization'] = `Bearer ${apiKey}`;
    } 
    else if (model === 'doubao-pro-32k') {
      const apiKey = process.env.DOUBAO_API_KEY;
      if (!apiKey) return NextResponse.json({ error: 'Doubao Key not configured' }, { status: 500 });
      
      url = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
      headers['Authorization'] = `Bearer ${apiKey}`;
    } 
    else {
      return NextResponse.json({ error: 'Unsupported model' }, { status: 400 });
    }

    // 2. 向模型商发起请求
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ model, messages, stream }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: `Upstream error: ${errorText}` }, { status: response.status });
    }

    // 3. 将流式数据透传给前端
    // 注意：这里需要处理流式响应，保持 SSE 格式
    const streamResponse = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          // 直接透传原始数据块
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    });

    return new Response(streamResponse, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}