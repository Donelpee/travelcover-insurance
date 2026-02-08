import { BrowserRouter, Routes, Route } from 'react-router-dom'
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
import SMSScheduleRules from './pages/SMSScheduleRules'
import ScheduledMessages from './pages/ScheduledMessages'
import { Toaster } from 'react-hot-toast'
import EmailTemplates from './pages/EmailTemplates'


function App() {
  return ( 
    <>
      <Toaster position="top-right" />
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
            <Route path="/message-schedule-rules" element={<SMSScheduleRules />} />
            <Route path="/scheduled-messages" element={<ScheduledMessages />} />
            <Route path="/email-templates" element={<EmailTemplates />} />
           
          </Route>
        </Routes>
      </BrowserRouter>
    </>
  )
}

export default App