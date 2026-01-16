import { useState } from 'react'
import Web3 from 'web3'
import { ERC20_ABI } from '../../erc20_abi'
import { SWAP_ABI } from '../../token_swap'
import {
  TOKEN_VNDX,
  TOKEN_SGPX,
  TOKEN_YENX,
  SWAP_SGPX_VNDX_ADDRESS,
  SWAP_YENX_VNDX_ADDRESS,
  RPC_URL,
  RPC_URL_HTTPS,
  CHAIN_ID_HEX,
  BLOCK_EXPLORER_URL
} from './constants'

const SwapTab = () => {
  const [fromToken, setFromToken] = useState(TOKEN_VNDX)
  const [toToken, setToToken] = useState(TOKEN_SGPX)
  const [swapAmount, setSwapAmount] = useState('')
  const [estimatedOutput, setEstimatedOutput] = useState('')
  const [swapPrivateKey, setSwapPrivateKey] = useState('')
  const [swapLoading, setSwapLoading] = useState(false)
  const [swapError, setSwapError] = useState('')
  const [swapTxHash, setSwapTxHash] = useState('')
  const [showSwapModal, setShowSwapModal] = useState(false)
  const [swapBalances, setSwapBalances] = useState(null)

  // MetaMask states
  const [isMetaMaskConnected, setIsMetaMaskConnected] = useState(false)
  const [metaMaskAccount, setMetaMaskAccount] = useState('')

  const openSwapModal = () => {
    if (!swapAmount) {
      setSwapError('Please enter amount to swap')
      return
    }
    setSwapError('')
    setSwapTxHash('')
    setShowSwapModal(true)
  }

  const closeSwapModal = () => {
    setShowSwapModal(false)
    setSwapPrivateKey('')
  }

  const connectMetaMask = async () => {
    try {
      if (typeof window.ethereum === 'undefined') {
        setSwapError('MetaMask is not installed. Please install MetaMask extension.')
        return
      }

      const currentChainId = await window.ethereum.request({ method: 'eth_chainId' })

      if (currentChainId !== CHAIN_ID_HEX) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: CHAIN_ID_HEX }],
          })
        } catch (switchError) {
          if (switchError.code == 4902) {
            try {
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [
                  {
                    chainId: CHAIN_ID_HEX,
                    chainName: 'Kokka Testnet',
                    nativeCurrency: {
                      name: 'Kokka',
                      symbol: 'kokka',
                      decimals: 18
                    },
                    rpcUrls: [RPC_URL_HTTPS],
                    blockExplorerUrls: [BLOCK_EXPLORER_URL]
                  },
                ],
              })
            } catch (addError) {
              console.error('Error adding network:', addError)
              setSwapError('Failed to add network: ' + addError.message)
              return
            }
          } else {
            console.error('Error switching network:', switchError)
            setSwapError('Failed to switch network: ' + switchError.message)
            return
          }
        }
      }

      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })

      if (accounts.length > 0) {
        setMetaMaskAccount(accounts[0])
        setIsMetaMaskConnected(true)
        setSwapError('')
      }
    } catch (err) {
      console.error('MetaMask connection error:', err)
      setSwapError('Failed to connect MetaMask: ' + err.message)
    }
  }

  const disconnectMetaMask = () => {
    setMetaMaskAccount('')
    setIsMetaMaskConnected(false)
  }

  const getSwapContractAddress = () => {
    if ((fromToken === TOKEN_VNDX && toToken === TOKEN_SGPX) ||
        (fromToken === TOKEN_SGPX && toToken === TOKEN_VNDX)) {
      return SWAP_SGPX_VNDX_ADDRESS
    } else if ((fromToken === TOKEN_VNDX && toToken === TOKEN_YENX) ||
               (fromToken === TOKEN_YENX && toToken === TOKEN_VNDX)) {
      return SWAP_YENX_VNDX_ADDRESS
    }
    return null
  }

  const executeSwap = async () => {
    if (!isMetaMaskConnected && !swapPrivateKey) {
      setSwapError('Please connect MetaMask or enter private key')
      return
    }

    if (!swapAmount) {
      setSwapError('Please enter amount to swap')
      return
    }

    setSwapLoading(true)
    setSwapError('')
    setSwapTxHash('')

    try {
      let web3
      let account

      if (isMetaMaskConnected) {
        web3 = new Web3(window.ethereum)
        account = { address: metaMaskAccount }
      } else {
        web3 = new Web3(RPC_URL_HTTPS)
        account = web3.eth.accounts.privateKeyToAccount(
          swapPrivateKey.startsWith('0x') ? swapPrivateKey : '0x' + swapPrivateKey
        )
        web3.eth.accounts.wallet.add(account)
        web3.eth.defaultAccount = account.address
      }

      const fromTokenContract = new web3.eth.Contract(ERC20_ABI, fromToken)
      const toTokenContract = new web3.eth.Contract(ERC20_ABI, toToken)

      const beforeFromBalance = await fromTokenContract.methods.balanceOf(account.address).call()
      const beforeToBalance = await toTokenContract.methods.balanceOf(account.address).call()

      const swapContractAddress = getSwapContractAddress()
      const swapContract = new web3.eth.Contract(SWAP_ABI, swapContractAddress)
      const amountInWei = web3.utils.toWei(swapAmount, 'ether')

      let txReceipt

      if (fromToken === TOKEN_VNDX && (toToken === TOKEN_SGPX || toToken === TOKEN_YENX)) {
        const tokenVNDXContract = new web3.eth.Contract(ERC20_ABI, TOKEN_VNDX)
        const approveTx = await tokenVNDXContract.methods.approve(swapContractAddress, amountInWei).send({
          from: account.address,
          gas: 300000
        })

        if (approveTx) {
          txReceipt = await swapContract.methods.swapBforA(amountInWei).send({
            from: account.address,
            gas: 300000
          })
        }
      } else if (fromToken === TOKEN_SGPX && toToken === TOKEN_VNDX) {
        const tokenSGPXContract = new web3.eth.Contract(ERC20_ABI, TOKEN_SGPX)
        const approveTx = await tokenSGPXContract.methods.approve(swapContractAddress, amountInWei).send({
          from: account.address,
          gas: 300000
        })
        if (approveTx) {
          txReceipt = await swapContract.methods.swapAforB(amountInWei).send({
            from: account.address,
            gas: 300000
          })
        }
      } else if (fromToken === TOKEN_YENX && toToken === TOKEN_VNDX) {
        const tokenYENXContract = new web3.eth.Contract(ERC20_ABI, TOKEN_YENX)
        const approveTx = await tokenYENXContract.methods.approve(swapContractAddress, amountInWei).send({
          from: account.address,
          gas: 300000
        })
        if (approveTx) {
          txReceipt = await swapContract.methods.swapAforB(amountInWei).send({
            from: account.address,
            gas: 300000
          })
        }
      } else {
        throw new Error('Invalid token pair for swap')
      }

      const afterFromBalance = await fromTokenContract.methods.balanceOf(account.address).call()
      const afterToBalance = await toTokenContract.methods.balanceOf(account.address).call()

      const fromTokenName = fromToken === TOKEN_VNDX ? 'VNDX' : fromToken === TOKEN_SGPX ? 'SGPX' : 'YENX'
      const toTokenName = toToken === TOKEN_VNDX ? 'VNDX' : toToken === TOKEN_SGPX ? 'SGPX' : 'YENX'

      setSwapBalances({
        fromToken: fromTokenName,
        toToken: toTokenName,
        beforeFrom: web3.utils.fromWei(beforeFromBalance.toString(), 'ether'),
        afterFrom: web3.utils.fromWei(afterFromBalance.toString(), 'ether'),
        beforeTo: web3.utils.fromWei(beforeToBalance.toString(), 'ether'),
        afterTo: web3.utils.fromWei(afterToBalance.toString(), 'ether'),
        accountAddress: account.address
      })

      setSwapTxHash(txReceipt.transactionHash)
      setSwapAmount('')
      setEstimatedOutput('')
      closeSwapModal()

    } catch (err) {
      console.error('Swap error:', err)
      setSwapError(err.message || 'Swap failed')
    } finally {
      setSwapLoading(false)
    }
  }

  const estimateSwapOutput = async (amount = null, from = null, to = null) => {
    const inputAmount = amount !== null ? amount : swapAmount
    const fromTokenAddress = from !== null ? from : fromToken
    const toTokenAddress = to !== null ? to : toToken

    if (!inputAmount || parseFloat(inputAmount) <= 0) {
      setEstimatedOutput('')
      return
    }

    try {
      const web3 = new Web3(RPC_URL)

      let swapContractAddress
      if ((fromTokenAddress === TOKEN_VNDX && toTokenAddress === TOKEN_SGPX) ||
          (fromTokenAddress === TOKEN_SGPX && toTokenAddress === TOKEN_VNDX)) {
        swapContractAddress = SWAP_SGPX_VNDX_ADDRESS
      } else if ((fromTokenAddress === TOKEN_VNDX && toTokenAddress === TOKEN_YENX) ||
                 (fromTokenAddress === TOKEN_YENX && toTokenAddress === TOKEN_VNDX)) {
        swapContractAddress = SWAP_YENX_VNDX_ADDRESS
      }

      const swapContract = new web3.eth.Contract(SWAP_ABI, swapContractAddress)
      const amountInWei = web3.utils.toWei(inputAmount, 'ether')

      let outputWei
      if (fromTokenAddress === TOKEN_VNDX && toTokenAddress === TOKEN_SGPX) {
        outputWei = await swapContract.methods.getAmountOutBforA(amountInWei).call()
      } else if (fromTokenAddress === TOKEN_SGPX && toTokenAddress === TOKEN_VNDX) {
        outputWei = await swapContract.methods.getAmountOutAforB(amountInWei).call()
      } else if (fromTokenAddress === TOKEN_YENX && toTokenAddress === TOKEN_VNDX) {
        outputWei = await swapContract.methods.getAmountOutAforB(amountInWei).call()
      } else if (fromTokenAddress === TOKEN_VNDX && toTokenAddress === TOKEN_YENX) {
        outputWei = await swapContract.methods.getAmountOutBforA(amountInWei).call()
      } else {
        setEstimatedOutput('N/A')
        return
      }

      const outputTokens = web3.utils.fromWei(outputWei.toString(), 'ether')
      setEstimatedOutput(outputTokens)
    } catch (err) {
      console.error('Estimation error:', err)
      setEstimatedOutput('N/A')
    }
  }

  const getTokenName = (tokenAddress) => {
    if (tokenAddress === TOKEN_VNDX) return 'VNDX'
    if (tokenAddress === TOKEN_SGPX) return 'SGPX'
    if (tokenAddress === TOKEN_YENX) return 'YENX'
    return 'Unknown'
  }

  return (
    <>
      <div className="form-container">
        {/* Sell (From Token) */}
        <div className="form-group">
          <label style={{ fontSize: '24px', color: '#ffffffff', marginBottom: '8px' }}>Sell</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', border: '2px solid #ddd', borderRadius: '15px', backgroundColor: '#fff' }}>
            <input
              type="text"
              value={swapAmount}
              onChange={(e) => {
                const newAmount = e.target.value
                setSwapAmount(newAmount)
                estimateSwapOutput(newAmount, fromToken, toToken)
              }}
              placeholder="0"
              style={{
                flex: 1,
                fontSize: '24px',
                border: 'none',
                outline: 'none',
                fontWeight: '500'
              }}
            />
            <select
              value={fromToken}
              onChange={(e) => {
                const newFromToken = e.target.value
                setFromToken(newFromToken)
                estimateSwapOutput(swapAmount, newFromToken, toToken)
              }}
              style={{
                padding: '8px 10px',
                fontSize: '16px',
                fontWeight: '600',
                border: '1px solid #ddd',
                borderRadius: '20px',
                backgroundColor: '#f8f9fa',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <option value={TOKEN_VNDX}>VNDX</option>
              <option value={TOKEN_SGPX}>SGPX</option>
              <option value={TOKEN_YENX}>YENX</option>
            </select>
          </div>
        </div>

        {/* Swap Arrow */}
        <div style={{ textAlign: 'center', margin: '5px 0' }}>
          <div style={{
            display: 'inline-block',
            padding: '5px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '24px'
          }}
          onClick={() => {
            const temp = fromToken
            const newFrom = toToken
            const newTo = temp
            setFromToken(newFrom)
            setToToken(newTo)
            estimateSwapOutput(swapAmount, newFrom, newTo)
          }}
          >
            ↓↑
          </div>
        </div>

        {/* Buy (To Token) */}
        <div className="form-group">
          <label style={{ fontSize: '24px', color: '#fefffaff', marginBottom: '8px' }}>Buy</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', border: '1px solid #ddd', borderRadius: '15px', backgroundColor: '#f8f9fa' }}>
            <input
              type="text"
              value={estimatedOutput || '0'}
              readOnly
              placeholder="0"
              style={{
                flex: 1,
                fontSize: '24px',
                border: 'none',
                outline: 'none',
                fontWeight: '500',
                backgroundColor: 'transparent',
                color: '#666'
              }}
            />
            <select
              value={toToken}
              onChange={(e) => {
                const newToToken = e.target.value
                setToToken(newToToken)
                estimateSwapOutput(swapAmount, fromToken, newToToken)
              }}
              style={{
                padding: '8px 15px',
                fontSize: '16px',
                fontWeight: '600',
                border: '1px solid #ddd',
                borderRadius: '20px',
                backgroundColor: '#fff',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <option value={TOKEN_VNDX}>VNDX</option>
              <option value={TOKEN_SGPX}>SGPX</option>
              <option value={TOKEN_YENX}>YENX</option>
            </select>
          </div>
        </div>

        {/* MetaMask Connect Button */}
        <div style={{ marginTop: '20px', marginBottom: '10px' }}>
          {!isMetaMaskConnected ? (
            <button
              onClick={connectMetaMask}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '16px',
                fontWeight: '600',
                color: 'white',
                backgroundColor: '#f6851b',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px'
              }}
            >
              🦊 Connect MetaMask
            </button>
          ) : (
            <div style={{
              padding: '12px',
              backgroundColor: '#e8f5e9',
              borderRadius: '10px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <span style={{ fontSize: '14px', color: '#4CAF50', fontWeight: '600' }}>
                  ✓ Connected
                </span>
                <p style={{ fontSize: '12px', color: '#666', margin: '5px 0 0 0' }}>
                  {metaMaskAccount.substring(0, 10)}...{metaMaskAccount.substring(metaMaskAccount.length - 8)}
                </p>
              </div>
              <button
                onClick={disconnectMetaMask}
                style={{
                  padding: '6px 12px',
                  fontSize: '14px',
                  color: '#666',
                  backgroundColor: 'white',
                  border: '1px solid #ddd',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
              >
                Disconnect
              </button>
            </div>
          )}
        </div>

        {/* Swap Button */}
        <button
          onClick={openSwapModal}
          disabled={!swapAmount || fromToken === toToken || parseFloat(swapAmount) <= 0}
          style={{
            width: '100%',
            padding: '18px',
            marginTop: '10px',
            fontSize: '18px',
            fontWeight: '600',
            color: 'white',
            backgroundColor: (!swapAmount || fromToken === toToken || parseFloat(swapAmount) <= 0) ? '#ccc' : '#ff007a',
            border: 'none',
            borderRadius: '20px',
            cursor: (!swapAmount || fromToken === toToken || parseFloat(swapAmount) <= 0) ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s'
          }}
        >
          {fromToken === toToken ? 'Select different tokens' : 'Swap'}
        </button>

        {/* Success Message */}
        {swapTxHash && (
          <div className="success-message" style={{ marginTop: '20px' }}>
            <h3>Swap Successful!</h3>

            {swapBalances && (
              <div style={{ marginBottom: '15px', padding: '1px', backgroundColor: '#f0f8ff', borderRadius: '5px' }}>
                <p style={{ fontSize: '18px', color: '#666', marginBottom: '10px' }}>
                  <strong>Account:</strong> {swapBalances.accountAddress.substring(0, 10)}...{swapBalances.accountAddress.substring(swapBalances.accountAddress.length - 8)}
                </p>
              </div>
            )}

            {swapBalances && (
              <div style={{ marginBottom: '15px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#8587b1ff' }}>
                      <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Token</th>
                      <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>Before</th>
                      <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>After</th>
                      <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ backgroundColor: '#222324ff' }}>
                      <td style={{ padding: '10px', fontWeight: '600', color: '#ff6b6b' }}>{swapBalances.fromToken}</td>
                      <td style={{ padding: '10px', textAlign: 'right' }}>{parseFloat(swapBalances.beforeFrom).toFixed(4)}</td>
                      <td style={{ padding: '10px', textAlign: 'right' }}>{parseFloat(swapBalances.afterFrom).toFixed(4)}</td>
                      <td style={{ padding: '10px', textAlign: 'right', color: '#ff6b6b', fontWeight: '600' }}>
                        {(parseFloat(swapBalances.afterFrom) - parseFloat(swapBalances.beforeFrom)).toFixed(4)}
                      </td>
                    </tr>
                    <tr style={{ backgroundColor: '#0a0a0aff' }}>
                      <td style={{ padding: '10px', fontWeight: '600', color: '#4CAF50' }}>{swapBalances.toToken}</td>
                      <td style={{ padding: '10px', textAlign: 'right' }}>{parseFloat(swapBalances.beforeTo).toFixed(4)}</td>
                      <td style={{ padding: '10px', textAlign: 'right' }}>{parseFloat(swapBalances.afterTo).toFixed(4)}</td>
                      <td style={{ padding: '10px', textAlign: 'right', color: '#4CAF50', fontWeight: '600' }}>
                        +{(parseFloat(swapBalances.afterTo) - parseFloat(swapBalances.beforeTo)).toFixed(4)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            <p>Transaction Hash:</p>
            <a
              href={`${BLOCK_EXPLORER_URL}/tx/${swapTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="tx-hash-link"
            >
              <code className="tx-hash">{swapTxHash}</code>
            </a>
          </div>
        )}

        {/* Error Message */}
        {swapError && (
          <div className="error-message" style={{ marginTop: '15px' }}>
            <p>{swapError}</p>
          </div>
        )}
      </div>

      {/* Swap Private Key Modal */}
      {showSwapModal && (
        <div className="modal-overlay" onClick={closeSwapModal}>
          <div className="contract-info-card modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Confirm Swap</h2>
            <div style={{
              margin: '16px 0',
              padding: '15px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-evenly',
              backgroundColor: '#1a1a1a',
              borderLeft: "3px solid #646cff",
            }}>
              <p style={{ fontSize: '18px', margin: 0, color: '#fff' }}>
                <strong>From:</strong> {swapAmount} {getTokenName(fromToken)}
              </p>
              <p style={{ fontSize: '18px', margin: 0, color: '#fff' }}>
                →
              </p>
              <p style={{ fontSize: '18px', margin: 0, color: '#fff' }}>
                <strong>To:</strong> {estimatedOutput} {getTokenName(toToken)}
              </p>
            </div>

            {isMetaMaskConnected ? (
              <div style={{ padding: '15px', backgroundColor: '#e8f5e9', borderRadius: '10px', marginBottom: '15px' }}>
                <p style={{ fontSize: '14px', color: '#4CAF50', fontWeight: '600', marginBottom: '5px' }}>
                  🦊 Using MetaMask
                </p>
                <p style={{ fontSize: '12px', color: '#666' }}>
                  {metaMaskAccount.substring(0, 10)}...{metaMaskAccount.substring(metaMaskAccount.length - 8)}
                </p>
              </div>
            ) : (
              <>
                <p className="warning">
                  Warning: Never share your private key with anyone!
                </p>

                <input
                  type="password"
                  value={swapPrivateKey}
                  onChange={(e) => setSwapPrivateKey(e.target.value)}
                  placeholder="Enter your private key"
                  className="input-field"
                  autoFocus
                />
              </>
            )}

            <div className="modal-buttons">
              <button
                onClick={executeSwap}
                className="confirm-button"
                disabled={swapLoading || (!isMetaMaskConnected && !swapPrivateKey)}
              >
                {swapLoading ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <span style={{
                      width: '16px',
                      height: '16px',
                      border: '2px solid #ffffff',
                      borderTop: '2px solid transparent',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite'
                    }}></span>
                    Processing...
                  </span>
                ) : 'Confirm Swap'}
              </button>

              <button
                onClick={closeSwapModal}
                className="cancel-button"
                disabled={swapLoading}
              >
                Cancel
              </button>
            </div>

            {swapError && (
              <div className="error-message">
                <p>{swapError}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default SwapTab
