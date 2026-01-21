// src/components/ErrorBoundary.tsx
import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
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
           {/* 错误 UI */}
           <Card className="bg-gray-800 border-red-600">
             <CardHeader><CardTitle className="text-red-400">出错了</CardTitle></CardHeader>
             <CardContent>
               <Button onClick={() => window.location.reload()}>刷新</Button>
             </CardContent>
           </Card>
        </div>
      );
    }
    return this.props.children;
  }
}