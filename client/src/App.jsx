import { useState } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function App() {
  const [symbol, setSymbol] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);

  const analyzeStock = async () => {
    if (!symbol.trim()) {
      setError('请输入股票代码');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`${API_BASE}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: symbol.trim().toUpperCase() })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '分析失败');
      }

      setResult(data);
      fetchHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/history`);
      const data = await response.json();
      setHistory(data);
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  };

  const getSentimentColor = (sentiment) => {
    switch (sentiment) {
      case 'Bullish': return 'sentiment-bullish';
      case 'Bearish': return 'sentiment-bearish';
      default: return 'sentiment-neutral';
    }
  };

  const getRiskColor = (risk) => {
    switch (risk) {
      case 'Low': return 'risk-low';
      case 'High': return 'risk-high';
      default: return 'risk-medium';
    }
  };

  return (
    <div className="container">
      <header>
        <h1>📈 股票AI分析器</h1>
        <p>输入股票代码，获取AI深度分析</p>
      </header>

      <div className="search-section">
        <div className="search-box">
          <input
            type="text"
            placeholder="例如: AAPL, GOOGL, MSFT"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && analyzeStock()}
            disabled={loading}
          />
          <button onClick={analyzeStock} disabled={loading}>
            {loading ? '分析中...' : '开始分析'}
          </button>
        </div>
        {error && <div className="error">{error}</div>}
      </div>

      {result && (
        <div className="result-section">
          <div className="stock-info">
            <h2>{result.stockData.symbol}</h2>
            {result.stockData.name && <p className="stock-name">{result.stockData.name}</p>}
            {result.stockData.price && (
              <div className="price">
                ${result.stockData.price.toFixed(2)}
                {result.stockData.change && (
                  <span className={parseFloat(result.stockData.change) >= 0 ? 'positive' : 'negative'}>
                    {result.stockData.change} ({result.stockData.changePercent})
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="analysis-card">
            <h3>AI 分析结果</h3>
            <div className="analysis-content">
              <div className="analysis-row">
                <span className="label">情绪判断:</span>
                <span className={`value ${getSentimentColor(result.analysis.sentiment)}`}>
                  {result.analysis.sentiment}
                </span>
              </div>
              <div className="analysis-row">
                <span className="label">风险等级:</span>
                <span className={`value ${getRiskColor(result.analysis.riskLevel)}`}>
                  {result.analysis.riskLevel}
                </span>
              </div>
              <div className="summary">
                <span className="label">总结:</span>
                <p>{result.analysis.summary}</p>
              </div>
            </div>
          </div>

          <div className="details-card">
            <h4>行情详情</h4>
            <div className="details-grid">
              {result.stockData.high && (
                <div className="detail-item">
                  <span>最高价</span>
                  <strong>${result.stockData.high.toFixed(2)}</strong>
                </div>
              )}
              {result.stockData.low && (
                <div className="detail-item">
                  <span>最低价</span>
                  <strong>${result.stockData.low.toFixed(2)}</strong>
                </div>
              )}
              {result.stockData.volume && (
                <div className="detail-item">
                  <span>成交量</span>
                  <strong>{result.stockData.volume.toLocaleString()}</strong>
                </div>
              )}
              {result.stockData.peRatio && (
                <div className="detail-item">
                  <span>市盈率</span>
                  <strong>{result.stockData.peRatio}</strong>
                </div>
              )}
            </div>
          </div>

          <div className="record-id">
            已保存至数据库 (ID: {result.recordId})
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="history-section">
          <h3>历史分析记录</h3>
          <div className="history-list">
            {history.map((item) => (
              <div key={item.id} className="history-item">
                <div className="history-header">
                  <strong>{item.symbol}</strong>
                  <span className={getSentimentColor(item.sentiment)}>{item.sentiment}</span>
                  <span className={getRiskColor(item.risk_level)}>{item.risk_level}</span>
                </div>
                <div className="history-date">
                  {new Date(item.created_at).toLocaleString('zh-CN')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
