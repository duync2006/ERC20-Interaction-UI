import { useState, useEffect, useCallback } from 'react'
import Web3 from 'web3'
import { ERC20_ABI } from '../../erc20_abi'
import { p2p_exchange_abi } from '../../p2p_exchange_abi.js'
import {
  TOKEN_VNDX,
  TOKEN_SGDX,
  TOKEN_YENX,
  RPC_URL,
  RPC_URL_HTTPS,
  RPC_URL_WS,
  CHAIN_ID_HEX,
  BLOCK_EXPLORER_URL,
  P2P_EXCHANGE_ADDRESS
} from './constants'

// Helper to send transaction and get hash immediately without waiting for receipt
const sendAndGetHash = (method, options) => {
  return new Promise((resolve, reject) => {
    method.send(options)
      .on('transactionHash', (hash) => resolve(hash))
      .on('error', (error) => reject(error))
  })
}

// Helper to wait for transaction confirmation
const waitForReceipt = async (web3, txHash, maxWaitTime = 180000, pollInterval = 5000) => {
  const startTime = Date.now()
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const receipt = await web3.eth.getTransactionReceipt(txHash)
      if (receipt) {
        if (receipt.status) {
          return receipt
        } else {
          throw new Error('Transaction failed')
        }
      }
    } catch (err) {
      if (err.message !== 'Transaction failed') {
        console.log('Waiting for confirmation...')
      } else {
        throw err
      }
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval))
  }
  throw new Error('Transaction confirmation timeout')
}

const TOKENS = [
  { address: TOKEN_VNDX, symbol: 'VNDX', name: 'VNDX Token' },
  { address: TOKEN_SGDX, symbol: 'SGDX', name: 'SGDX Token' },
  { address: TOKEN_YENX, symbol: 'YENX', name: 'YENX Token' }
]

const getTokenSymbol = (address) => {
  const token = TOKENS.find(t => t.address.toLowerCase() === address.toLowerCase())
  return token ? token.symbol : address.slice(0, 6) + '...'
}

const OrderBookTab = () => {
  const [account, setAccount] = useState(null)
  const [web3, setWeb3] = useState(null)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [txHash, setTxHash] = useState('')
  const [error, setError] = useState('')

  // Create order form
  const [sellToken, setSellToken] = useState(TOKEN_VNDX)
  const [buyToken, setBuyToken] = useState(TOKEN_SGDX)
  const [amountToSell, setAmountToSell] = useState('')
  const [pricePerUnit, setPricePerUnit] = useState('')

  // Buy order form
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [amountToBuy, setAmountToBuy] = useState('')

  // Token pair selection for order book
  const [selectedPair, setSelectedPair] = useState('VNDX/SGDX')
  const TOKEN_PAIRS = [
    { name: 'VNDX/SGDX', baseToken: TOKEN_VNDX, quoteToken: TOKEN_SGDX },
    { name: 'VNDX/YENX', baseToken: TOKEN_VNDX, quoteToken: TOKEN_YENX },
    { name: 'SGDX/YENX', baseToken: TOKEN_SGDX, quoteToken: TOKEN_YENX }
  ]

  // Get current pair tokens
  const getCurrentPair = () => TOKEN_PAIRS.find(p => p.name === selectedPair)

  // Filter orders by pair - Sell orders (selling base token for quote token)
  const getSellOrders = () => {
    const pair = getCurrentPair()
    if (!pair) return []
    return orders.filter(o =>
      o.tokenSell.toLowerCase() === pair.baseToken.toLowerCase() &&
      o.tokenBuy.toLowerCase() === pair.quoteToken.toLowerCase()
    )
  }

  // Filter orders by pair - Buy orders (selling quote token for base token)
  const getBuyOrders = () => {
    const pair = getCurrentPair()
    if (!pair) return []
    return orders.filter(o =>
      o.tokenSell.toLowerCase() === pair.quoteToken.toLowerCase() &&
      o.tokenBuy.toLowerCase() === pair.baseToken.toLowerCase()
    )
  }

  // Connect to MetaMask
  const connectWallet = async () => {
    if (typeof window.ethereum === 'undefined') {
      setError('Please install MetaMask to use this feature')
      return
    }

    try {
      setLoading(true)
      setError('')

      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })

      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: CHAIN_ID_HEX }]
        })
      } catch (switchError) {
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: CHAIN_ID_HEX,
              chainName: 'Kokka Testnet',
              nativeCurrency: { name: 'Kokka', symbol: 'kokka', decimals: 18 },
              rpcUrls: [RPC_URL_HTTPS],
              blockExplorerUrls: [BLOCK_EXPLORER_URL]
            }]
          })
        } else {
          throw switchError
        }
      }

      const web3Instance = new Web3(window.ethereum)
      setWeb3(web3Instance)
      setAccount(accounts[0])

    } catch (err) {
      console.error('Connection error:', err)
      setError(err.message || 'Failed to connect wallet')
    } finally {
      setLoading(false)
    }
  }

  const disconnectWallet = () => {
    setAccount(null)
    setWeb3(null)
    setOrders([])
  }

  // Load all active orders
  const loadOrders = useCallback(async () => {
    try {
      const web3Instance = new Web3(RPC_URL)
      const contract = new web3Instance.eth.Contract(p2p_exchange_abi, P2P_EXCHANGE_ADDRESS)

      const nextOrderId = await contract.methods.nextOrderId().call()
      const ordersList = []

      for (let i = 0; i < Number(nextOrderId); i++) {
        try {
          const order = await contract.methods.orders(i).call()
          if (order.isActive) {
            ordersList.push({
              id: order.id.toString(),
              seller: order.seller,
              tokenSell: order.tokenSell,
              tokenBuy: order.tokenBuy,
              amountSell: web3Instance.utils.fromWei(order.amountSell.toString(), 'ether'),
              pricePerUnit: web3Instance.utils.fromWei(order.pricePerUnit.toString(), 'ether'),
              isActive: order.isActive
            })
          }
        } catch (err) {
          console.error(`Error loading order ${i}:`, err)
        }
      }

      setOrders(ordersList)
    } catch (err) {
      console.error('Error loading orders:', err)
    }
  }, [web3])

  // Setup WebSocket event listeners
  useEffect(() => {
    let web3Ws
    let contract
    let orderCreatedSub
    let orderFilledSub
    let orderCancelledSub

    const setupEventListeners = async () => {
      try {
        // Create WebSocket provider for real-time events
        web3Ws = new Web3(RPC_URL_WS)
        contract = new web3Ws.eth.Contract(p2p_exchange_abi, P2P_EXCHANGE_ADDRESS)
        console.log('WebSocket connected for event listening')

        // Subscribe to OrderCreated
        orderCreatedSub = await contract.events.OrderCreated()
        orderCreatedSub.on('data', (event) => {
          console.log('OrderCreated event:', event)
          loadOrders()
        })
        orderCreatedSub.on('error', (err) => console.error('OrderCreated error:', err))

        // Subscribe to OrderFilled
        orderFilledSub = await contract.events.OrderFilled()
        orderFilledSub.on('data', (event) => {
          console.log('OrderFilled event:', event)
          loadOrders()
        })
        orderFilledSub.on('error', (err) => console.error('OrderFilled error:', err))

        // Subscribe to OrderCancelled
        orderCancelledSub = await contract.events.OrderCancelled()
        orderCancelledSub.on('data', (event) => {
          console.log('OrderCancelled event:', event)
          loadOrders()
        })
        orderCancelledSub.on('error', (err) => console.error('OrderCancelled error:', err))

      } catch (err) {
        console.error('Error setting up WebSocket event listeners:', err)
      }
    }

    setupEventListeners()

    return () => {
      // Cleanup subscriptions
      if (orderCreatedSub) orderCreatedSub.unsubscribe?.()
      if (orderFilledSub) orderFilledSub.unsubscribe?.()
      if (orderCancelledSub) orderCancelledSub.unsubscribe?.()
      // Close WebSocket connection
      if (web3Ws?.currentProvider?.disconnect) {
        web3Ws.currentProvider.disconnect()
      }
    }
  }, [loadOrders])

  // Load orders on mount and when account changes
  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  // Create a new sell order
  const handleCreateOrder = async () => {
    if (!amountToSell || !pricePerUnit) {
      setError('Please enter amount and price')
      return
    }

    if (sellToken === buyToken) {
      setError('Sell and buy tokens must be different')
      return
    }

    setLoading(true)
    setError('')
    setTxHash('')

    try {
      const amountInWei = web3.utils.toWei(amountToSell, 'ether')
      const priceInWei = web3.utils.toWei(pricePerUnit, 'ether')

      // Approve tokens first
      const tokenContract = new web3.eth.Contract(ERC20_ABI, sellToken)
      await sendAndGetHash(
        tokenContract.methods.approve(P2P_EXCHANGE_ADDRESS, amountInWei),
        { from: account, gas: 300000 }
      )

      // Create order
      const contract = new web3.eth.Contract(p2p_exchange_abi, P2P_EXCHANGE_ADDRESS)
      const hash = await sendAndGetHash(
        contract.methods.createOrder(sellToken, buyToken, amountInWei, priceInWei),
        { from: account, gas: 300000 }
      )

      setTxHash(hash)
      setAmountToSell('')
      setPricePerUnit('')

      await waitForReceipt(web3, hash)
      await loadOrders()

    } catch (err) {
      console.error('Create order error:', err)
      setError(err.message || 'Failed to create order')
    } finally {
      setLoading(false)
    }
  }

  // Buy from an existing order
  const handleBuyOrder = async () => {
    if (!selectedOrderId || !amountToBuy) {
      setError('Please select an order and enter amount')
      return
    }

    setLoading(true)
    setError('')
    setTxHash('')

    try {
      const order = orders.find(o => o.id === selectedOrderId)
      if (!order) {
        setError('Order not found')
        return
      }

      const amountInWei = web3.utils.toWei(amountToBuy, 'ether')

      // Calculate required payment: amountToBuy * pricePerUnit
      const pricePerUnitWei = web3.utils.toWei(order.pricePerUnit, 'ether')
      const requiredPayment = (BigInt(amountInWei) * BigInt(pricePerUnitWei)) / BigInt(10 ** 18)

      // Approve payment token
      const paymentTokenContract = new web3.eth.Contract(ERC20_ABI, order.tokenBuy)
      await sendAndGetHash(
        paymentTokenContract.methods.approve(P2P_EXCHANGE_ADDRESS, requiredPayment.toString()),
        { from: account, gas: 300000 }
      )

      // Execute buy order
      const contract = new web3.eth.Contract(p2p_exchange_abi, P2P_EXCHANGE_ADDRESS)
      const hash = await sendAndGetHash(
        contract.methods.buyOrder(selectedOrderId, amountInWei),
        { from: account, gas: 300000 }
      )

      setTxHash(hash)
      setSelectedOrderId('')
      setAmountToBuy('')

      await waitForReceipt(web3, hash)
      await loadOrders()

    } catch (err) {
      console.error('Buy order error:', err)
      setError(err.message || 'Failed to buy order')
    } finally {
      setLoading(false)
    }
  }

  // Cancel an order
  const handleCancelOrder = async (orderId) => {
    setLoading(true)
    setError('')
    setTxHash('')

    try {
      const contract = new web3.eth.Contract(p2p_exchange_abi, P2P_EXCHANGE_ADDRESS)
      const hash = await sendAndGetHash(
        contract.methods.cancelOrder(orderId),
        { from: account, gas: 300000 }
      )

      setTxHash(hash)
      await waitForReceipt(web3, hash)
      await loadOrders()

    } catch (err) {
      console.error('Cancel order error:', err)
      setError(err.message || 'Failed to cancel order')
    } finally {
      setLoading(false)
    }
  }

  // Listen for account changes
  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length > 0) {
          setAccount(accounts[0])
        } else {
          disconnectWallet()
        }
      })

      window.ethereum.on('chainChanged', () => {
        window.location.reload()
      })
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeAllListeners('accountsChanged')
        window.ethereum.removeAllListeners('chainChanged')
      }
    }
  }, [])

  return (
    <div className="form-container">
      {/* Wallet Connection */}
      <div className="wallet-section" style={{ marginBottom: '20px', textAlign: 'center' }}>
        {!account ? (
          <button
            onClick={connectWallet}
            disabled={loading}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              backgroundColor: '#f6851b',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            {loading ? 'Connecting...' : 'Connect MetaMask'}
          </button>
        ) : (
          <div>
            <p style={{ color: '#4CAF50', marginBottom: '10px' }}>
              Connected: {account.slice(0, 6)}...{account.slice(-4)}
            </p>
            <button
              onClick={disconnectWallet}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                backgroundColor: '#ff4444',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer'
              }}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>

      {/* Order Book */}
      <div className="contract-info-card-2" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', color: '#ffffff' }}>
          <h3 style={{ margin: 0 }}>Order Book</h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <select
              value={selectedPair}
              onChange={(e) => setSelectedPair(e.target.value)}
              style={{
                padding: '8px 12px',
                fontSize: '14px',
                borderRadius: '5px',
                border: '1px solid #ddd',
                cursor: 'pointer'
              }}
            >
              {TOKEN_PAIRS.map((pair) => (
                <option key={pair.name} value={pair.name}>{pair.name}</option>
              ))}
            </select>
            <button
              onClick={loadOrders}
              disabled={loading}
              style={{
                padding: '6px 12px',
                fontSize: '14px',
                backgroundColor: '#2196F3',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Two-column layout for Sell and Buy orders */}
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          {/* Sell Orders Table */}
          <div style={{ flex: 1, minWidth: '300px' }}>
            <h4 style={{ color: '#ff6b6b', marginBottom: '10px', textAlign: 'center' }}>
              Sell {selectedPair.split('/')[0]} /Buy {selectedPair.split('/')[1]}
            </h4>
            <div className="info-value-1" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #ff6b6b' }}>
                    <th style={{ padding: '8px', textAlign: 'left' }}>ID</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Amount</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Price</th>
                    <th style={{ padding: '8px', textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {getSellOrders().length === 0 ? (
                    <tr>
                      <td colSpan="4" style={{ padding: '15px', textAlign: 'center', color: '#888' }}>
                        No sell orders
                      </td>
                    </tr>
                  ) : (
                    getSellOrders().map((order) => (
                      <tr key={order.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '8px' }}>{order.id}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>{parseFloat(order.amountSell).toFixed(4)}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>{parseFloat(order.pricePerUnit).toFixed(4)}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          {account && order.seller.toLowerCase() === account.toLowerCase() ? (
                            <button
                              onClick={() => handleCancelOrder(order.id)}
                              disabled={loading}
                              style={{
                                padding: '4px 8px',
                                fontSize: '12px',
                                backgroundColor: '#ff4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: 'pointer'
                              }}
                            >
                              Cancel
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setSelectedOrderId(order.id)
                                setAmountToBuy('')
                              }}
                              disabled={!account || loading}
                              style={{
                                padding: '4px 8px',
                                fontSize: '12px',
                                backgroundColor: '#4CAF50',
                                color: 'white',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: account ? 'pointer' : 'not-allowed'
                              }}
                            >
                              Buy {selectedPair.split('/')[0]}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Buy Orders Table */}
          <div style={{ flex: 1, minWidth: '300px' }}>
            <h4 style={{ color: '#4CAF50', marginBottom: '10px', textAlign: 'center' }}>
              Buy {selectedPair.split('/')[0]} / Sell {selectedPair.split('/')[1]}
            </h4>
            <div className="info-value-1" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #4CAF50' }}>
                    <th style={{ padding: '8px', textAlign: 'left' }}>ID</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Amount</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Price</th>
                    <th style={{ padding: '8px', textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {getBuyOrders().length === 0 ? (
                    <tr>
                      <td colSpan="4" style={{ padding: '15px', textAlign: 'center', color: '#888' }}>
                        No buy orders
                      </td>
                    </tr>
                  ) : (
                    getBuyOrders().map((order) => (
                      <tr key={order.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '8px' }}>{order.id}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>{parseFloat(order.amountSell).toFixed(4)}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>{parseFloat(order.pricePerUnit).toFixed(4)}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          {account && order.seller.toLowerCase() === account.toLowerCase() ? (
                            <button
                              onClick={() => handleCancelOrder(order.id)}
                              disabled={loading}
                              style={{
                                padding: '4px 8px',
                                fontSize: '12px',
                                backgroundColor: '#ff4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: 'pointer'
                              }}
                            >
                              Cancel
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setSelectedOrderId(order.id)
                                setAmountToBuy('')
                              }}
                              disabled={!account || loading}
                              style={{
                                padding: '4px 8px',
                                fontSize: '12px',
                                backgroundColor: '#4CAF50',
                                color: 'white',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: account ? 'pointer' : 'not-allowed'
                              }}
                            >
                              Sell {selectedPair.split('/')[1]}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {account && (
        <>
          {/* Create Order Form */}
          <div className="contract-info-card" style={{ marginBottom: '20px' }}>
            <h3 style={{ marginBottom: '15px' }}>Create Sell Order</h3>

            <div className="form-group">
              <label>Sell Token:</label>
              <select
                value={sellToken}
                onChange={(e) => setSellToken(e.target.value)}
                className="input-field"
                style={{ cursor: 'pointer' }}
              >
                {TOKENS.map((token) => (
                  <option key={token.address} value={token.address}>
                    {token.symbol}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Buy Token (what you want to receive):</label>
              <select
                value={buyToken}
                onChange={(e) => setBuyToken(e.target.value)}
                className="input-field"
                style={{ cursor: 'pointer' }}
              >
                {TOKENS.map((token) => (
                  <option key={token.address} value={token.address}>
                    {token.symbol}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Amount to Sell:</label>
              <input
                type="text"
                value={amountToSell}
                onChange={(e) => setAmountToSell(e.target.value)}
                placeholder="Enter amount"
                className="input-field"
              />
            </div>

            <div className="form-group">
              <label>Price per Unit (in {getTokenSymbol(buyToken)}):</label>
              <input
                type="text"
                value={pricePerUnit}
                onChange={(e) => setPricePerUnit(e.target.value)}
                placeholder="Enter price"
                className="input-field"
              />
            </div>

            <button
              onClick={handleCreateOrder}
              disabled={loading || !amountToSell || !pricePerUnit || sellToken === buyToken}
              className="action-button mint-button"
              style={{ width: '100%' }}
            >
              {loading ? 'Processing...' : 'Create Order'}
            </button>
          </div>

          {/* Buy Order Form */}
          {selectedOrderId && (
            <div className="contract-info-card" style={{ marginBottom: '20px' }}>
              <h3 style={{ marginBottom: '15px' }}>Buy from Order #{selectedOrderId}</h3>

              {(() => {
                const order = orders.find(o => o.id === selectedOrderId)
                if (!order) return null
                return (
                  <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '5px' }}>
                    <p><strong>Selling:</strong> {getTokenSymbol(order.tokenSell)}</p>
                    <p><strong>Available:</strong> {parseFloat(order.amountSell).toFixed(4)} {getTokenSymbol(order.tokenSell)}</p>
                    <p><strong>Price:</strong> {parseFloat(order.pricePerUnit).toFixed(4)} {getTokenSymbol(order.tokenBuy)} per unit</p>
                  </div>
                )
              })()}

              <div className="form-group">
                <label>Amount to Buy:</label>
                <input
                  type="text"
                  value={amountToBuy}
                  onChange={(e) => setAmountToBuy(e.target.value)}
                  placeholder="Enter amount"
                  className="input-field"
                />
              </div>

              {amountToBuy && orders.find(o => o.id === selectedOrderId) && (
                <p style={{ marginBottom: '10px', color: '#666' }}>
                  Total Cost: {(parseFloat(amountToBuy) * parseFloat(orders.find(o => o.id === selectedOrderId).pricePerUnit)).toFixed(4)} {getTokenSymbol(orders.find(o => o.id === selectedOrderId).tokenBuy)}
                </p>
              )}

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={handleBuyOrder}
                  disabled={loading || !amountToBuy}
                  className="action-button mint-button"
                  style={{ flex: 1 }}
                >
                  {loading ? 'Processing...' : 'Confirm Buy'}
                </button>
                <button
                  onClick={() => {
                    setSelectedOrderId('')
                    setAmountToBuy('')
                  }}
                  className="action-button"
                  style={{ flex: 1, backgroundColor: '#888' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Transaction Success */}
      {txHash && (
        <div className="success-message">
          <h3>Transaction Submitted!</h3>
          <p>Transaction Hash:</p>
          <a
            href={`${BLOCK_EXPLORER_URL}/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="tx-hash-link"
          >
            <code className="tx-hash">{txHash}</code>
          </a>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="error-message">
          <p>{error}</p>
        </div>
      )}
    </div>
  )
}

export default OrderBookTab
