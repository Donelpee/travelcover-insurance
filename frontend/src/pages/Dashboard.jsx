import { useEffect, useState } from 'react'
import { supabase } from '../services/supabase'
import { Truck, MapPin, Users, FileText, Send, CheckCircle, XCircle, Mail, MessageSquare } from 'lucide-react'

// StatCard component OUTSIDE of Dashboard (fixes "static-components" error)
function StatCard({ icon: Icon, title, value, color, loading, subtitle }) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-500 text-sm font-medium">{title}</p>
          <p className={`text-3xl font-bold mt-2 ${color}`}>
            {loading ? '...' : value.toLocaleString()}
          </p>
          {subtitle && (
            <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
          )}
        </div>
        <div className={`p-3 rounded-full ${color.replace('text', 'bg').replace('600', '100')}`}>
          <Icon className={color} size={28} />
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalCompanies: 0,
    totalRoutes: 0,
    totalPassengers: 0,
    totalManifests: 0,
    // SMS Stats
    smsSent: 0,
    smsDelivered: 0,
    smsFailed: 0,
    smsTotal: 0,
    // Email Stats
    emailSent: 0,
    emailDelivered: 0,
    emailFailed: 0,
    emailTotal: 0,
    // Combined Stats
    totalMessagesSent: 0,
    totalMessagesDelivered: 0,
    totalMessagesFailed: 0
  })

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Fetch stats when component mounts
    async function fetchStats() {
      try {
        // Fetch all stats from database
        const { count: companiesCount } = await supabase
          .from('transport_companies')
          .select('*', { count: 'exact', head: true })

        const { count: routesCount } = await supabase
          .from('routes')
          .select('*', { count: 'exact', head: true })

        const { count: passengersCount } = await supabase
          .from('passengers')
          .select('*', { count: 'exact', head: true })

        const { count: manifestsCount } = await supabase
          .from('manifests')
          .select('*', { count: 'exact', head: true })

        // Fetch SMS logs
        const { data: smsLogs } = await supabase
          .from('sms_logs')
          .select('status')

        // Fetch Email logs
        const { data: emailLogs } = await supabase
          .from('email_logs')
          .select('status')

        // Count SMS by status
        const smsTotal = smsLogs?.length || 0
        const smsSent = smsLogs?.filter(log => log.status === 'sent').length || 0
        const smsFailed = smsLogs?.filter(log => log.status === 'failed').length || 0

        // Count Email by status
        const emailTotal = emailLogs?.length || 0
        const emailSent = emailLogs?.filter(log => log.status === 'sent').length || 0
        const emailFailed = emailLogs?.filter(log => log.status === 'failed').length || 0

        // Combined totals
        const totalSent = smsSent + emailSent
        const totalFailed = smsFailed + emailFailed
        const totalMessages = smsTotal + emailTotal

        setStats({
          totalCompanies: companiesCount || 0,
          totalRoutes: routesCount || 0,
          totalPassengers: passengersCount || 0,
          totalManifests: manifestsCount || 0,
          // SMS Stats
          smsSent: smsSent,
          smsDelivered: smsSent, // "sent" means delivered for our purposes
          smsFailed: smsFailed,
          smsTotal: smsTotal,
          // Email Stats
          emailSent: emailSent,
          emailDelivered: emailSent, // "sent" means delivered for our purposes
          emailFailed: emailFailed,
          emailTotal: emailTotal,
          // Combined Stats
          totalMessagesSent: totalMessages,
          totalMessagesDelivered: totalSent,
          totalMessagesFailed: totalFailed
        })

        setLoading(false)
      } catch (error) {
        console.error('Error fetching stats:', error)
        setLoading(false)
      }
    }

    fetchStats()
  }, []) // Empty dependency array means this runs once on mount

  return (
    <div>
      <h2 className="text-3xl font-bold text-gray-800 mb-8">Dashboard</h2>

      {/* Company Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          icon={Truck}
          title="Transport Companies"
          value={stats.totalCompanies}
          color="text-blue-600"
          loading={loading}
        />
        <StatCard
          icon={MapPin}
          title="Total Routes"
          value={stats.totalRoutes}
          color="text-green-600"
          loading={loading}
        />
        <StatCard
          icon={Users}
          title="Total Passengers"
          value={stats.totalPassengers}
          color="text-purple-600"
          loading={loading}
        />
        <StatCard
          icon={FileText}
          title="Total Manifests"
          value={stats.totalManifests}
          color="text-orange-600"
          loading={loading}
        />
      </div>

      {/* Combined Message Stats */}
      <h3 className="text-xl font-semibold text-gray-800 mb-4">Message Statistics (SMS + Email)</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard
          icon={Send}
          title="Total Messages Sent"
          value={stats.totalMessagesSent}
          color="text-indigo-600"
          loading={loading}
          subtitle={`SMS: ${stats.smsTotal} | Email: ${stats.emailTotal}`}
        />
        <StatCard
          icon={CheckCircle}
          title="Messages Delivered"
          value={stats.totalMessagesDelivered}
          color="text-green-600"
          loading={loading}
          subtitle={`SMS: ${stats.smsDelivered} | Email: ${stats.emailDelivered}`}
        />
        <StatCard
          icon={XCircle}
          title="Messages Failed"
          value={stats.totalMessagesFailed}
          color="text-red-600"
          loading={loading}
          subtitle={`SMS: ${stats.smsFailed} | Email: ${stats.emailFailed}`}
        />
      </div>

      {/* Separate SMS & Email Stats */}
      <h3 className="text-xl font-semibold text-gray-800 mb-4">Detailed Breakdown</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* SMS Stats */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center mb-4">
            <MessageSquare className="text-blue-600 mr-2" size={24} />
            <h4 className="text-lg font-semibold text-gray-800">SMS Statistics</h4>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Total Sent:</span>
              <span className="font-bold text-blue-600">{loading ? '...' : stats.smsTotal}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Delivered:</span>
              <span className="font-bold text-green-600">{loading ? '...' : stats.smsDelivered}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Failed:</span>
              <span className="font-bold text-red-600">{loading ? '...' : stats.smsFailed}</span>
            </div>
            <div className="pt-2 border-t">
              <div className="flex justify-between">
                <span className="text-gray-600">Success Rate:</span>
                <span className="font-bold text-indigo-600">
                  {loading ? '...' : stats.smsTotal > 0 
                    ? `${Math.round((stats.smsDelivered / stats.smsTotal) * 100)}%`
                    : '0%'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Email Stats */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center mb-4">
            <Mail className="text-purple-600 mr-2" size={24} />
            <h4 className="text-lg font-semibold text-gray-800">Email Statistics</h4>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Total Sent:</span>
              <span className="font-bold text-purple-600">{loading ? '...' : stats.emailTotal}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Delivered:</span>
              <span className="font-bold text-green-600">{loading ? '...' : stats.emailDelivered}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Failed:</span>
              <span className="font-bold text-red-600">{loading ? '...' : stats.emailFailed}</span>
            </div>
            <div className="pt-2 border-t">
              <div className="flex justify-between">
                <span className="text-gray-600">Success Rate:</span>
                <span className="font-bold text-indigo-600">
                  {loading ? '...' : stats.emailTotal > 0 
                    ? `${Math.round((stats.emailDelivered / stats.emailTotal) * 100)}%`
                    : '0%'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Welcome Message */}
      <div className="mt-8 bg-blue-50 border-l-4 border-blue-600 p-6 rounded">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">
          Welcome to TravelCover Insurance Management System
        </h3>
        <p className="text-blue-700">
          Start by adding transport companies and routes, then capture passenger manifests to send insurance notifications via SMS and Email.
        </p>
      </div>
    </div>
  )
}