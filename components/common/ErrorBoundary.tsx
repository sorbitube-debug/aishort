import React, { ErrorInfo, ReactNode } from 'react';
import { Icon } from './Icon';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 font-sans" dir="rtl">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 max-w-md w-full text-center shadow-2xl">
            <Icon name="error" className="text-6xl text-red-500 mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">اوه! مشکلی پیش آمد</h2>
            <p className="text-gray-400 mb-6">
              متاسفانه خطای غیرمنتظره‌ای رخ داده است.
            </p>
            {this.state.error && (
              <div className="bg-red-900/30 border border-red-800 rounded p-3 mb-6 text-right">
                 <p className="text-red-300 text-xs font-mono break-all">
                   {this.state.error.toString()}
                 </p>
              </div>
            )}
            <button
              onClick={this.handleReload}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 mx-auto"
            >
              <Icon name="refresh" />
              تلاش مجدد
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;