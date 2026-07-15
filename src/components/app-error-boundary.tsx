import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

type AppErrorBoundaryProps = {
    children: ReactNode;
};

type AppErrorBoundaryState = {
    hasError: boolean;
};

class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
    state: AppErrorBoundaryState = { hasError: false };

    static getDerivedStateFromError(): AppErrorBoundaryState {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error("Huzzi AI interface error", error, info);
    }

    render() {
        if (this.state.hasError) {
            return (
                <main className="app-crash-state">
                    <span><AlertTriangle aria-hidden="true" /></span>
                    <p className="section-kicker">Interface recovery</p>
                    <h1>The scanner hit a display problem.</h1>
                    <p>Your photo was not lost. Reload the interface and try the scan again.</p>
                    <button type="button" onClick={() => window.location.reload()}>
                        <RefreshCw size={18} /> Reload scanner
                    </button>
                </main>
            );
        }

        return this.props.children;
    }
}

export default AppErrorBoundary;
