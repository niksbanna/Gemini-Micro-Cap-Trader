
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResponse, DiscoveryResponse, MarketOverviewResponse, PredictionResponse, Holding, Stock } from "../types";

// Using gemini-3-flash-preview for general text and search tasks
const MODEL_NAME = 'gemini-3-flash-preview';

export class GeminiTraderService {
  private ai: GoogleGenAI;

  constructor() {
    // API key must be obtained exclusively from process.env.API_KEY
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  /**
   * Helper to extract sources from grounding metadata
   */
  private extractSources(response: any) {
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    return groundingChunks
      .filter((chunk: any) => chunk.web)
      .map((chunk: any) => ({
        title: chunk.web.title || 'Source',
        uri: chunk.web.uri
      }));
  }

  async searchStock(ticker: string): Promise<{ stock: Stock; sources: { title: string; uri: string }[] }> {
    const prompt = `Search for real-time market data for the stock ticker: ${ticker}. 
    Provide the company name, current price, today's change percentage, market cap, and a brief 1-sentence current outlook.`;

    const response = await this.ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            stock: {
              type: Type.OBJECT,
              properties: {
                ticker: { type: Type.STRING },
                name: { type: Type.STRING },
                price: { type: Type.NUMBER },
                changePercent: { type: Type.NUMBER },
                marketCap: { type: Type.STRING },
                reasoning: { type: Type.STRING },
                sentiment: { type: Type.STRING, enum: ['Bullish', 'Bearish', 'Neutral'] }
              },
              required: ['ticker', 'name', 'price', 'changePercent', 'marketCap', 'reasoning', 'sentiment']
            }
          },
          required: ['stock']
        }
      }
    });

    const sources = this.extractSources(response);
    try {
      const data = JSON.parse(response.text.trim());
      return { stock: data.stock, sources };
    } catch (e) {
      throw new Error(`Failed to find data for ticker: ${ticker}`);
    }
  }

  async predictPortfolioValue(holdings: Holding[], cash: number): Promise<PredictionResponse> {
    const holdingsStr = holdings.map(h => `${h.shares} shares of ${h.ticker}`).join(', ') || 'no stocks';
    const prompt = `Based on a portfolio with $${cash.toFixed(2)} cash and holdings of ${holdingsStr}, predict the total portfolio value for the next 7 days. 
    Use Google Search to find current market trends for these specific tickers. 
    Return a list of 7 daily data points starting from tomorrow. 
    Also provide a brief rationale for the prediction.`;

    const response = await this.ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            predictions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  timestamp: { type: Type.STRING, description: "The date or day index" },
                  totalValue: { type: Type.NUMBER }
                },
                required: ['timestamp', 'totalValue']
              }
            },
            rationale: { type: Type.STRING }
          },
          required: ['predictions', 'rationale']
        }
      }
    });

    const sources = this.extractSources(response);
    try {
      const data = JSON.parse(response.text.trim());
      return { ...data, sources };
    } catch (e) {
      console.error("Failed to parse prediction", e);
      return { predictions: [], rationale: "Unable to generate forecast at this time.", sources };
    }
  }

  async getMarketOverview(): Promise<MarketOverviewResponse> {
    const prompt = `Search for the current real-time values and daily changes of major stock market indices: S&P 500, NASDAQ, and Bitcoin. Return the data in a structured format.`;

    const response = await this.ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            indices: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  value: { type: Type.STRING },
                  change: { type: Type.STRING },
                  changePercent: { type: Type.STRING },
                  isPositive: { type: Type.BOOLEAN }
                },
                required: ['name', 'value', 'change', 'changePercent', 'isPositive']
              }
            }
          },
          required: ['indices']
        }
      }
    });

    const sources = this.extractSources(response);
    try {
      const data = JSON.parse(response.text.trim());
      return { ...data, sources };
    } catch (e) {
      console.error("Failed to parse market overview", e);
      return { indices: [], sources };
    }
  }

  async discoverMicroCaps(): Promise<DiscoveryResponse> {
    const prompt = `Identify 5 high-potential micro-cap stocks (market cap $50M-$500M) currently trending in the US market. 
    Use Google Search to find current prices and news.`;

    const response = await this.ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            stocks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  ticker: { type: Type.STRING },
                  name: { type: Type.STRING },
                  price: { type: Type.NUMBER },
                  changePercent: { type: Type.NUMBER },
                  marketCap: { type: Type.STRING },
                  reasoning: { type: Type.STRING },
                  sentiment: { type: Type.STRING, enum: ['Bullish', 'Bearish', 'Neutral'] }
                },
                required: ['ticker', 'name', 'price', 'marketCap', 'reasoning', 'sentiment']
              }
            }
          },
          required: ['stocks']
        }
      }
    });

    const sources = this.extractSources(response);
    try {
      const data = JSON.parse(response.text.trim());
      return { ...data, sources };
    } catch (e) {
      console.error("Failed to parse discovery", e);
      return { stocks: [], sources };
    }
  }

  async analyzeStock(ticker: string): Promise<AnalysisResponse> {
    const prompt = `Perform a deep dive analysis on the stock ${ticker}. 
    Search for latest 24h news. Decide if a user with $100 should BUY, SELL, or HOLD. 
    Provide current price and confidence score.`;

    const response = await this.ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendation: { type: Type.STRING, enum: ['BUY', 'SELL', 'HOLD'] },
            ticker: { type: Type.STRING },
            currentPrice: { type: Type.NUMBER },
            confidence: { type: Type.NUMBER },
            analysis: { type: Type.STRING }
          },
          required: ['recommendation', 'ticker', 'currentPrice', 'confidence', 'analysis']
        }
      }
    });

    const sources = this.extractSources(response);
    try {
      const data = JSON.parse(response.text.trim());
      return { ...data, sources };
    } catch (e) {
      throw new Error("Failed to analyze stock data");
    }
  }

  async chatWithTrader(history: any[], message: string) {
    const chat = this.ai.chats.create({
      model: MODEL_NAME,
      config: {
        systemInstruction: "You are an AI micro-cap trader. Use Google Search to justify your advice.",
        tools: [{ googleSearch: {} }]
      }
    });
    const response = await chat.sendMessage({ message });
    return {
      text: response.text,
      sources: this.extractSources(response)
    };
  }
}
