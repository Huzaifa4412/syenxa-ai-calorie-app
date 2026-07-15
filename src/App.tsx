import "./App.css"
import { AuthProvider } from "./auth/auth-context"
import AppErrorBoundary from "./components/app-error-boundary"
import UploadFiles from "./components/upload-files"
const App = () => {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <UploadFiles />
      </AuthProvider>
    </AppErrorBoundary>
  )
}

export default App
