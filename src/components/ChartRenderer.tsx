// src/components/ChartRenderer.tsx
import ReactECharts from 'echarts-for-react';
import { AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ChartWidget, Dataset } from '@/types';
import { DataDiagnostics } from '@/lib/utils';

interface ChartRendererProps {
  widget: ChartWidget;
  datasets: Dataset[];
}

export const ChartRenderer = ({ widget, datasets }: ChartRendererProps) => {
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
  const validateConfig = () => {
    if (widget.type === 'table') return { valid: true };
    const { xColumn, yColumn, categoryColumn, valueColumn } = widget.dataConfig;
    const xCol = xColumn || categoryColumn;
    const yCol = yColumn || valueColumn;
    
    if (!xCol || !yCol) return { valid: false, message: '配置不完整' };
    if (!dataset.columns.some(c => c.name === xCol)) return { valid: false, message: `列 "${xCol}" 不存在` };
    if (!dataset.columns.some(c => c.name === yCol)) return { valid: false, message: `列 "${yCol}" 不存在` };
    return { valid: true };
  };

  const validation = validateConfig();
  if (!validation.valid) {
    return <div className="text-orange-400 p-4">{validation.message}</div>;
  }

  if (widget.type === 'table') {
    return (
      <div className="overflow-auto h-64 bg-gray-900/50 rounded-lg">
        {/* 表格渲染代码 ... 可以继续拆分为 TableWidget 组件 */}
        <table className="w-full text-sm text-gray-300">
             {/* ... */}
        </table>
      </div>
    );
  }

  const getChartOption = () => {
    // 复用之前的 getChartOption 逻辑，使用 DataDiagnostics.cleanChartData
    // ... 这里省略具体实现以节省篇幅，直接拷贝原逻辑即可
    // 示例：
    const xCol = widget.dataConfig.xColumn || widget.dataConfig.categoryColumn;
    const yCol = widget.dataConfig.yColumn || widget.dataConfig.valueColumn;
    const cleanData = DataDiagnostics.cleanChartData(dataset.rawData, xCol!, yCol!);
    
    // 返回 ECharts option 对象
    return {
        // ... ECharts 配置
    };
  };

  return (
    <ReactECharts 
      option={getChartOption()} 
      style={{ height: '320px', width: '100%' }}
      notMerge={true}
    />
  );
};