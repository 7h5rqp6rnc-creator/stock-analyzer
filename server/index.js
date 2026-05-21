import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const STOCK_API_KEY = process.env.STOCK_API_KEY || 'demo';

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
  const prompt = `You are a professional stock analyst. Analyze the following stock data and return ONLY valid JSON with no additional text.

Required JSON format:
{
  "summary": "A 2-3 sentence summary of the stock analysis",
  "sentiment": "Bullish" or "Neutral" or "Bearish",
  "riskLevel": "Low" or "Medium" or "High"
}

Stock Data:
${JSON.stringify(stockData, null, 2)}

IMPORTANT: Return ONLY the JSON object, no markdown formatting, no code blocks, no explanations. Start with { and end with }.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a JSON-only stock analyst. Always respond with valid JSON in the exact format requested. Never add any text outside the JSON."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.3,
    max_tokens: 500
  });

  const responseText = completion.choices[0].message.content.trim();
  
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
