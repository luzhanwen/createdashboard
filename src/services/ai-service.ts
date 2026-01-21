// src/services/ai-service.ts
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { Dataset, ChartWidget } from '@/types';
import { DataDiagnostics } from '@/lib/data-utils';

class ApiKeyManager {
  private static readonly KEY_POOL = [
    import.meta.env.VITE_GEMINI_API_KEY_1 || import.meta.env.VITE_GEMINI_API_KEY,
    import.meta.env.VITE_GEMINI_API_KEY_2,
    import.meta.env.VITE_GEMINI_API_KEY_3,
  ].filter(Boolean);

  private currentIndex = 0;

  getKey(): string {
    const key = ApiKeyManager.KEY_POOL[this.currentIndex];
    if (!key) throw new Error('❌ 没有可用的API密钥');
    return key;
  }

  rotateKey(): void {
    this.currentIndex = (this.currentIndex + 1) % ApiKeyManager.KEY_POOL.length;
    console.warn(`🔄 轮换到API密钥索引: ${this.currentIndex + 1}`);
  }

  recordFailure(error: any): void {
    if (error?.message?.includes('quota') || error?.message?.includes('429')) {
      this.rotateKey();
    }
  }

  get healthStatus() {
    if (ApiKeyManager.KEY_POOL.length === 0) {
      return { healthy: false, message: '❌ 未配置任何API密钥' };
    }
    return { healthy: true, message: `✅ 密钥池正常 (${ApiKeyManager.KEY_POOL.length}个)` };
  }
}

export const apiKeyManager = new ApiKeyManager();
let genAI: GoogleGenAI | null = null;

const initializeGenAI = (): boolean => {
  try {
    const key = apiKeyManager.getKey();
    genAI = new GoogleGenAI({ apiKey: key });
    return true;
  } catch (error) {
    console.error('❌ Gemini AI 初始化失败:', error);
    return false;
  }
};

export const callGeminiAI = async (dataset: Dataset, userPrompt: string): Promise<ChartWidget[]> => {
  if (!genAI && !initializeGenAI()) {
    throw new Error('AI服务未初始化');
  }

  DataDiagnostics.run(dataset);

  const dataContext = {
    columns: dataset.columns.map(c => ({ name: c.name, type: c.type, sample: c.values.slice(0, 3) })),
    totalRows: dataset.rawData.length,
    columnNames: dataset.columns.map(c => c.name)
  };

  const prompt = `
你是一个资深数据分析师。请根据以下数据集信息和用户需求，推荐3-5个最适合的图表。
数据集信息: ${JSON.stringify(dataContext, null, 2)}
用户需求: "${userPrompt}"
### 可用列名（必须使用完全一致的名称）:
${dataset.columns.map(c => `  - "${c.name}" (${c.type})`).join('\n')}
### 输出要求:
- 返回纯JSON数组，包含: type (bar|line|pie|table), title, description, xColumn, yColumn
- Y轴必须是number类型
`;

  try {
    const result: GenerateContentResponse = await genAI!.models.generateContent({
      model: "gemini-2.0-flash", // 建议使用正式版模型名称
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = result.text || '';
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    let aiSuggestions = JSON.parse(cleanedText);

    // 智能修正与验证逻辑...
    const corrected = aiSuggestions.map((s: any) => {
      if (s.xColumn) s.xColumn = DataDiagnostics.findBestColumn(dataset, s.xColumn) || s.xColumn;
      if (s.yColumn) s.yColumn = DataDiagnostics.findBestColumn(dataset, s.yColumn) || s.yColumn;
      return s;
    }).filter((s: any) => 
      dataset.columns.some(c => c.name === s.xColumn) && 
      dataset.columns.some(c => c.name === s.yColumn)
    );
    
    if (corrected.length === 0) throw new Error('没有有效的图表建议');

    return corrected.map((s: any, i: number) => ({
      id: `ai-${Date.now()}-${i}`,
      type: s.type,
      title: s.title,
      description: s.description,
      dataConfig: {
        datasetId: dataset.id,
        xColumn: s.xColumn,
        yColumn: s.yColumn,
        categoryColumn: s.type === 'pie' ? s.xColumn : undefined,
        valueColumn: s.type === 'pie' ? s.yColumn : undefined,
      }
    }));
  } catch (error) {
    apiKeyManager.recordFailure(error);
    throw error;
  }
};