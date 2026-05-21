import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const STOCK_API_KEY = process.env.STOCK_API_KEY || 'demo';
const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY;

async function fetchStockData(symbol) {
  const response = await fetch(
    `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${STOCK_API_KEY}`
  );
  const data = await response.json();

  if (data['Global Quote']) {
    return {
      symbol: data['Global Quote']['01. symbol'],
      price: parseFloat(data['Global Quote']['05. price']),
      change: data['Global Quote']['09. change'],
      changePercent: data['Global Quote']['10. change percent'],
      high: parseFloat(data['Global Quote']['03. high']),
      low: parseFloat(data['Global Quote']['04. low']),
      volume: parseInt(data['Global Quote']['06. volume']),
      latestTradingDay: data['Global Quote']['07. latest trading day']
    };
  }

  const fundamentalResponse = await fetch(
    `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${STOCK_API_KEY}`
  );
  const fundamentalData = await fundamentalResponse.json();

  if (fundamentalData.Symbol) {
    return {
      symbol: fundamentalData.Symbol,
      price: parseFloat(fundamentalData["50DayMovingAverage"] || 0),
      peRatio: fundamentalData.PERatio,
      dividendYield: fundamentalData.DividendYield,
      marketCap: fundamentalData.MarketCapitalization,
      description: fundamentalData.Description,
      name: fundamentalData.Name
    };
  }

  throw new Error('Stock data not found');
}

async function analyzeWithLLM(stockData) {
  const prompt = `你是一位专业的股票分析师。请分析以下股票数据，只返回JSON格式，不要任何其他文字。

必须严格遵循以下JSON格式：
{
  "summary": "2-3句话的股票分析总结",
  "sentiment": "Bullish或Neutral或Bearish之一",
  "riskLevel": "Low或Medium或High之一"
}

股票数据：
${JSON.stringify(stockData, null, 2)}

重要：只返回JSON对象，不要markdown代码块，不要解释，直接以{开头以}结尾。`;

  const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ZHIPU_API_KEY}`
    },
    body: JSON.stringify({
      model: 'glm-4-flash',
      messages: [
        {
          role: 'system',
          content: '你是一个只返回JSON的股票分析师。严格遵循用户要求的JSON格式，不要返回任何JSON之外的文字。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 500
    })
  });

  const result = await response.json();
  const responseText = result.choices[0].message.content.trim();

  let jsonStr = responseText;
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Failed to parse LLM response as JSON');
  }
}

async function saveAnalysis(symbol, stockData, analysis) {
  const { data, error } = await supabase
    .from('stock_analyses')
    .insert({
      symbol,
      stock_data: stockData,
      analysis_result: analysis,
      sentiment: analysis.sentiment,
      risk_level: analysis.riskLevel,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('Supabase error:', error);
    throw error;
  }
  return data;
}

app.post('/api/analyze', async (req, res) => {
  try {
    const { symbol } = req.body;

    if (!symbol) {
      return res.status(400).json({ error: 'Stock symbol is required' });
    }

    const stockData = await fetchStockData(symbol.toUpperCase());
    const analysis = await analyzeWithLLM(stockData);
    const savedRecord = await saveAnalysis(symbol.toUpperCase(), stockData, analysis);

    res.json({
      success: true,
      stockData,
      analysis,
      recordId: savedRecord.id
    });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({
      error: error.message || 'Failed to analyze stock',
      details: error.response?.data || null
    });
  }
});

app.get('/api/history', async (req, res) => {
  try {
    const { symbol } = req.query;

    let query = supabase
      .from('stock_analyses')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (symbol) {
      query = query.eq('symbol', symbol.toUpperCase());
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
