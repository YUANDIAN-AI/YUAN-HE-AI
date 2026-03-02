// app/api/chat/route.ts
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { messages, modelName } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: '消息格式错误' }, { status: 400 });
    }

    // 根据前端传来的 modelName 决定用哪个配置
    // 注意：这里为了简化，我们依然并发处理，但需要根据 modelName 过滤？
    // 不，前端是分别调用的吗？
    // 查看前端代码：前端是一个循环 map 发起 fetch，每次 fetch 携带了 modelName。
    // 所以后端每次只处理一个模型的请求。
    
    // 确定当前请求是哪个模型
    let config;
    if (modelName === '通义千问') {
      config = {
        name: '通义千问',
        url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        key: process.env.DASHSCOPE_API_KEY,
        model: 'qwen-plus',
      };
    } else if (modelName === 'DeepSeek') {
      config = {
        name: 'DeepSeek',
        url: 'https://api.deepseek.com/chat/completions',
        key: process.env.DEEPSEEK_API_KEY,
        model: 'deepseek-chat',
      };
    } else if (modelName === '豆包') {
      config = {
        name: '豆包',
        url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
        key: process.env.DOUBAO_API_KEY,
        model: process.env.DOUBAO_MODEL_NAME || 'doubao-pro-4k',
      };
    } else {
      return NextResponse.json({ error: '未知模型' }, { status: 400 });
    }

    if (!config.key) {
      return NextResponse.json({ error: `${config.name} API Key 未配置` }, { status: 500 });
    }

    // 创建流
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const response = await fetch(config.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.key}`
            },
            body: JSON.stringify({
              model: config.model,
              messages: messages, // 直接发送完整历史
              stream: false // 为了简化流式解析逻辑，这里先用非流式请求，然后在后端模拟分块发送
              // 如果要真正的上游流式，逻辑会复杂很多，对于新手项目，非流式获取 + 后端模拟打字机 足够好用且稳定
            })
          });

          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`${response.status}: ${errText}`);
          }

          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || '无回答';

          // 模拟打字机效果：分块发送
          const chunks = content.match(/.{1,30}/g) || [content];
          for (const chunk of chunks) {
            const payload = JSON.stringify({ model: config.name, text: chunk, done: false });
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
            await new Promise(r => setTimeout(r, 30));
          }

          const endPayload = JSON.stringify({ model: config.name, text: '', done: true });
          controller.enqueue(encoder.encode(`data: ${endPayload}\n\n`));

        } catch (error: any) {
          const errorPayload = JSON.stringify({ model: config.name, text: `❌ ${error.message}`, done: true });
          controller.enqueue(encoder.encode(`data: ${errorPayload}\n\n`));
        }
        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Global Error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}