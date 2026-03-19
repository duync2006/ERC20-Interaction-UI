import { useState, useEffect, useRef, useCallback } from 'react'
import Web3 from 'web3'
import { RPC_URL, RPC_URL_WS, PRICE_ORACLE_ADDRESS } from './constants'
import { ORACLE_ABI } from '../../priceOracleABI'

const PRICE_PAIRS = [
  { baseToken: 'USDT', quoteToken: 'YENX' },
  { baseToken: 'USDT', quoteToken: 'SGDX' },
  { baseToken: 'USDT', quoteToken: 'VNDX' },
  { baseToken: 'SGDX', quoteToken: 'YENX' },
  { baseToken: 'SGDX', quoteToken: 'VNDX' },
  { baseToken: 'YENX', quoteToken: 'VNDX' },
]

const FALLBACK_INTERVAL = 30 // Fallback polling interval when WebSocket is connected

const PriceOracleTab = () => {
  const [prices, setPrices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdate, setLastUpdate] = useState(null)
  const [wsConnected, setWsConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState(null)
  const intervalRef = useRef(null)
  const wsWeb3Ref = useRef(null)
  const subscriptionRef = useRef(null)

  const fetchPrices = useCallback(async () => {
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
      setError('')
    } catch (err) {
      console.error('Error fetching prices:', err)
      setError('Failed to fetch prices from Oracle')
    } finally {
      setLoading(false)
    }
  }, [])

  // Setup WebSocket connection and event listener
  useEffect(() => {
    fetchPrices()

    // Setup WebSocket for event listening
    const setupWebSocket = () => {
      try {
        const wsOptions = {
          timeout: 30000,
          reconnect: {
            auto: true,
            delay: 5000,
            maxAttempts: 10,
            onTimeout: false
          },
          clientConfig: {
            maxReceivedFrameSize: 100000000,
            maxReceivedMessageSize: 100000000,
          }
        }

        const wsProvider = new Web3.providers.WebsocketProvider(RPC_URL_WS, wsOptions)
        wsWeb3Ref.current = new Web3(wsProvider)

        const oracleContract = new wsWeb3Ref.current.eth.Contract(ORACLE_ABI, PRICE_ORACLE_ADDRESS)

        // Subscribe to PriceUpdated events
        subscriptionRef.current = oracleContract.events.PriceUpdated({})
          .on('data', (event) => {
            console.log('PriceUpdated event:', event)
            setLastEvent({
              baseToken: event.returnValues.baseToken,
              quoteToken: event.returnValues.quoteToken,
              timestamp: new Date()
            })
            // Refresh all prices when any price is updated
            fetchPrices()
          })
          .on('error', (err) => {
            console.error('Event subscription error:', err)
            setWsConnected(false)
          })

        wsProvider.on('connect', () => {
          console.log('WebSocket connected')
          setWsConnected(true)
        })

        wsProvider.on('error', (err) => {
          console.error('WebSocket error:', err)
          setWsConnected(false)
        })

        wsProvider.on('end', () => {
          console.log('WebSocket disconnected')
          setWsConnected(false)
        })

      } catch (err) {
        console.error('WebSocket setup error:', err)
        setWsConnected(false)
      }
    }

    setupWebSocket()

    // Fallback polling (less frequent when WS is connected)
    intervalRef.current = setInterval(fetchPrices, FALLBACK_INTERVAL * 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe()
      }
      if (wsWeb3Ref.current?.currentProvider) {
        wsWeb3Ref.current.currentProvider.disconnect()
      }
    }
  }, [fetchPrices])

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h3 style={{ margin: 0 }}>Price Oracle</h3>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              borderRadius: '12px',
              backgroundColor: wsConnected ? 'rgba(76, 175, 80, 0.15)' : 'rgba(244, 67, 54, 0.15)',
              transition: 'all 0.3s ease'
            }}>
              <div style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: wsConnected ? '#4CAF50' : '#f44336',
                animation: wsConnected ? 'pulse 2s infinite' : 'none'
              }} />
              <span style={{ fontSize: '11px', color: wsConnected ? '#4CAF50' : '#f44336', fontWeight: '500' }}>
                {wsConnected ? 'LIVE' : 'OFFLINE'}
              </span>
            </div>
          </div>
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

        {/* Pulse animation style */}
        <style>{`
          @keyframes pulse {
            0% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.6; transform: scale(1.2); }
            100% { opacity: 1; transform: scale(1); }
          }
        `}</style>

        <div style={{ marginBottom: '15px', fontSize: '12px', color: '#888' }}>
          {wsConnected ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span>Listening for price updates via WebSocket</span>
              {lastEvent && (
                <span style={{
                  padding: '2px 8px',
                  backgroundColor: 'rgba(0, 188, 212, 0.15)',
                  borderRadius: '4px',
                  color: '#00bcd4'
                }}>
                  {lastEvent.baseToken}/{lastEvent.quoteToken} updated at {lastEvent.timestamp.toLocaleTimeString()}
                </span>
              )}
            </div>
          ) : (
            <span>Polling every {FALLBACK_INTERVAL} seconds (WebSocket reconnecting...)</span>
          )}
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
