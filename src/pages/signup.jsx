import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useNavigate } from 'react-router-dom'

function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const navigate = useNavigate()

  const handleSignup = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSuccess(true)
      setLoading(false)
      // Redirect to login after 2 seconds
      setTimeout(() => navigate('/login'), 2000)
    }
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: '#0a0a1f',
      color: '#fff'
    }}>
      <div style={{
        background: '#1a1a2e',
        padding: '40px',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '400px',
        border: '1px solid #2d2d44'
      }}>
        <h1 style={{ 
          fontSize: '2rem', 
          fontWeight: 'bold', 
          marginBottom: '10px',
          color: '#00ff9d'
        }}>
          Create Account
        </h1>
        <p style={{ color: '#888', marginBottom: '30px' }}>
          Start using DeckMage for your shop
        </p>

        {error && (
          <div style={{
            background: '#e63946',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '14px'
          }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{
            background: '#00ff9d',
            color: '#0a0a1f',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '14px',
            fontWeight: 'bold'
          }}>
            ✅ Account created! Check your email to verify. Redirecting...
          </div>
        )}

        <form onSubmit={handleSignup}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '12px',
                background: '#0a0a1f',
                border: '1px solid #2d2d44',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '16px'
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              style={{
                width: '100%',
                padding: '12px',
                background: '#0a0a1f',
                border: '1px solid #2d2d44',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '16px'
              }}
            />
            <p style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              Minimum 6 characters
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || success}
            style={{
              width: '100%',
              padding: '14px',
              background: 'linear-gradient(135deg, #00ff9d, #2a9d8f)',
              border: 'none',
              borderRadius: '8px',
              color: '#0a0a1f',
              fontWeight: 'bold',
              fontSize: '16px',
              cursor: (loading || success) ? 'not-allowed' : 'pointer',
              opacity: (loading || success) ? 0.6 : 1
            }}
          >
            {loading ? 'Creating account...' : 'Sign Up'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '14px', color: '#888' }}>
          Already have an account?{' '}
          <a href="/login" style={{ color: '#00ff9d', textDecoration: 'none' }}>
            Sign in
          </a>
        </p>
      </div>
    </div>
  )
}

export default Signup