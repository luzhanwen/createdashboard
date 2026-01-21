import React, { useState, useCallback } from 'react';
import Papa from 'papaparse';
import { toast, Toaster } from 'sonner';
import { 
  Upload, Sparkles, Lightbulb, LayoutDashboard, Plus, X, Save, 
  BarChart3, Shield, CheckCircle, ChevronRight, Eye
} from 'lucide-react';

// 组件与服务导入
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ChartRenderer } from '@/components/ChartRenderer';
import { apiKeyManager, callGeminiAI } from '@/services/ai-service';
import { DataDiagnostics } from '@/lib/data-utils';
import { Dataset, ChartWidget, Dashboard, DataColumn } from '@/types';

// 常量定义 (也可以提取到 src/constants.ts)
const steps = [
  { id: 'data', name: '数据上传', icon: Upload, description: '上传并选择数据' },
  { id: 'ai', name: 'AI对话', icon: Sparkles, description: '描述看板需求' },
  { id: 'suggestions', name: '图表建议', icon: Lightbulb, description: '选择AI生成的图表' },
  { id: 'preview', name: '看板预览', icon: LayoutDashboard, description: '预览和保存看板' },
];

export default function App() {
  // 状态管理
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [recommendations, setRecommendations] = useState<ChartWidget[]>([]);
  const [dashboardWidgets, setDashboardWidgets] = useState<ChartWidget[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  // ... 其他状态 (showSaveDialog, dashboardName 等)

  // 业务逻辑处理函数
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    // ... 原有的 Papa.parse 逻辑 ...
    // 使用 DataDiagnostics.run(newDataset)
  }, []);

  const handleAiSubmit = async () => {
    if (!selectedDataset || !aiPrompt) return;
    setIsProcessing(true);
    try {
      const results = await callGeminiAI(selectedDataset, aiPrompt);
      setRecommendations(results);
      setAiResponse(`生成了 ${results.length} 个建议`);
      setCurrentStep(2); // 跳转步骤
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // 渲染逻辑
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900">
        <Toaster position="top-center" theme="dark" />
        
        {/* Header */}
        <header className="px-6 py-4 border-b border-gray-800 bg-gray-900/80 backdrop-blur">
          {/* ... Header 内容 ... */}
        </header>

        {/* 步骤条 */}
        <div className="px-6 py-4 border-b border-gray-800">
          {/* ... 步骤条渲染逻辑 (steps.map) ... */}
        </div>

        {/* 主内容区域 */}
        <div className="flex h-[calc(100vh-160px)]">
          {/* 左侧操作区 */}
          <div className="w-96 border-r border-gray-800 p-6 overflow-auto bg-gray-900/50">
             {currentStep === 0 && (
               /* 上传组件 UI */
               <div className="space-y-6">
                 {/* ... */}
               </div>
             )}
             
             {currentStep === 1 && (
               /* AI 对话 UI */
               <div className="space-y-4">
                  <Textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} />
                  <Button onClick={handleAiSubmit} disabled={isProcessing}>生成建议</Button>
               </div>
             )}

             {currentStep === 2 && (
               /* 建议列表 UI */
               <div className="space-y-3">
                 {recommendations.map(widget => (
                   <Card key={widget.id}>
                     {/* ... widget card ... */}
                     <Button onClick={() => setDashboardWidgets([...dashboardWidgets, widget])}>添加</Button>
                   </Card>
                 ))}
               </div>
             )}
          </div>

          {/* 右侧预览区 */}
          <div className="flex-1 p-6 overflow-auto">
             <div className="grid grid-cols-2 gap-6">
               {dashboardWidgets.map(widget => (
                 <Card key={widget.id}>
                   <CardHeader>
                     <CardTitle>{widget.title}</CardTitle>
                     <Button onClick={() => /* remove */ {}}><X /></Button>
                   </CardHeader>
                   <CardContent>
                     {/* 使用提取出的组件渲染图表 */}
                     <ChartRenderer widget={widget} datasets={datasets} />
                   </CardContent>
                 </Card>
               ))}
             </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}