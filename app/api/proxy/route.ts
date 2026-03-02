import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: '缺少提示词' }, { status: 400 });
    }

    // 1. 获取环境变量
    const rawKey = process.env.DEEPSEEK_API_KEY;

    if (!rawKey) {
      console.error('❌ 错误: 未找到环境变量 DEEPSEEK_API_KEY');
      return NextResponse.json({ error: '服务器未配置 API Key' }, { status: 500 });
    }

    // 2. 智能处理 Key (兼容明文和 Base64)
    let apiKey = rawKey;
    
    // 如果 Key 看起来像 Base64 (只包含字母数字+/=，且长度是4的倍数，且不以 sk- 开头)
    // 则尝试解码。否则直接当作明文使用。
    if (!rawKey.startsWith('sk-') && /^[A-Za-z0-9+/=]+$/.test(rawKey) && rawKey.length % 4 === 0) {
      try {
        // Node.js 环境 (Vercel) 使用 Buffer
        apiKey = Buffer.from(rawKey, 'base64').toString('utf-8');
        console.log('ℹ️ 检测到 Base64 编码 Key，已自动解码');
      } catch (e) {
        console.warn('⚠️ Base64 解码失败，将尝试使用原始字符串作为 Key');
        apiKey = rawKey;
      }
    } else {
      console.log('ℹ️ 检测到明文 Key，直接使用');
    }

    // 3. 最终校验 Key 格式
    if (!apiKey.startsWith('sk-')) {
       // 警告但不阻断，因为有些模型 Key 格式可能不同，但 DeepSeek 必须是 sk-
       console.warn('⚠️ API Key 似乎不是以 sk- 开头，可能导致请求失败。当前前缀:', apiKey.substring(0, 5));
    }

    // 4. 构建请求
    const url = 'https://api.deepseek.com/chat/completions';
    
    const body = {
      model: 'deepseek-chat',
      messages: [
        { 
          role: 'system', 
          content: '你是一位公正、专业且犀利的 AI 评委。你的任务是比较两个 AI 模型的回答。请严格按照以下格式输出：\n1. 简短点评两者的优缺点。\n2. 给出最终获胜者（模型 A 或 模型 B）。\n3. 分别打分（0-100 分）。' 
        },
        { role: 'user', content: prompt }
      ],
      stream: true,
      temperature: 0.7
    };

    // 5. 发起请求
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
      console.error(`❌ DeepSeek API 错误: ${response.status}`, errText);
      throw new Error(`API 请求失败: ${response.status} - ${errText}`);
    }

    // 6. 返回流式响应
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('🔴 Judge API 内部错误:', error);
    return NextResponse.json({ error: error.message || '评委服务异常' }, { status: 500 });
  }
}