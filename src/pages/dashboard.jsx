import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useNavigate } from 'react-router-dom'

function Dashboard() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    // Check if user is logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user)
      } else {
        navigate('/login')
      }
      setLoading(false)
    })
  }, [navigate])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#0a0a1f',
        color: '#fff'
      }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{ 
      minHeight: '100vh',
      background: '#0a0a1f',
      color: '#fff'
    }}>
      {/* Header */}
      <nav style={{
        background: '#1a1a2e',
        borderBottom: '2px solid #00ff9d',
        padding: '20px 40px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#00ff9d' }}>
            🃏 DeckMage
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <span style={{ color: '#888', fontSize: '14px' }}>{user?.email}</span>
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: '1px solid #2d2d44',
              borderRadius: '8px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Logout
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '10px' }}>
          Welcome to DeckMage! 🎉
        </h2>
        <p style={{ color: '#888', marginBottom: '40px' }}>
          Your professional deck builder dashboard
        </p>

        {/* Stats Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '20px',
          marginBottom: '40px'
        }}>
          <div style={{
            background: '#1a1a2e',
            border: '1px solid #2d2d44',
            borderRadius: '16px',
            padding: '24px'
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📊</div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '4px' }}>
              0
            </h3>
            <p style={{ color: '#888', fontSize: '14px' }}>Total Products</p>
          </div>

          <div style={{
            background: '#1a1a2e',
            border: '1px solid #2d2d44',
            borderRadius: '16px',
            padding: '24px'
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>🛒</div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '4px' }}>
              0
            </h3>
            <p style={{ color: '#888', fontSize: '14px' }}>Deck Builds</p>
          </div>

          <div style={{
            background: '#1a1a2e',
            border: '1px solid #2d2d44',
            borderRadius: '16px',
            padding: '24px'
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>💰</div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '4px' }}>
              $0.00
            </h3>
            <p style={{ color: '#888', fontSize: '14px' }}>Revenue</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{
          background: '#1a1a2e',
          border: '1px solid #2d2d44',
          borderRadius: '16px',
          padding: '32px'
        }}>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '20px' }}>
            Quick Actions
          </h3>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <button style={{
              padding: '12px 24px',
              background: 'linear-gradient(135deg, #00ff9d, #2a9d8f)',
              border: 'none',
              borderRadius: '8px',
              color: '#0a0a1f',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}>
              Connect Store
            </button>
            <button style={{
              padding: '12px 24px',
              background: 'transparent',
              border: '1px solid #2d2d44',
              borderRadius: '8px',
              color: '#fff',
              cursor: 'pointer'
            }}>
              View Analytics
            </button>
            <button style={{
              padding: '12px 24px',
              background: 'transparent',
              border: '1px solid #2d2d44',
              borderRadius: '8px',
              color: '#fff',
              cursor: 'pointer'
            }}>
              Get Embed Code
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard