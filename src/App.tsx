import "./App.css"
import { AuthProvider } from "./auth/auth-context"
import UploadFiles from "./components/upload-files"
const App = () => {
  return (
    <AuthProvider>
      <UploadFiles />
    </AuthProvider>
  )
}

export default App
