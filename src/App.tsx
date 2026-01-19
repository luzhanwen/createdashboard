import { useState, useCallback } from 'react';
import { Upload, FileText, MessageSquare, Lightbulb, Eye, Save, Plus, X, BarChart3, PieChart, LineChart, Table2, Database, Sparkles, LayoutDashboard, CheckCircle, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import ReactECharts from 'echarts-for-react';
import Papa from 'papaparse';
import './App.css';
import { GoogleGenAI } from "@google/genai";

// 类型定义（保持不变）
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
}

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

// 获取API Key并初始化
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('警告: 未配置 Gemini API Key，请在 .env 文件中添加 VITE_GEMINI_API_KEY');
}

// 初始化 GoogleGenAI
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const callGeminiAI = async (dataset: Dataset, userPrompt: string): Promise<ChartWidget[]> => {
  const dataContext = {
    columns: dataset.columns.map(c => ({ name: c.name, type: c.type })),
    sampleData: dataset.rawData.slice(0, 5) // 增加到5行，提供更丰富的上下文
  };

  const prompt = `
    你是一个资深数据分析师。请根据以下数据集信息和用户需求，推荐3-5个最适合的图表。
    
    数据集信息:
    ${JSON.stringify(dataContext, null, 2)}
    
    用户需求: "${userPrompt}"
    
    请严格遵循以下 JSON 格式返回结果（不要包含 Markdown 代码块标记，仅返回纯 JSON 数组）：
    [
      {
        "type": "bar" | "line" | "pie" | "table",
        "title": "图表标题（12字以内）",
        "description": "图表用途描述（30字以内）",
        "xColumn": "作为X轴或分类的列名",
        "yColumn": "作为Y轴或数值的列名"
      }
    ]
    
    规则：
    1. 如果是 "pie" (环形图)，xColumn 对应分类，yColumn 对应数值。
    2. 如果是 "bar" (条形图) 或 "line" (折线图)，xColumn 对应 X 轴，yColumn 对应 Y 轴。
    3. 仅使用数据集中存在的列名。
    4. 优先选择能最好回答用户问题的图表类型。
    5. 确保标题和描述简洁专业。
  `;

  try {
    const result = await genAI.models.generateContent({
      model: "gemini-1.5-flash", // 使用更稳定的版本
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    if (!result || !result.text) {
      throw new Error('AI 返回了空结果');
    }

    let text = result.text();
    
    // 清理可能存在的 Markdown 标记
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    // 验证是否为有效的JSON数组
    let aiSuggestions;
    try {
      aiSuggestions = JSON.parse(text);
      if (!Array.isArray(aiSuggestions)) {
        throw new Error('AI 返回的不是有效的 JSON 数组');
      }
    } catch (parseError) {
      console.error('JSON解析失败:', text);
      throw new Error(`AI 返回格式错误: ${parseError instanceof Error ? parseError.message : '未知错误'}`);
    }

    // 转换为应用所需的 ChartWidget 格式
    return aiSuggestions.map((s: any, index: number) => {
      // 验证必需字段
      if (!s.type || !s.title || !s.description) {
        console.warn('AI建议缺少必需字段:', s);
        return null;
      }

      return {
        id: `ai-${Date.now()}-${index}`,
        type: s.type,
        title: s.title,
        description: s.description,
        dataConfig: {
          datasetId: dataset.id,
          xColumn: (s.type === 'bar' || s.type === 'line') ? s.xColumn : undefined,
          yColumn: (s.type === 'bar' || s.type === 'line') ? s.yColumn : undefined,
          categoryColumn: s.type === 'pie' ? s.xColumn : undefined,
          valueColumn: s.type === 'pie' ? s.yColumn : undefined,
        }
      };
    }).filter(Boolean); // 过滤掉无效的建议
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error(error instanceof Error ? error.message : "AI 分析失败，请检查 API Key 和网络连接");
  }
};

// 图表组件（保持不变）
const ChartRenderer = ({ widget, datasets }: { widget: ChartWidget; datasets: Dataset[] }) => {
  const dataset = datasets.find(d => d.id === widget.dataConfig.datasetId);
  if (!dataset) return <div className="text-center text-gray-400">数据未找到</div>;
  
  const getChartOption = () => {
    switch (widget.type) {
      case 'bar':
        const barData = dataset.rawData.map(row => ({
          name: row[widget.dataConfig.xColumn || ''],
          value: row[widget.dataConfig.yColumn || ''],
        }));
        return {
          backgroundColor: 'transparent',
          title: { text: widget.title, left: 'center', textStyle: { color: '#e5e7eb' } },
          xAxis: { type: 'category', data: barData.map(d => d.name), axisLabel: { color: '#9ca3af' }, axisLine: { lineStyle: { color: '#374151' } } },
          yAxis: { type: 'value', axisLabel: { color: '#9ca3af' }, axisLine: { lineStyle: { color: '#374151' } }, splitLine: { lineStyle: { color: '#374151' } } },
          series: [{ type: 'bar', data: barData.map(d => d.value), itemStyle: { color: '#8b5cf6' } }],
        };
      
      case 'pie':
        const pieData = dataset.rawData.map(row => ({
          name: row[widget.dataConfig.categoryColumn || ''],
          value: row[widget.dataConfig.valueColumn || ''],
        }));
        return {
          backgroundColor: 'transparent',
          title: { text: widget.title, left: 'center', textStyle: { color: '#e5e7eb' } },
          series: [{ type: 'pie', radius: ['40%', '70%'], data: pieData, label: { color: '#e5e7eb' } }],
        };
      
      case 'line':
        const lineData = dataset.rawData.map(row => ({
          name: row[widget.dataConfig.xColumn || ''],
          value: row[widget.dataConfig.yColumn || ''],
        }));
        return {
          backgroundColor: 'transparent',
          title: { text: widget.title, left: 'center', textStyle: { color: '#e5e7eb' } },
          xAxis: { type: 'category', data: lineData.map(d => d.name), axisLabel: { color: '#9ca3af' }, axisLine: { lineStyle: { color: '#374151' } } },
          yAxis: { type: 'value', axisLabel: { color: '#9ca3af' }, axisLine: { lineStyle: { color: '#374151' } }, splitLine: { lineStyle: { color: '#374151' } } },
          series: [{ type: 'line', data: lineData.map(d => d.value), smooth: true, itemStyle: { color: '#a855f7' }, lineStyle: { color: '#a855f7' } }],
        };
      
      default:
        return {};
    }
  };
  
  if (widget.type === 'table') {
    return (
      <div className="overflow-auto h-full bg-gray-900/50 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              {dataset.columns.map(col => (
                <th key={col.name} className="text-left p-3 font-medium text-gray-300">{col.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataset.rawData.slice(0, 10).map((row, idx) => (
              <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800/50">
                {dataset.columns.map(col => (
                  <td key={col.name} className="p-3 text-gray-400">{row[col.name]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  
  return <ReactECharts option={getChartOption()} style={{ height: '280px' }} />;
};

// 主应用组件
function App() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [recommendations, setRecommendations] = useState<ChartWidget[]>([]);
  const [dashboardWidgets, setDashboardWidgets] = useState<ChartWidget[]>([]);
  const [dashboardName, setDashboardName] = useState('我的看板');
  const [savedDashboards, setSavedDashboards] = useState<Dashboard[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [isProcessing, setIsProcessing] = useState(false); // 添加加载状态
  
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
    
    // 文件大小限制 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('文件大小超过10MB限制');
      return;
    }
    
    if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
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
              const values = results.data.map((row: any) => row[field]).filter((v: any) => v !== undefined && v !== null && v !== '');
              const sampleValue = values[0];
              let type: 'string' | 'number' | 'date' = 'string';
              
              if (typeof sampleValue === 'number') {
                type = 'number';
              } else if (sampleValue instanceof Date || (typeof sampleValue === 'string' && !isNaN(Date.parse(sampleValue)))) {
                type = 'date';
              } else if (typeof sampleValue === 'boolean') {
                type = 'string'; // 布尔值转为字符串处理
              }
              
              columns.push({ name: field, type, values });
            });
          }
          
          const newDataset: Dataset = {
            id: `dataset-${Date.now()}`,
            name: file.name.replace(/\.csv$/, ''),
            columns,
            rawData: results.data as any[],
          };
          
          setDatasets(prev => [...prev, newDataset]);
          setSelectedDataset(newDataset);
          toast.success(`数据 "${newDataset.name}" 上传成功！`);
          completeStep(0);
        },
        error: (error: Error) => {
          toast.error('CSV解析失败: ' + error.message);
        },
      });
    } else if (file.type === 'application/json' || file.name.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const jsonData = JSON.parse(e.target?.result as string);
          const dataArray = Array.isArray(jsonData) ? jsonData : [jsonData];
          
          if (dataArray.length === 0) {
            toast.error('JSON数据为空');
            return;
          }
          
          // 验证数据结构
          const firstRow = dataArray[0];
          if (typeof firstRow !== 'object' || firstRow === null) {
            toast.error('JSON数据格式错误：应为对象数组');
            return;
          }
          
          const columns: DataColumn[] = [];
          Object.keys(firstRow).forEach(key => {
            const values = dataArray.map(row => row[key]).filter(v => v !== undefined && v !== null && v !== '');
            const sampleValue = values[0];
            let type: 'string' | 'number' | 'date' = 'string';
            
            if (typeof sampleValue === 'number') {
              type = 'number';
            } else if (sampleValue instanceof Date || (typeof sampleValue === 'string' && !isNaN(Date.parse(sampleValue)))) {
              type = 'date';
            }
            
            columns.push({ name: key, type, values });
          });
          
          const newDataset: Dataset = {
            id: `dataset-${Date.now()}`,
            name: file.name.replace(/\.json$/, ''),
            columns,
            rawData: dataArray,
          };
          
          setDatasets(prev => [...prev, newDataset]);
          setSelectedDataset(newDataset);
          toast.success(`数据 "${newDataset.name}" 上传成功！`);
          completeStep(0);
        } catch (error) {
          console.error('JSON解析错误:', error);
          toast.error('JSON解析失败：' + (error instanceof Error ? error.message : '未知错误'));
        }
      };
      reader.onerror = () => {
        toast.error('文件读取失败');
      };
      reader.readAsText(file);
    } else {
      toast.error('请上传CSV或JSON格式的文件');
    }
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

    if (!GEMINI_API_KEY) {
      toast.error('未配置 Gemini API Key，请检查 .env 文件中的 VITE_GEMINI_API_KEY');
      return;
    }
    
    setIsProcessing(true);
    setAiResponse('正在连接 Gemini AI 进行深度分析...');
    
    try {
      const newRecommendations = await callGeminiAI(selectedDataset, aiPrompt);
      
      if (newRecommendations.length === 0) {
        setAiResponse('AI 未能生成有效的图表建议，请尝试更详细的描述。');
        toast.warning('未生成有效建议');
      } else {
        setRecommendations(newRecommendations);
        setAiResponse(`Gemini AI 已为您生成 ${newRecommendations.length} 个图表建议。`);
        completeStep(1);
        toast.success('AI 分析完成！');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      setAiResponse(`错误: ${errorMessage}`);
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
      widgets: [...dashboardWidgets], // 创建副本避免引用问题
    };
    
    setSavedDashboards(prev => [...prev, newDashboard]);
    setShowSaveDialog(false);
    completeStep(3);
    toast.success(`看板 "${dashboardName}" 保存成功！`);
    
    // 可选：导出为JSON文件
    const dashboardData = JSON.stringify(newDashboard, null, 2);
    const blob = new Blob([dashboardData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dashboardName}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [dashboardName, dashboardWidgets]);
  
  const loadDashboard = useCallback((dashboard: Dashboard) => {
    setDashboardName(dashboard.name);
    setDashboardWidgets([...dashboard.widgets]); // 创建副本
    toast.success(`已加载看板 "${dashboard.name}"`);
  }, []);
  
  // 清空当前看板
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
              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">数据列</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {selectedDataset.columns.map(column => (
                    <div key={column.name} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                      <span className="text-sm font-medium text-gray-300">{column.name}</span>
                      <Badge variant="secondary" className="bg-purple-500/20 text-purple-300 border-purple-500/30">{column.type}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
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
- 展示销售数据的趋势分析，使用时间序列图
- 对比各部门的绩效表现，用条形图排名
- 分析用户地域分布情况，用环形图展示占比
- 展示KPI达成情况，用仪表盘或多指标卡片

提示：描述越具体，AI生成的建议越准确。`
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
            
            <div className="flex items-center justify-center py-4">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <MessageSquare className="w-8 h-8 text-purple-400" />
                </div>
                <p className="text-gray-400 text-sm">
                  {isProcessing ? 'AI正在分析您的需求...' : 'AI正在等待您的指令...'}
                </p>
              </div>
            </div>
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
      {/* 顶部导航 */}
      <header className="bg-gray-900/80 backdrop-blur-sm border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-700 rounded-lg flex items-center justify-center shadow-lg shadow-purple-500/20">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-100">AI看板制作平台</h1>
              <p className="text-sm text-gray-500">智能数据可视化工具</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <Input value={dashboardName} onChange={(e) => setDashboardName(e.target.value)} placeholder="看板名称" className="w-48 bg-gray-800/50 border-gray-700 text-gray-200 focus:border-purple-500" />
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
                    isActive
                      ? 'bg-purple-600/20 text-purple-300 border border-purple-500/50 shadow-md shadow-purple-500/20'
                      : isCompleted
                      ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                      : 'bg-gray-800/50 text-gray-500 border border-gray-700/50'
                  } ${isClickable ? 'cursor-pointer hover:opacity-80' : 'cursor-not-allowed opacity-40'}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    isCompleted
                      ? 'bg-green-500 text-white'
                      : isActive
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'bg-gray-700 text-gray-400'
                  }`}>
                    {isCompleted ? <CheckCircle className="w-5 h-5" /> : <step.icon className="w-4 h-4" />}
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-sm">{step.name}</div>
                    <div className="text-xs opacity-70">{step.description}</div>
                  </div>
                </button>
                
                {index < steps.length - 1 && (
                  <ChevronRight className={`w-6 h-6 mx-2 ${
                    isCompleted ? 'text-green-500/50' : 'text-gray-700'
                  }`} />
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
                
                {/* 快速开始提示 */}
                <div className="bg-purple-500/10 rounded-lg border border-purple-500/20 p-4">
                  <h4 className="text-sm font-medium text-purple-300 mb-2">快速开始：</h4>
                  <ol className="text-xs text-gray-400 space-y-1 text-left">
                    <li className="flex items-start gap-2">
                      <span className="text-purple-400 mt-0.5">1.</span>
                      上传CSV或JSON数据文件
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-purple-400 mt-0.5">2.</span>
                      在AI对话框中描述您的分析需求
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-purple-400 mt-0.5">3.</span>
                      选择AI生成的图表并添加到看板
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-gray-100">{dashboardName}</h2>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">共 {dashboardWidgets.length} 个图表</span>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={clearDashboard}
                    className="border-gray-700 text-gray-400 hover:border-red-500/50 hover:text-red-400"
                  >
                    清空看板
                  </Button>
                </div>
              </div>
              
              {/* 看板网格 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 auto-rows-fr">
                {dashboardWidgets.map(widget => (
                  <Card key={widget.id} className="bg-gray-900/50 border-gray-800 hover:border-purple-500/30 transition-all hover:shadow-lg hover:shadow-purple-500/10">
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
            <Input 
              value={dashboardName} 
              onChange={(e) => setDashboardName(e.target.value)} 
              placeholder="输入看板名称" 
              className="bg-gray-800/50 border-gray-700 text-gray-200 focus:border-purple-500"
              maxLength={50}
            />
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{dashboardName.length}/50</span>
              <span>{dashboardWidgets.length} 个图表</span>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSaveDialog(false)} className="border-gray-700 text-gray-300 hover:bg-gray-800">
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

export default App;