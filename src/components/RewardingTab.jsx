import { useState } from 'react'
import Web3 from 'web3'
import { REWARD_ABI } from '../../reward_abi'
import { REWARD_CONTRACT_ADDRESS, BLOCK_EXPLORER_URL } from './constants'

const RewardingTab = () => {
  const [account, setAccount] = useState('')
  const [idHash, setIdHash] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [txHash, setTxHash] = useState('')

  const connectWallet = async () => {
    if (typeof window.ethereum !== 'undefined') {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
        setAccount(accounts[0])
        setError('')
      } catch (err) {
        setError('Failed to connect wallet')
        console.error(err)
      }
    } else {
      setError('Please install MetaMask!')
    }
  }

  const disconnectWallet = () => {
    setAccount('')
    setError('')
    setMessage('')
    setTxHash('')
    if (web3Ws?.currentProvider?.disconnect) {
      web3Ws.currentProvider.disconnect()
    }
  }
  
  const handleClaim = async () => {
    if (!account) {
      setError('Please connect wallet first')
      return
    }
    if (!idHash) {
      setError('Please enter your ID')
      return
    }

    setLoading(true)
    setError('')
    setMessage('')
    setTxHash('')

    try {
      const web3 = new Web3(window.ethereum)
      const contract = new web3.eth.Contract(REWARD_ABI, REWARD_CONTRACT_ADDRESS)

      const tx = await contract.methods.claim(idHash).send({ from: account })
      setTxHash(tx.transactionHash)
      setMessage('Reward claimed successfully!')
    } catch (err) {
      console.error(err)
      setError(err.message || 'Transaction failed')
    } finally {
      setLoading(false)
    }
  }

  const handleClaim2 = async () => {
    if (!account) {
      setError('Please connect wallet first')
      return
    }

    setLoading(true)
    setError('')
    setMessage('')
    setTxHash('')

    try {
      const web3 = new Web3(window.ethereum)
      const contract = new web3.eth.Contract(REWARD_ABI, REWARD_CONTRACT_ADDRESS)

      const tx = await contract.methods.triggerTransactionReward().send({ from: account })
      setTxHash(tx.transactionHash)
      setMessage('Transaction reward triggered successfully!')
    } catch (err) {
      console.error(err)
      setError(err.message || 'Transaction failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="form-container">
      <h2>Reward Claiming</h2>
      
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


      <div className="form-group">
        <label>Enter your ID (Hash):</label>
        <div className="input-with-button" style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            value={idHash}
            onChange={(e) => setIdHash(e.target.value)}
            placeholder="Enter ID here..."
            className="input-field"
            style={{ flex: 1 }}
          />
          <button
            onClick={handleClaim}
            className="action-button mint-button"
            disabled={loading || !account || !idHash}
            style={{ margin: 0 }}
          >
            {loading ? 'Processing...' : 'Claim'}
          </button>
        </div>
      </div>

      <div className="form-group" style={{ marginTop: '30px' }}>
        <hr style={{ marginBottom: '20px', borderColor: '#eee' }} />
        <label>Trigger Transaction Reward:</label>
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>
          Call triggerTransactionReward() on the smart contract.
        </p>
        <button
          onClick={handleClaim2}
          className="action-button transfer-button"
          disabled={loading || !account}
          style={{ width: '100%' }}
        >
          {loading ? 'Processing...' : 'Claim 2'}
        </button>
      </div>

      {message && (
        <div className="success-message" style={{ marginTop: '20px', padding: '15px', backgroundColor: '#e8f5e9', color: '#2e7d32', borderRadius: '4px' }}>
          <p>{message}</p>
        </div>
      )}

      {txHash && (
        <div className="success-message" style={{ marginTop: '20px' }}>
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

      {error && (
        <div className="error-message" style={{ marginTop: '20px' }}>
          <p>{error}</p>
        </div>
      )}
    </div>
  )
}

export default RewardingTab
