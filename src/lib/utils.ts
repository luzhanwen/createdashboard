// src/lib/data-utils.ts
import { DataColumn, Dataset } from '../types';

export const DataDiagnostics = {
  run(dataset: Dataset): void {
    console.group(`📊 数据集诊断: ${dataset.name}`);
    console.log('总记录数:', dataset.rawData.length);
    dataset.columns.forEach(col => {
      const stats = this.analyzeColumn(col);
      console.log(`🔸 ${col.name} (${col.type}):`, stats);
    });
    console.log('前3行样本:', dataset.rawData.slice(0, 3));
    console.groupEnd();
  },

  analyzeColumn(column: DataColumn) {
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