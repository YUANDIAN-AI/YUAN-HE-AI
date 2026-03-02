// app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { prompt, modelType, history } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: '缺少提示词' }, { status: 400 });
    }

    // 1. 根据模型类型获取对应的环境变量 Key (服务器端读取，安全)
    let apiKey = '';
    let url = '';
    let model = '';

    if (modelType === 'DeepSeek') {
      apiKey = process.env.DEEPSEEK_API_KEY || '';
      url = 'https://api.deepseek.com/chat/completions';
      model = 'deepseek-chat';
    } else if (modelType === '通义千问') {
      apiKey = process.env.DASHSCOPE_API_KEY || ''; // 通义的环境变量名
      url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
      model = 'qwen-plus';
    } else if (modelType === '豆包') {
      apiKey = process.env.DOUBAO_API_KEY || ''; // 豆包的环境变量名
      url = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
      model = 'doubao-pro-32k';
    } else {
      return NextResponse.json({ error: '不支持的模型类型' }, { status: 400 });
    }

    if (!apiKey) {
      console.error(`❌ 服务器未配置 ${modelType} 的 API Key`);
      return NextResponse.json({ error: `服务器未配置 ${modelType} 密钥，请联系管理员` }, { status: 500 });
    }

    // 2. 构建请求体
    const body = {
      model: model,
      messages: [
        ...history, // 历史对话上下文
        { role: 'user', content: prompt }
      ],
      stream: true,
      temperature: 0.7
    };

    // 3. 发起请求到第三方
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
      throw new Error(`${modelType} API 错误: ${response.status} - ${errText}`);
    }

    // 4. 将流式数据透传给前端
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('🔴 Chat API 内部错误:', error);
    return NextResponse.json({ error: error.message || '对话服务异常' }, { status: 500 });
  }
}