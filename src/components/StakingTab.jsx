import { useState, useEffect } from 'react'
import Web3 from 'web3'
import { ERC20_ABI } from '../../erc20_abi'
import { RPC_URL, BLOCK_EXPLORER_URL, CHAIN_ID_HEX, STAKING_CONTRACT_ADDRESS } from './constants'
import { STAKING_ABI } from '../../staking_abi'

// Helper to send transaction and get hash immediately without waiting for receipt
const sendAndGetHash = (method, options) => {
  return new Promise((resolve, reject) => {
    method.send(options)
      .on('transactionHash', (hash) => resolve(hash))
      .on('error', (error) => reject(error))
  })
}

const StakingTab = () => {
  const [account, setAccount] = useState(null)
  const [web3, setWeb3] = useState(null)
  const [supportedTokens, setSupportedTokens] = useState([])
  const [selectedToken, setSelectedToken] = useState('')
  const [tokenInfo, setTokenInfo] = useState(null)
  const [userStake, setUserStake] = useState(null)
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [txHash, setTxHash] = useState('')
  const [error, setError] = useState('')
  const [allUserStakes, setAllUserStakes] = useState(null)

  // Connect to MetaMask
  const connectWallet = async () => {
    if (typeof window.ethereum === 'undefined') {
      setError('Please install MetaMask to use this feature')
      return
    }

    try {
      setLoading(true)
      setError('')

      // Request account access
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })

      // Switch to the correct network
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: CHAIN_ID_HEX }]
        })
      } catch (switchError) {
        // If the chain hasn't been added, add it
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: CHAIN_ID_HEX,
              chainName: 'Custom Network',
              rpcUrls: [RPC_URL],
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

      // Load supported tokens
      await loadSupportedTokens(web3Instance)

    } catch (err) {
      console.error('Connection error:', err)
      setError(err.message || 'Failed to connect wallet')
    } finally {
      setLoading(false)
    }
  }

  // Disconnect wallet
  const disconnectWallet = () => {
    setAccount(null)
    setWeb3(null)
    setSupportedTokens([])
    setSelectedToken('')
    setTokenInfo(null)
    setUserStake(null)
    setAllUserStakes(null)
  }

  // Load supported tokens from staking contract
  const loadSupportedTokens = async (web3Instance) => {
    try {
      const stakingContract = new web3Instance.eth.Contract(STAKING_ABI, STAKING_CONTRACT_ADDRESS)
      const tokens = await stakingContract.methods.getSupportedTokens().call()

      // Get token details for each supported token
      const tokenDetails = await Promise.all(
        tokens.map(async (tokenAddress) => {
          const tokenContract = new web3Instance.eth.Contract(ERC20_ABI, tokenAddress)
          const [name, symbol] = await Promise.all([
            tokenContract.methods.name().call().catch(() => 'Unknown'),
            tokenContract.methods.symbol().call().catch(() => 'UNK')
          ])
          return { address: tokenAddress, name, symbol }
        })
      )

      setSupportedTokens(tokenDetails)
    } catch (err) {
      console.error('Error loading tokens:', err)
      setError('Failed to load supported tokens')
    }
  }

  // Load token info and user stake when token is selected
  useEffect(() => {
    if (web3 && account && selectedToken) {
      loadTokenInfo()
      loadUserStake()
    }
  }, [selectedToken, account, web3])

  // Load all user stakes when account changes
  useEffect(() => {
    if (web3 && account) {
      loadAllUserStakes()
    }
  }, [account, web3])

  const loadTokenInfo = async () => {
    try {
      const stakingContract = new web3.eth.Contract(STAKING_ABI, STAKING_CONTRACT_ADDRESS)
      const info = await stakingContract.methods.getTokenInfo(selectedToken).call()
      const apy = await stakingContract.methods.apyRates(selectedToken).call()

      setTokenInfo({
        totalStaked: web3.utils.fromWei(info.totalStakedAmount.toString(), 'ether'),
        rewardPool: web3.utils.fromWei(info.rewardPoolAmount.toString(), 'ether'),
        apy: (Number(apy) / 100).toFixed(2) // Convert basis points to percentage
      })
    } catch (err) {
      console.error('Error loading token info:', err)
    }
  }

  const loadUserStake = async () => {
    try {
      const stakingContract = new web3.eth.Contract(STAKING_ABI, STAKING_CONTRACT_ADDRESS)
      const stake = await stakingContract.methods.getUserStake(selectedToken, account).call()

      setUserStake({
        stakedAmount: web3.utils.fromWei(stake.stakedAmount.toString(), 'ether'),
        pendingReward: web3.utils.fromWei(stake.pendingReward.toString(), 'ether'),
        stakeStartTime: stake.stakeStartTime > 0 ? new Date(Number(stake.stakeStartTime) * 1000).toLocaleString() : 'N/A'
      })
    } catch (err) {
      console.error('Error loading user stake:', err)
    }
  }

  const loadAllUserStakes = async () => {
    try {
      const stakingContract = new web3.eth.Contract(STAKING_ABI, STAKING_CONTRACT_ADDRESS)
      const stakes = await stakingContract.methods.getAllUserStakes(account).call()

      if (stakes.tokens.length > 0) {
        const stakesData = await Promise.all(
          stakes.tokens.map(async (tokenAddress, index) => {
            const tokenContract = new web3.eth.Contract(ERC20_ABI, tokenAddress)
            const symbol = await tokenContract.methods.symbol().call().catch(() => 'UNK')
            return {
              token: tokenAddress,
              symbol,
              staked: web3.utils.fromWei(stakes.stakedAmounts[index].toString(), 'ether'),
              pending: web3.utils.fromWei(stakes.pendingRewardAmounts[index].toString(), 'ether')
            }
          })
        )
        setAllUserStakes(stakesData)
      }
    } catch (err) {
      console.error('Error loading all user stakes:', err)
    }
  }

  // Stake tokens
  const handleStake = async () => {
    if (!amount || !selectedToken) {
      setError('Please enter amount and select a token')
      return
    }

    setLoading(true)
    setError('')
    setTxHash('')

    try {
      const amountInWei = web3.utils.toWei(amount, 'ether')
      const tokenContract = new web3.eth.Contract(ERC20_ABI, selectedToken)

      // // Check allowance
      // const allowance = await tokenContract.methods.allowance(account, STAKING_CONTRACT_ADDRESS).call()

      // if (BigInt(allowance) < BigInt(amountInWei)) {
      //   // Approve tokens first
      //   await tokenContract.methods.approve(STAKING_CONTRACT_ADDRESS, amountInWei).send({
      //     from: account
      //   })
      // }

      // Stake tokens
      await sendAndGetHash(
        tokenContract.methods.approve(STAKING_CONTRACT_ADDRESS, amountInWei),
        { from: account, gas: 300000 }
      )
      const stakingContract = new web3.eth.Contract(STAKING_ABI, STAKING_CONTRACT_ADDRESS)
      const tx = await sendAndGetHash(
        stakingContract.methods.stake(selectedToken, amountInWei),
        { from: account, gas: 300000}
      )
      console.log('Stake tx hash:', tx)
      setTxHash(tx)
      setAmount('')
      await loadUserStake()
      await loadTokenInfo()
      await loadAllUserStakes()

    } catch (err) {
      console.error('Stake error:', err)
      setError(err.message || 'Staking failed')
    } finally {
      setLoading(false)
    }
  }

  // Withdraw tokens
  const handleWithdraw = async () => {
    if (!amount || !selectedToken) {
      setError('Please enter amount and select a token')
      return
    }

    setLoading(true)
    setError('')
    setTxHash('')

    try {
      const amountInWei = web3.utils.toWei(amount, 'ether')
      const stakingContract = new web3.eth.Contract(STAKING_ABI, STAKING_CONTRACT_ADDRESS)

      const tx = await sendAndGetHash(
        stakingContract.methods.withdraw(selectedToken, amountInWei),
        { from: account, gas: 300000 }
      )

      setTxHash(tx)
      setAmount('')
      await loadUserStake()
      await loadTokenInfo()
      await loadAllUserStakes()

    } catch (err) {
      console.error('Withdraw error:', err)
      setError(err.message || 'Withdrawal failed')
    } finally {
      setLoading(false)
    }
  }

  // Claim rewards
  const handleClaimRewards = async () => {
    if (!selectedToken) {
      setError('Please select a token')
      return
    }

    setLoading(true)
    setError('')
    setTxHash('')

    try {
      const stakingContract = new web3.eth.Contract(STAKING_ABI, STAKING_CONTRACT_ADDRESS)

      const tx = await sendAndGetHash(
        stakingContract.methods.claimRewards(selectedToken),
        { from: account, gas: 300000 }
      )

      setTxHash(tx)
      await loadUserStake()
      await loadAllUserStakes()

    } catch (err) {
      console.error('Claim error:', err)
      setError(err.message || 'Claim failed')
    } finally {
      setLoading(false)
    }
  }

  // Claim all rewards
  const handleClaimAllRewards = async () => {
    setLoading(true)
    setError('')
    setTxHash('')

    try {
      const stakingContract = new web3.eth.Contract(STAKING_ABI, STAKING_CONTRACT_ADDRESS)

      const tx = await stakingContract.methods.claimAllRewards().send({
        from: account
      })

      setTxHash(tx.transactionHash)
      await loadAllUserStakes()
      if (selectedToken) {
        await loadUserStake()
      }

    } catch (err) {
      console.error('Claim all error:', err)
      setError(err.message || 'Claim all failed')
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

  const getSelectedTokenSymbol = () => {
    const token = supportedTokens.find(t => t.address === selectedToken)
    return token ? token.symbol : ''
  }

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

      {account && (
        <>
          {/* All User Stakes Overview */}
          {allUserStakes && allUserStakes.length > 0 && (
            <div className="contract-info-card-1" style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ margin: 0 }}>Your Staking Overview</h3>
                <button
                  onClick={loadAllUserStakes}
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
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #ddd' }}>
                      <th className="info-label" style={{ padding: '8px', textAlign: 'left' }}>Token</th>
                      <th className="info-label" style={{ padding: '8px', textAlign: 'right' }}>Staked</th>
                      {/* <th className="info-label" style={{ padding: '8px', textAlign: 'right' }}>Staked Since</th> */}
                      <th className="info-label" style={{ padding: '8px', textAlign: 'right' }}>Pending Rewards</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allUserStakes.map((stake, index) => (
                      <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                        <td className="info-value-1" style={{ padding: '8px' }}>{stake.symbol}</td>
                        <td className="info-value-1" style={{ padding: '8px', textAlign: 'right' }}>{parseFloat(stake.staked).toFixed(2)}</td>
                        {/* <td className="info-value-1" style={{ padding: '8px', textAlign: 'right' }}>{stake.stakedSince}</td> */}
                        <td className="info-value-1" style={{ padding: '8px', textAlign: 'right' }}>{parseFloat(stake.pending).toFixed(18)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={handleClaimAllRewards}
                disabled={loading}
                style={{
                  marginTop: '10px',
                  padding: '10px 20px',
                  backgroundColor: '#9C27B0',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  width: '100%'
                }}
              >
                {loading ? 'Processing...' : 'Claim All Rewards'}
              </button>
            </div>
          )}

          {/* Token Selection */}
          <div className="form-group">
            <label>Select Token to Stake:</label>
            <select
              value={selectedToken}
              onChange={(e) => setSelectedToken(e.target.value)}
              className="input-field"
              style={{ cursor: 'pointer' }}
            >
              <option value="">-- Select Token --</option>
              {supportedTokens.map((token) => (
                <option key={token.address} value={token.address}>
                  {token.name} ({token.symbol})
                </option>
              ))}
            </select>
          </div>

          {/* Token Info */}
          {selectedToken && tokenInfo && (
            <div className="contract-info-card" style={{ marginBottom: '20px' }}>
              <h3 style={{ marginBottom: '10px' }}>Token Staking Info</h3>
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">APY:</span>
                  <span className="info-value" style={{ color: '#4CAF50' }}>{tokenInfo.apy}%</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Total Staked:</span>
                  <span className="info-value">{parseFloat(tokenInfo.totalStaked).toFixed(4)} {getSelectedTokenSymbol()}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Reward Pool:</span>
                  <span className="info-value">{parseFloat(tokenInfo.rewardPool).toFixed(4)} {getSelectedTokenSymbol()}</span>
                </div>
              </div>
            </div>
          )}

          {/* User Stake Info */}
          {selectedToken && userStake && (
            <div className="contract-info-card" style={{ marginBottom: '20px' }}>
              <h3 style={{ marginBottom: '10px' }}>Your Stake</h3>
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">Staked Amount:</span>
                  <span className="info-value">{parseFloat(userStake.stakedAmount).toFixed(4)} {getSelectedTokenSymbol()}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Pending Rewards:</span>
                  <span className="info-value" style={{ color: '#4CAF50' }}>{parseFloat(userStake.pendingReward).toFixed(4)} {getSelectedTokenSymbol()}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Staking Since:</span>
                  <span className="info-value">{userStake.stakeStartTime}</span>
                </div>
              </div>
            </div>
          )}

          {/* Amount Input */}
          {selectedToken && (
            <>
              <div className="form-group">
                <label>Amount:</label>
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="input-field"
                />
              </div>

              {/* Action Buttons */}
              <div className="button-group">
                <button
                  onClick={handleStake}
                  disabled={loading || !amount}
                  className="action-button mint-button"
                >
                  {loading ? 'Processing...' : 'Stake'}
                </button>

                <button
                  onClick={handleWithdraw}
                  disabled={loading || !amount}
                  className="action-button burn-button"
                >
                  {loading ? 'Processing...' : 'Withdraw'}
                </button>

                <button
                  onClick={handleClaimRewards}
                  disabled={loading}
                  className="action-button transfer-button"
                >
                  {loading ? 'Processing...' : 'Claim Rewards'}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {/* Transaction Success */}
      {txHash && (
        <div className="success-message">
          <h3>Transaction Successful!</h3>
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

export default StakingTab
