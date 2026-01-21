// src/types/index.ts
export interface DataColumn {
  name: string;
  type: 'string' | 'number' | 'date';
  values: any[];
}

export interface Dataset {
  id: string;
  name: string;
  columns: DataColumn[];
  rawData: any[];
  uploadTime: string;
}

export interface ChartWidget {
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

export interface Dashboard {
  id: string;
  name: string;
  widgets: ChartWidget[];
  createTime: string;
}