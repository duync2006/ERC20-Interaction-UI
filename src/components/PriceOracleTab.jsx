import { useState, useEffect, useRef } from 'react'
import Web3 from 'web3'
import { RPC_URL, PRICE_ORACLE_ADDRESS } from './constants'
import { ORACLE_ABI } from '../../priceOracleABI'

const PRICE_PAIRS = [
  { baseToken: 'USDT', quoteToken: 'YENX' },
  { baseToken: 'USDT', quoteToken: 'SGDX' },
  { baseToken: 'USDT', quoteToken: 'VNDX' },
  { baseToken: 'SGDX', quoteToken: 'YENX' },
  { baseToken: 'SGDX', quoteToken: 'VNDX' },
  { baseToken: 'YENX', quoteToken: 'VNDX' },
]

const REFRESH_INTERVAL = 11

const PriceOracleTab = () => {
  const [prices, setPrices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdate, setLastUpdate] = useState(null)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL)
  const intervalRef = useRef(null)
  const countdownRef = useRef(null)

  const fetchPrices = async () => {
    try {
      const web3 = new Web3(RPC_URL)
      const oracleContract = new web3.eth.Contract(ORACLE_ABI, PRICE_ORACLE_ADDRESS)

      const priceData = await Promise.all(
        PRICE_PAIRS.map(async (pair) => {
          try {
            const result = await oracleContract.methods.getPrice(pair.baseToken, pair.quoteToken).call()
            const priceInEther = web3.utils.fromWei(result.price.toString(), 'ether')
            const updatedAt = new Date(Number(result.updatedAt) * 1000)
            return {
              ...pair,
              price: parseFloat(priceInEther),
              updatedAt,
              error: null
            }
          } catch (err) {
            return {
              ...pair,
              price: null,
              updatedAt: null,
              error: 'Price not found'
            }
          }
        })
      )

      setPrices(priceData)
      setLastUpdate(new Date())
      setCountdown(REFRESH_INTERVAL)
      setError('')
    } catch (err) {
      console.error('Error fetching prices:', err)
      setError('Failed to fetch prices from Oracle')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPrices()

    intervalRef.current = setInterval(fetchPrices, REFRESH_INTERVAL * 1000)

    countdownRef.current = setInterval(() => {
      setCountdown(prev => (prev > 0 ? prev - 1 : REFRESH_INTERVAL))
    }, 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current)
      }
    }
  }, [])

  const formatPrice = (price) => {
    if (price === null) return 'N/A'
    if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    if (price >= 1) return price.toFixed(4)
    return price.toFixed(8)
  }

  const formatTime = (date) => {
    if (!date) return 'N/A'
    return date.toLocaleTimeString()
  }

  return (
    <div className="form-container">
      <div className="contract-info-card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3 style={{ margin: 0 }}>Price Oracle</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {lastUpdate && (
              <span style={{ fontSize: '12px', color: '#666' }}>
                Last update: {formatTime(lastUpdate)}
              </span>
            )}
            <button
              onClick={fetchPrices}
              disabled={loading}
              style={{
                padding: '6px 12px',
                fontSize: '14px',
                backgroundColor: '#2196F3',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
            <span style={{ fontSize: '12px', color: '#888' }}>
              Next refresh in
            </span>
            <span style={{
              fontSize: '14px',
              fontWeight: 'bold',
              color: countdown <= 3 ? '#f44336' : '#00bcd4',
              minWidth: '20px',
              textAlign: 'center',
              transition: 'color 0.3s ease'
            }}>
              {countdown}s
            </span>
          </div>
          <div style={{
            width: '100%',
            height: '4px',
            backgroundColor: '#e0e0e0',
            borderRadius: '2px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${(countdown / REFRESH_INTERVAL) * 100}%`,
              height: '100%',
              backgroundColor: countdown <= 3 ? '#f44336' : '#00bcd4',
              borderRadius: '2px',
              transition: 'width 1s linear, background-color 0.3s ease'
            }} />
          </div>
        </div>

        {error && (
          <div className="error-message" style={{ marginBottom: '15px' }}>
            <p>{error}</p>
          </div>
        )}

        {loading && prices.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <p>Loading prices...</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #ddd' }}>
                  <th className="info-label" style={{ padding: '12px 8px', textAlign: 'left' }}>Pair</th>
                  <th className="info-label" style={{ padding: '12px 8px', textAlign: 'right' }}>Price</th>
                  <th className="info-label" style={{ padding: '12px 8px', textAlign: 'right' }}>Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {prices.map((item, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                    <td className="info-value-1" style={{ padding: '12px 8px', fontWeight: 'bold' }}>
                      {item.baseToken}/{item.quoteToken}
                    </td>
                    <td className="info-value-1" style={{ padding: '12px 8px', textAlign: 'right' }}>
                      {item.error ? (
                        <span style={{ color: '#f44336' }}>{item.error}</span>
                      ) : (
                        <span style={{ color: '#4CAF50', fontFamily: 'monospace' }}>
                          {formatPrice(item.price)}
                        </span>
                      )}
                    </td>
                    <td className="info-value-1" style={{ padding: '12px 8px', textAlign: 'right', fontSize: '12px', color: '#666' }}>
                      {item.updatedAt ? item.updatedAt.toLocaleString() : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="contract-info-card">
        <h4 style={{ marginBottom: '10px' }}>Contract Info</h4>
        <div className="info-item">
          <span className="info-label">Oracle Address:</span>
          <span className="info-value" style={{ fontFamily: 'monospace', fontSize: '12px', wordBreak: 'break-all' }}>
            {PRICE_ORACLE_ADDRESS}
          </span>
        </div>
      </div>
    </div>
  )
}

export default PriceOracleTab
