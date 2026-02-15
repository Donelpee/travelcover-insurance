import { useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import TransportCompanies from './pages/TransportCompanies'
import CaptureManifest from './pages/CaptureManifest'
import EditManifest from './pages/EditManifest'
import SendSMS from './pages/SendSMS'
import ManifestsHistory from './pages/ManifestsHistory'
import SMSLogs from './pages/SMSLogs'
import ManifestDetails from './pages/ManifestDetails'
import AdminSettings from './pages/AdminSettings'
import { Toaster } from 'react-hot-toast'
import JourneyAutomation from './pages/JourneyAutomation'
import { processDueNotifications } from './services/notificationService'


function App() {
  const isProcessingRef = useRef(false)

  useEffect(() => {
    let isMounted = true

    const runDueProcessor = async () => {
      if (!isMounted || isProcessingRef.current) return

      isProcessingRef.current = true
      try {
        await processDueNotifications({ rpcOnly: true })
      } finally {
        isProcessingRef.current = false
      }
    }

    runDueProcessor()

    const intervalId = window.setInterval(runDueProcessor, 60000)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runDueProcessor()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      isMounted = false
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  return ( 
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3500,
          style: {
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            color: '#0f172a',
            boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)'
          }
        }}
      />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="/companies" element={<TransportCompanies />} />
            <Route path="/capture-manifest" element={<CaptureManifest />} />
            <Route path="/edit-manifest" element={<EditManifest />} />
            <Route path="/send-sms" element={<SendSMS />} />
            <Route path="/manifests" element={<ManifestsHistory />} />
            <Route path="/manifest-details/:manifestId" element={<ManifestDetails />} />
            <Route path="/message-logs" element={<SMSLogs />} />
            <Route path="/admin-settings" element={<AdminSettings />} />
            <Route path="/message-schedule-rules" element={<JourneyAutomation />} />
            <Route path="/scheduled-messages" element={<JourneyAutomation />} />
            <Route path="/email-templates" element={<Navigate to="/admin-settings?tab=email-templates" replace />} />
            <Route path="/automation" element={<JourneyAutomation />} />
           
          </Route>
        </Routes>
      </BrowserRouter>
    </>
  )
}

export default App