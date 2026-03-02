// app/api/proxy/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, apiKey, model, messages, input, parameters } = body;

    // 构造请求头
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };

    // 构造请求体 (根据模型不同略有差异)
    let requestBody: any = {};
    
    // 兼容通义千问 (DashScope) 和 OpenAI 格式 (DeepSeek/豆包)
    if (input && parameters) {
      // 通义千问格式
      requestBody = { model, input, parameters, stream: true };
    } else if (messages) {
      // OpenAI 兼容格式
      requestBody = { model, messages, stream: true };
    }

    // 发起真实请求
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.message || `API Error: ${response.status}` }, 
        { status: response.status }
      );
    }

    // 【关键】将响应流管道传输回前端
    // 这实现了流式输出，且绕过了浏览器的 CORS 限制
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}