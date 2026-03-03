import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 min-h-[200px]">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <svg
              className="w-7 h-7 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-900 mb-1">
            {this.props.fallbackMessage ?? 'Nastala neočekávaná chyba'}
          </p>
          <p className="text-xs text-gray-500 mb-4 max-w-md text-center">
            {this.state.error?.message}
          </p>
          <button
            onClick={this.handleReset}
            className="px-4 py-1.5 rounded border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Zkusit znovu
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
