// ==================== 核心导入（解决React未定义）====================
import React, { useState, useCallback, useMemo } from 'react';
import { 
  Upload, FileText, MessageSquare, Lightbulb, Eye, Save, Plus, X, BarChart3, PieChart, 
  LineChart, Table2, Database, Sparkles, LayoutDashboard, CheckCircle, ChevronRight, 
  AlertCircle, RefreshCw, Zap, Shield, TrendingUp, Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast, Toaster } from 'sonner';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts'; // ✅ 必须显式导入
import Papa from 'papaparse';
import './App.css';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

// ==================== 类型定义 ====================
interface DataColumn {
  name: string;
  type: 'string' | 'number' | 'date';
  values: any[];
}

interface Dataset {
  id: string;
  name: string;
  columns: DataColumn[];
  rawData: any[];
  uploadTime: string;
}

interface ChartWidget {
  id: string;
  type: 'pie' | 'bar' | 'line' | 'table';
  title: string;
  description: string;
  dataConfig: {
    datasetId: string;
    xColumn?: string;
    yColumn?: string;
    categoryColumn?: string;
    valueColumn?: string;
  };
}

interface Dashboard {
  id: string;
  name: string;
  widgets: ChartWidget[];
  createTime: string;
}

// ==================== 配置常量 ====================
const steps = [
  { id: 'data', name: '数据上传', icon: Database, description: '上传并选择数据' },
  { id: 'ai', name: 'AI对话', icon: Sparkles, description: '描述看板需求' },
  { id: 'suggestions', name: '图表建议', icon: Lightbulb, description: '选择AI生成的图表' },
  { id: 'preview', name: '看板预览', icon: LayoutDashboard, description: '预览和保存看板' },
];

const chartTypes = [
  { id: 'pie', name: '环形图', icon: PieChart, color: 'from-blue-500 to-cyan-500' },
  { id: 'bar', name: '条形图', icon: BarChart3, color: 'from-purple-500 to-pink-500' },
  { id: 'line', name: '折线图', icon: LineChart, color: 'from-amber-500 to-orange-500' },
  { id: 'table', name: '数据表', icon: Table2, color: 'from-green-500 to-emerald-500' },
];

// ==================== API密钥管理器 ====================
class ApiKeyManager {
  private static readonly KEY_POOL = [
    import.meta.env.VITE_GEMINI_API_KEY_1 || import.meta.env.VITE_GEMINI_API_KEY,
    import.meta.env.VITE_GEMINI_API_KEY_2,
    import.meta.env.VITE_GEMINI_API_KEY_3,
  ].filter(Boolean);

  private currentIndex = 0;
  private failureCount = 0;

  getKey(): string {
    const key = ApiKeyManager.KEY_POOL[this.currentIndex];
    if (!key) throw new Error('❌ 没有可用的API密钥');
    return key;
  }

  rotateKey(): void {
    this.currentIndex = (this.currentIndex + 1) % ApiKeyManager.KEY_POOL.length;
    this.failureCount = 0;
    console.warn(`🔄 轮换到API密钥索引: ${this.currentIndex + 1}`);
  }

  recordFailure(error: any): void {
    this.failureCount++;
    if (this.isQuotaError(error)) this.rotateKey();
  }

  isQuotaError(error: any): boolean {
    return error?.message?.includes('quota') || 
           error?.message?.includes('429') || 
           error?.message?.includes('exhausted');
  }

  get healthStatus() {
    if (ApiKeyManager.KEY_POOL.length === 0) {
      return { healthy: false, message: '❌ 未配置任何API密钥' };
    }
    return { healthy: true, message: `✅ 密钥池正常 (${ApiKeyManager.KEY_POOL.length}个)` };
  }
}

const apiKeyManager = new ApiKeyManager();

// ==================== 数据诊断工具 ====================
const DataDiagnostics = {
  run(dataset: Dataset): void {
    console.group(`📊 数据集诊断: ${dataset.name}`);
    console.log('总记录数:', dataset.rawData.length);
    dataset.columns.forEach(col => {
      const stats = this.analyzeColumn(col, dataset.rawData);
      console.log(`🔸 ${col.name} (${col.type}):`, stats);
    });
    console.log('前3行样本:', dataset.rawData.slice(0, 3));
    console.groupEnd();
  },

  analyzeColumn(column: DataColumn, data: any[]) {
    const values = column.values;
    const nonNullCount = values.filter(v => this.isValidValue(v)).length;
    const uniqueValues = new Set(values.filter(v => this.isValidValue(v))).size;
    return { 非空值: nonNullCount, 唯一值: uniqueValues, 样本: values.slice(0, 3) };
  },

  isValidValue(v: any): boolean {
    return v !== null && v !== undefined && v !== '' && String(v).trim() !== 'N/A';
  },

  findBestColumn(dataset: Dataset, targetName: string): string | null {
    const candidates = dataset.columns.map(c => c.name);
    let match = candidates.find(name => name.toLowerCase() === targetName.toLowerCase());
    if (match) return match;
    match = candidates.find(name => name.toLowerCase().includes(targetName.toLowerCase()));
    return match || null;
  },

  cleanChartData(data: any[], xColumn: string, yColumn: string): any[] {
    const cleaned = data
      .map(row => ({ name: row[xColumn], value: row[yColumn] }))
      .filter(item => this.isValidValue(item.name) && this.isValidValue(item.value) && !isNaN(Number(item.value)));
    console.log(`🧹 数据清洗: ${data.length} → ${cleaned.length} 条有效记录`);
    return cleaned;
  }
};

// ==================== AI服务调用 ====================
let genAI: GoogleGenAI | null = null;

const initializeGenAI = (): boolean => {
  try {
    const key = apiKeyManager.getKey();
    genAI = new GoogleGenAI({ apiKey: key });
    console.log('✅ Gemini AI 初始化成功');
    return true;
  } catch (error) {
    console.error('❌ Gemini AI 初始化失败:', error);
    return false;
  }
};

const callGeminiAI = async (dataset: Dataset, userPrompt: string): Promise<ChartWidget[]> => {
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

数据集信息:
${JSON.stringify(dataContext, null, 2)}

用户需求: "${userPrompt}"

### 可用列名（必须使用完全一致的名称）:
${dataset.columns.map(c => `  - "${c.name}" (${c.type})`).join('\n')}

### 输出要求:
- 严格使用上述列名（区分大小写）
- Y轴必须是number类型的列
- 返回纯JSON数组，不要markdown

请严格遵循以下格式:
[
  {
    "type": "bar" | "line" | "pie" | "table",
    "title": "图表标题",
    "description": "图表描述",
    "xColumn": "分类列名",
    "yColumn": "数值列名"
  }
]
  `;

  try {
    const result: GenerateContentResponse = await genAI!.models.generateContent({
      model: "gemini-3-flash-preview", // ✅ 使用指定模型
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = result.text;
    if (!text) throw new Error('API 响应为空');

    console.log('📝 AI响应:', text);
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    let aiSuggestions = JSON.parse(cleanedText);

    // 智能修正列名
    const corrected = aiSuggestions.map((s: any) => {
      if (s.xColumn) s.xColumn = DataDiagnostics.findBestColumn(dataset, s.xColumn) || s.xColumn;
      if (s.yColumn) s.yColumn = DataDiagnostics.findBestColumn(dataset, s.yColumn) || s.yColumn;
      return s;
    });

    // 过滤无效
    const valid = corrected.filter((s: any) => 
      dataset.columns.some(c => c.name === s.xColumn) && 
      dataset.columns.some(c => c.name === s.yColumn)
    );

    if (valid.length === 0) {
      throw new Error('AI生成的所有建议都包含无效的列名');
    }

    return valid.map((s: any, i: number) => ({
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

// ==================== 错误边界组件 ====================
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('❌ 应用错误:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
          <Card className="bg-gray-800 border-red-600 max-w-2xl">
            <CardHeader>
              <CardTitle className="text-red-400 flex items-center gap-2">
                <AlertCircle className="w-6 h-6" />
                应用发生错误
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-red-300 text-sm overflow-auto whitespace-pre-wrap">
                {String(this.state.error?.stack || this.state.error)}
              </pre>
              <Button 
                className="mt-4 bg-red-600 hover:bg-red-700"
                onClick={() => window.location.reload()}
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                刷新页面
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

// ==================== 图表渲染器 ====================
const ChartRenderer = ({ widget, datasets }: { widget: ChartWidget; datasets: Dataset[] }) => {
  const dataset = datasets.find(d => d.id === widget.dataConfig.datasetId);
  
  if (!dataset) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400">
        <AlertCircle className="w-8 h-8 mr-2" />
        数据集不存在
      </div>
    );
  }

  // 验证配置
  const validateConfig = (): { valid: boolean; message?: string } => {
    if (widget.type === 'table') return { valid: true };
    
    const config = widget.dataConfig;
    const xCol = config.xColumn || config.categoryColumn;
    const yCol = config.yColumn || config.valueColumn;
    
    if (!xCol || !yCol) return { valid: false, message: '缺少X轴或Y轴配置' };
    if (!dataset.columns.some(c => c.name === xCol)) return { valid: false, message: `列不存在: "${xCol}"` };
    if (!dataset.columns.some(c => c.name === yCol)) return { valid: false, message: `列不存在: "${yCol}"` };
    
    const sample = dataset.rawData[0];
    if (!sample || sample[xCol] === undefined || sample[yCol] === undefined) {
      return { valid: false, message: '数据样本中缺少配置的字段' };
    }
    
    return { valid: true };
  };

  const validation = validateConfig();
  if (!validation.valid) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-orange-400">
        <AlertCircle className="w-8 h-8 mb-2" />
        <p className="text-sm">{validation.message}</p>
        <div className="mt-3 text-xs text-gray-500">
          可用列: {dataset.columns.map(c => c.name).join(', ')}
        </div>
      </div>
    );
  }

  // 生成ECharts配置
  const getChartOption = () => {
    try {
      switch (widget.type) {
        case 'bar': {
          const cleanData = DataDiagnostics.cleanChartData(
            dataset.rawData, 
            widget.dataConfig.xColumn!, 
            widget.dataConfig.yColumn!
          );
          if (cleanData.length === 0) throw new Error('清洗后数据为空');
          cleanData.sort((a, b) => Number(b.value) - Number(a.value));

          return {
            backgroundColor: 'transparent',
            title: { text: widget.title, left: 'center', textStyle: { color: '#e5e7eb' } },
            tooltip: { trigger: 'axis', backgroundColor: '#1f2937', borderColor: '#374151', textStyle: { color: '#e5e7eb' } },
            grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
            xAxis: { type: 'category', data: cleanData.map(d => d.name), axisLabel: { color: '#9ca3af', rotate: 30 }, axisLine: { lineStyle: { color: '#374151' } } },
            yAxis: { type: 'value', axisLabel: { color: '#9ca3af' }, axisLine: { lineStyle: { color: '#374151' } }, splitLine: { lineStyle: { color: '#374151' } } },
            series: [{ type: 'bar', data: cleanData.map(d => Number(d.value)), itemStyle: { color: '#8b5cf6', borderRadius: [4, 4, 0, 0] } }],
          };
        }
        
        case 'pie': {
          const cleanData = DataDiagnostics.cleanChartData(
            dataset.rawData, 
            widget.dataConfig.categoryColumn!, 
            widget.dataConfig.valueColumn!
          );
          if (cleanData.length === 0) throw new Error('清洗后数据为空');

          return {
            backgroundColor: 'transparent',
            title: { text: widget.title, left: 'center', textStyle: { color: '#e5e7eb' } },
            tooltip: { trigger: 'item', backgroundColor: '#1f2937', borderColor: '#374151', textStyle: { color: '#e5e7eb', formatter: '{b}: {c} ({d}%)' } },
            legend: { bottom: '5%', textStyle: { color: '#9ca3af' } },
            series: [{ type: 'pie', radius: ['40%', '70%'], data: cleanData.map(d => ({ name: d.name, value: Number(d.value) })), label: { color: '#e5e7eb' } }],
          };
        }
        
        case 'line': {
          const cleanData = DataDiagnostics.cleanChartData(
            dataset.rawData, 
            widget.dataConfig.xColumn!, 
            widget.dataConfig.yColumn!
          );
          if (cleanData.length === 0) throw new Error('清洗后数据为空');
          cleanData.sort((a, b) => Number(a.name) - Number(b.name));

          return {
            backgroundColor: 'transparent',
            title: { text: widget.title, left: 'center', textStyle: { color: '#e5e7eb' } },
            tooltip: { trigger: 'axis', backgroundColor: '#1f2937', borderColor: '#374151', textStyle: { color: '#e5e7eb' } },
            grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
            xAxis: { type: 'category', data: cleanData.map(d => d.name), axisLabel: { color: '#9ca3af', rotate: 30 }, axisLine: { lineStyle: { color: '#374151' } } },
            yAxis: { type: 'value', axisLabel: { color: '#9ca3af' }, axisLine: { lineStyle: { color: '#374151' } }, splitLine: { lineStyle: { color: '#374151' } } },
            series: [{ type: 'line', data: cleanData.map(d => Number(d.value)), smooth: true, itemStyle: { color: '#a855f7' }, lineStyle: { color: '#a855f7' } }],
          };
        }
        
        default:
          return {};
      }
    } catch (error) {
      console.error('图表渲染错误:', error);
      return null;
    }
  };

  if (widget.type === 'table') {
    return (
      <div className="overflow-auto h-full bg-gray-900/50 rounded-lg border border-gray-800">
        <table className="w-full text-sm">
          <thead className="sticky top-0">
            <tr className="border-b border-gray-700 bg-gray-800/70">
              {dataset.columns.map(col => (
                <th key={col.name} className="text-left p-3 font-medium text-gray-300">
                  {col.name}
                  <Badge variant="secondary" className="ml-2 text-xs bg-gray-700 text-gray-400">
                    {col.type}
                  </Badge>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataset.rawData.slice(0, 20).map((row, idx) => (
              <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800/30">
                {dataset.columns.map(col => (
                  <td key={col.name} className="p-3 text-gray-400">{row[col.name] ?? '-'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {dataset.rawData.length > 20 && (
          <div className="text-center p-3 text-gray-500 text-sm bg-gray-800/50 border-t border-gray-800">
            显示 20 / {dataset.rawData.length} 行数据
          </div>
        )}
      </div>
    );
  }

  const option = getChartOption();
  if (!option) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400">
        <AlertCircle className="w-8 h-8 mr-2" />
        图表配置无效
      </div>
    );
  }

  return (
    <ReactECharts 
      option={option} 
      style={{ height: '320px', width: '100%' }}
      notMerge={true}
      lazyUpdate={false}
    />
  );
};

// ==================== 主应用组件 ====================
function AppContent() {
  const [aiResponse, setAiResponse] = useState(''); 
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [recommendations, setRecommendations] = useState<ChartWidget[]>([]);
  const [dashboardWidgets, setDashboardWidgets] = useState<ChartWidget[]>([]);
  const [dashboardName, setDashboardName] = useState('数据看板');
  const [savedDashboards, setSavedDashboards] = useState<Dashboard[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // 健康状态
  const healthStatus = apiKeyManager.healthStatus;

  const completeStep = (stepIndex: number) => {
    if (!completedSteps.includes(stepIndex)) {
      setCompletedSteps(prev => [...prev, stepIndex]);
    }
    if (stepIndex < steps.length - 1) {
      setCurrentStep(stepIndex + 1);
    }
  };

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('文件大小超过10MB限制');
      return;
    }

    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results: Papa.ParseResult<any>) => {
        if (results.errors.length > 0) {
          console.warn('CSV解析警告:', results.errors);
        }

        if (!results.data || results.data.length === 0) {
          toast.error('CSV文件为空或解析失败');
          return;
        }

        const columns: DataColumn[] = [];
        if (results.meta.fields) {
          results.meta.fields.forEach((field: string) => {
            const values = results.data.map((row: any) => row[field]).filter((v: any) => v !== undefined && v !== null);
            const sampleValue = values[0];
            let type: 'string' | 'number' | 'date' = 'string';
            
            if (typeof sampleValue === 'number') {
              type = 'number';
            } else if (sampleValue instanceof Date || (typeof sampleValue === 'string' && !isNaN(Date.parse(sampleValue)))) {
              type = 'date';
            }

            columns.push({ name: field, type, values });
          });
        }

        const newDataset: Dataset = {
          id: `dataset-${Date.now()}`,
          name: file.name.replace(/\.csv$/, ''),
          columns,
          rawData: results.data as any[],
          uploadTime: new Date().toISOString(),
        };

        setDatasets(prev => [...prev, newDataset]);
        setSelectedDataset(newDataset);
        toast.success(`数据 "${newDataset.name}" 上传成功！`);
        completeStep(0);
        DataDiagnostics.run(newDataset);
      },
      error: (error: Error) => {
        toast.error('CSV解析失败: ' + error.message);
      },
    });
  }, []);

  const handleAiSubmit = async () => {
    if (!aiPrompt.trim()) {
      toast.error('请输入您的需求');
      return;
    }

    if (!selectedDataset) {
      toast.error('请先上传数据');
      return;
    }

    setIsProcessing(true);
    setAiResponse('🤖 AI正在深度分析数据并生成图表建议...');

    try {
      const newRecommendations = await callGeminiAI(selectedDataset, aiPrompt);

      if (newRecommendations.length === 0) {
        setAiResponse('⚠️ AI未能生成有效的图表建议，请尝试更具体的描述');
        toast.warning('未生成有效建议');
      } else {
        setRecommendations(newRecommendations);
        setAiResponse(`🎉 Gemini AI 已为您生成 ${newRecommendations.length} 个图表建议`);
        completeStep(1);
        toast.success(`AI分析完成！生成 ${newRecommendations.length} 个建议`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      setAiResponse(`❌ 错误: ${errorMessage}`);
      toast.error('AI分析出错: ' + errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const addWidgetToDashboard = useCallback((widget: ChartWidget) => {
    const newWidget = { ...widget, id: `widget-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` };
    setDashboardWidgets(prev => [...prev, newWidget]);
    toast.success('图表已添加到看板');
    completeStep(2);
  }, []);

  const removeWidgetFromDashboard = useCallback((widgetId: string) => {
    setDashboardWidgets(prev => prev.filter(w => w.id !== widgetId));
    toast.success('图表已移除');
  }, []);

  const saveDashboard = useCallback(() => {
    if (dashboardWidgets.length === 0) {
      toast.error('看板不能为空');
      return;
    }

    if (!dashboardName.trim()) {
      toast.error('请输入看板名称');
      return;
    }

    const newDashboard: Dashboard = {
      id: `dashboard-${Date.now()}`,
      name: dashboardName.trim(),
      widgets: [...dashboardWidgets],
      createTime: new Date().toISOString(),
    };

    setSavedDashboards(prev => [...prev, newDashboard]);
    setShowSaveDialog(false);
    completeStep(3);
    toast.success(`看板 "${dashboardName}" 保存成功！`);

    // 导出JSON文件
    try {
      const blob = new Blob([JSON.stringify(newDashboard, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dashboardName.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('保存文件失败:', error);
    }
  }, [dashboardName, dashboardWidgets]);

  const loadDashboard = useCallback((dashboard: Dashboard) => {
    setDashboardName(dashboard.name);
    setDashboardWidgets([...dashboard.widgets]);
    toast.success(`已加载看板 "${dashboard.name}"`);
  }, []);

  const clearDashboard = useCallback(() => {
    if (dashboardWidgets.length === 0) return;
    if (confirm('确定要清空当前看板吗？')) {
      setDashboardWidgets([]);
      toast.info('看板已清空');
    }
  }, [dashboardWidgets]);

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-6">
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Database className="w-5 h-5 text-purple-400" />
                  上传数据
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-gray-700 rounded-lg p-8 text-center hover:border-purple-500/50 transition-colors bg-gray-900/30">
                  <Upload className="w-10 h-10 mx-auto mb-3 text-gray-500" />
                  <p className="text-gray-400 mb-2">支持 CSV 或 JSON 格式</p>
                  <p className="text-xs text-gray-600 mb-4">最大文件大小: 10MB</p>
                  <Input type="file" accept=".csv,.json" onChange={handleFileUpload} className="hidden" id="file-upload" />
                  <Button asChild className="bg-purple-600 hover:bg-purple-700">
                    <label htmlFor="file-upload" className="cursor-pointer">选择文件</label>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {datasets.length > 0 && (
              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">数据集</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {datasets.map(dataset => (
                    <div key={dataset.id} onClick={() => setSelectedDataset(dataset)} className={`p-4 rounded-lg border cursor-pointer transition-all ${selectedDataset?.id === dataset.id ? 'border-purple-500 bg-purple-500/10' : 'border-gray-800 hover:border-gray-700 bg-gray-800/50'}`}>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-purple-400" />
                        <span className="font-medium text-gray-200">{dataset.name}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{dataset.columns.length} 列 · {dataset.rawData.length} 行</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {selectedDataset && (
              <>
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">数据列</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {selectedDataset.columns.map(column => {
                      const nonNullCount = column.values.filter(v => DataDiagnostics.isValidValue(v)).length;
                      return (
                        <div key={column.name} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-300">{column.name}</span>
                            <Badge variant="secondary" className={`${column.type === 'number' ? 'bg-blue-500/20 text-blue-300' : 'bg-purple-500/20 text-purple-300'} border-purple-500/30 text-xs`}>
                              {column.type}
                            </Badge>
                          </div>
                          <span className="text-xs text-gray-500">{nonNullCount}/{column.values.length}</span>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                <Card className="bg-blue-900/20 border-blue-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Zap className="w-4 h-4 text-blue-400" />
                      数据诊断信息
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs text-blue-300 whitespace-pre-wrap break-all">
{`总记录数: ${selectedDataset.rawData.length}
列详情: ${selectedDataset.columns.map(c => `${c.name}(${c.type})`).join(', ')}
前3行: ${JSON.stringify(selectedDataset.rawData.slice(0, 3), null, 2)}`}
                    </pre>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        );

      case 1:
        return (
          <div className="space-y-6">
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-400" />
                  AI 助手
                </CardTitle>
                <p className="text-sm text-gray-500">描述您想要的看板效果</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea 
                  value={aiPrompt} 
                  onChange={(e) => setAiPrompt(e.target.value)} 
                  placeholder={
`例如：
- 展示各单位登录次数的排行分布
- 分析不同部门的登录趋势变化
- 对比各分公司用户活跃度
- 查看用户登录明细数据

提示：描述越具体，AI生成的建议越准确。建议提及具体的列名如"单位"、"登录次数"等。`
                  } 
                  className="min-h-[140px] resize-none bg-gray-800/50 border-gray-700 text-gray-200 placeholder:text-gray-500 focus:border-purple-500" 
                />
                <Button 
                  onClick={handleAiSubmit} 
                  disabled={!selectedDataset || isProcessing} 
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-gray-200 border-t-transparent rounded-full animate-spin mr-2" />
                      AI分析中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      生成图表建议
                    </>
                  )}
                </Button>
                {aiResponse && (
                  <div className={`p-4 rounded-lg border ${
                    aiResponse.includes('错误') ? 'bg-red-500/10 border-red-500/30 text-red-200' : 'bg-purple-500/10 border-purple-500/30 text-purple-200'
                  }`}>
                    <p className="text-sm">{aiResponse}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-purple-400" />
                  图表建议
                </CardTitle>
                <p className="text-sm text-gray-500">选择AI为您生成的图表</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {isProcessing ? (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 mx-auto mb-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-gray-500">AI正在生成图表建议...</p>
                  </div>
                ) : recommendations.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Lightbulb className="w-12 h-12 mx-auto mb-3 text-gray-700" />
                    <p className="text-sm">暂无图表建议</p>
                    <p className="text-xs mt-1">请先完成AI对话</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500">共 {recommendations.length} 个建议</span>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => {
                          if (confirm('确定要添加所有建议的图表到看板吗？')) {
                            recommendations.forEach(widget => addWidgetToDashboard(widget));
                          }
                        }}
                        className="border-purple-500/30 text-purple-300 hover:bg-purple-500/10"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        全部添加
                      </Button>
                    </div>
                    {recommendations.map(widget => {
                      const chartType = chartTypes.find(t => t.id === widget.type);
                      return (
                        <div key={widget.id} className="p-4 bg-gray-800/50 rounded-lg border border-gray-800 hover:border-purple-500/50 transition-all">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              {chartType && (
                                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${chartType.color} flex items-center justify-center`}>
                                  <chartType.icon className="w-5 h-5 text-white" />
                                </div>
                              )}
                              <div>
                                <h4 className="font-medium text-gray-200">{widget.title}</h4>
                                <p className="text-xs text-gray-500">{widget.description}</p>
                                {widget.dataConfig.xColumn && (
                                  <p className="text-xs text-purple-400 mt-1">
                                    数据: {widget.dataConfig.xColumn} → {widget.dataConfig.yColumn}
                                  </p>
                                )}
                              </div>
                            </div>
                            <Button size="sm" onClick={() => addWidgetToDashboard(widget)} className="bg-purple-600 hover:bg-purple-700">
                              <Plus className="w-4 h-4 mr-1" />
                              添加
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <LayoutDashboard className="w-5 h-5 text-purple-400" />
                  看板预览
                </CardTitle>
                <p className="text-sm text-gray-500">预览和管理您的看板</p>
              </CardHeader>
              <CardContent>
                {dashboardWidgets.length === 0 ? (
                  <div className="text-center py-8">
                    <LayoutDashboard className="w-12 h-12 mx-auto mb-3 text-gray-700" />
                    <p className="text-sm text-gray-500">看板为空</p>
                    <p className="text-xs text-gray-600 mt-1">请从图表建议中添加图表</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-gray-400">已添加 {dashboardWidgets.length} 个图表</span>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={clearDashboard}
                        className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                      >
                        <X className="w-3 h-3 mr-1" />
                        清空看板
                      </Button>
                    </div>
                    {dashboardWidgets.map(widget => {
                      const chartType = chartTypes.find(t => t.id === widget.type);
                      return (
                        <div key={widget.id} className="p-3 bg-gray-800/50 rounded-lg flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {chartType && (
                              <div className={`w-8 h-8 rounded bg-gradient-to-br ${chartType.color} flex items-center justify-center`}>
                                <chartType.icon className="w-4 h-4 text-white" />
                              </div>
                            )}
                            <span className="text-sm text-gray-300">{widget.title}</span>
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => removeWidgetFromDashboard(widget.id)} className="text-red-400 hover:text-red-300">
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      );
                    })}
                    <div className="pt-4 border-t border-gray-800">
                      <Button onClick={() => setShowSaveDialog(true)} disabled={dashboardWidgets.length === 0} className="w-full bg-purple-600 hover:bg-purple-700">
                        <Save className="w-4 h-4 mr-2" />
                        保存看板
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {savedDashboards.length > 0 && (
              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">已保存的看板</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {savedDashboards.map(dashboard => (
                    <div key={dashboard.id} onClick={() => loadDashboard(dashboard)} className="p-3 bg-gray-800/50 rounded-lg border border-gray-800 hover:border-purple-500/50 cursor-pointer transition-all">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-200">{dashboard.name}</span>
                        <Badge variant="secondary" className="bg-purple-500/20 text-purple-300">{dashboard.widgets.length} 个图表</Badge>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900">
      {/* Toaster必须渲染在组件树中 */}
      <Toaster position="top-center" theme="dark" />
      
      {/* API密钥健康状态 */}
      {!healthStatus.healthy && (
        <div className="bg-red-900/20 border-b border-red-800 px-6 py-2 flex items-center gap-2">
          <Shield className="w-4 h-4 text-red-400" />
          <span className="text-sm text-red-300">{healthStatus.message}</span>
        </div>
      )}

      {/* 顶部导航 */}
      <header className="bg-gray-900/80 backdrop-blur-sm border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-700 rounded-lg flex items-center justify-center shadow-lg">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-100">AI看板制作平台</h1>
              <p className="text-sm text-gray-500">智能数据可视化工具</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <Input value={dashboardName} onChange={(e) => setDashboardName(e.target.value)} placeholder="看板名称" className="w-48 bg-gray-800/50 border-gray-700 text-gray-200" />
            {dashboardWidgets.length > 0 && (
              <Badge variant="outline" className="border-purple-500/30 text-purple-300">
                {dashboardWidgets.length} 个图表
              </Badge>
            )}
          </div>
        </div>
      </header>
      
      {/* 步骤指示器 */}
      <div className="bg-gray-900/60 backdrop-blur-sm border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-center gap-4">
          {steps.map((step, index) => {
            const isActive = currentStep === index;
            const isCompleted = completedSteps.includes(index);
            const isClickable = index === 0 || completedSteps.includes(index - 1) || currentStep >= index;
            
            return (
              <div key={step.id} className="flex items-center">
                <button
                  onClick={() => isClickable && setCurrentStep(index)}
                  disabled={!isClickable}
                  className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all ${
                    isActive ? 'bg-purple-600/20 text-purple-300 border border-purple-500/50' :
                    isCompleted ? 'bg-green-500/10 text-green-400 border border-green-500/30' :
                    'bg-gray-800/50 text-gray-500 border border-gray-700/50'
                  } ${isClickable ? 'cursor-pointer hover:opacity-80' : 'cursor-not-allowed opacity-40'}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    isCompleted ? 'bg-green-500 text-white' :
                    isActive ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-400'
                  }`}>
                    {isCompleted ? <CheckCircle className="w-5 h-5" /> : <step.icon className="w-4 h-4" />}
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-sm">{step.name}</div>
                    <div className="text-xs opacity-70">{step.description}</div>
                  </div>
                </button>
                {index < steps.length - 1 && (
                  <ChevronRight className={`w-6 h-6 mx-2 ${isCompleted ? 'text-green-500/50' : 'text-gray-700'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>
      
      {/* 主体内容 */}
      <div className="flex h-[calc(100vh-160px)]">
        {/* 左侧边栏 */}
        <div className="w-96 bg-gray-900/50 border-r border-gray-800 p-6 overflow-auto">
          {renderStepContent()}
        </div>
        
        {/* 右侧主区域 - 看板预览 */}
        <div className="flex-1 p-6 overflow-auto">
          {dashboardWidgets.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-xl px-4">
                <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gray-800/50 flex items-center justify-center animate-pulse">
                  <Eye className="w-12 h-12 text-gray-600" />
                </div>
                <h3 className="text-2xl font-medium text-gray-300 mb-3">看板预览</h3>
                <p className="text-gray-500 mb-6">
                  按照步骤完成数据上传、AI对话和图表选择，
                  <br />您的看板将在这里实时预览
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentStep(0)}
                  className="border-purple-500/30 text-purple-300 hover:bg-purple-500/10"
                >
                  <ChevronRight className="w-4 h-4 mr-1" />
                  开始创建
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-gray-100">{dashboardName}</h2>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">共 {dashboardWidgets.length} 个图表</span>
                  <Button size="sm" variant="outline" onClick={clearDashboard} className="border-gray-700 text-gray-400">
                    清空
                  </Button>
                </div>
              </div>
              
              {/* 看板网格 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 auto-rows-fr">
                {dashboardWidgets.map(widget => (
                  <Card key={widget.id} className="bg-gray-900/50 border-gray-800 hover:border-purple-500/30 transition-all">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base text-gray-200 flex items-center gap-2">
                          {(() => {
                            const chartType = chartTypes.find(t => t.id === widget.type);
                            return chartType ? (
                              <chartType.icon className="w-4 h-4 text-purple-400" />
                            ) : null;
                          })()}
                          {widget.title}
                        </CardTitle>
                        <Button size="sm" variant="ghost" onClick={() => removeWidgetFromDashboard(widget.id)} className="text-gray-400 hover:text-red-400">
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-gray-500">{widget.description}</p>
                    </CardHeader>
                    <CardContent>
                      <ChartRenderer widget={widget} datasets={datasets} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* 保存对话框 */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="bg-gray-900 border-gray-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-gray-100">保存看板</DialogTitle>
            <DialogDescription className="text-gray-500">
              为您的看板设置一个名称，方便以后查找和使用
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <Input value={dashboardName} onChange={(e) => setDashboardName(e.target.value)} placeholder="输入看板名称" className="bg-gray-800/50 border-gray-700 text-gray-200" maxLength={50} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSaveDialog(false)} className="border-gray-700 text-gray-300">
                取消
              </Button>
              <Button onClick={saveDashboard} className="bg-purple-600 hover:bg-purple-700" disabled={!dashboardName.trim()}>
                <Save className="w-4 h-4 mr-2" />
                保存
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== 最终导出 ====================
export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}