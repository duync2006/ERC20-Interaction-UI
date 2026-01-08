import { useState } from 'react'
import './App.css'
import Web3 from 'web3'
import {ERC20_ABI} from '../erc20_abi'
import {SWAP_ABI} from '../token_swap'
import CryptoJS from 'crypto-js'

// IMPORTANT: Store this securely - ideally from environment variable
// This key must match the one used on the backend for decryption
const ENCRYPTION_KEY = import.meta.env.VITE_ENCRYPTION_KEY || 'your-secret-key-change-this'
const SWAP_SGPX_VNDX_ADDRESS="0x810b983A21C2e14a5975A49bE5Cf38b2078a6DCD"
const SWAP_YENX_VNDX_ADDRESS="0xab353952765CeB52eD631c7ACbca9386Edc6C71a"
// Function to encrypt sensitive data using AES-256-GCM
const encryptPrivateKey = (privateKey) => {
  try {
    const encrypted = CryptoJS.AES.encrypt(privateKey, ENCRYPTION_KEY).toString()
    return encrypted
  } catch (error) {
    console.error('Encryption error:', error)
    throw new Error('Failed to encrypt private key')
  }
}

const decryptPrivateKey = (encryptedPrivateKey) => {
  try {
    const decrypted = CryptoJS.AES.decrypt(encryptedPrivateKey, ENCRYPTION_KEY)
    const decryptedString = decrypted.toString(CryptoJS.enc.Utf8)
    return decryptedString
  } catch (error) {
    console.error('Decryption error:', error)
    throw new Error('Failed to decrypt private key')
  }
}

function App() {
  // Tab management
  const [activeTab, setActiveTab] = useState('stablecoin') // 'stablecoin' or 'swap'

  // Stablecoin tab states
  const [contractAddress, setContractAddress] = useState('0x329aaF4e8d9883c6F8610D48172DE9c6C0917ecD')
  const [rpcUrl, setRpcUrl] = useState('')
  const [amount, setAmount] = useState('')
  const [recipientAddress, setRecipientAddress] = useState('')
  const [showPrivateKeyModal, setShowPrivateKeyModal] = useState(false)
  const [privateKey, setPrivateKey] = useState('')
  const [modalRecipientAddress, setModalRecipientAddress] = useState('')
  const [currentAction, setCurrentAction] = useState(null)
  const [txHash, setTxHash] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [contractInfo, setContractInfo] = useState(null)
  const [checkingContract, setCheckingContract] = useState(false)
  const [contractError, setContractError] = useState('')

  // Swap tab states
  let [swapContractAddress] = SWAP_SGPX_VNDX_ADDRESS // Replace with actual swap contract
  const [tokenVNDX] = useState('0x329aaF4e8d9883c6F8610D48172DE9c6C0917ecD')
  const [tokenSGPX] = useState('0x6245000F860feba4619622FAF8c1eB7968cc91D3')
  const [tokenYENX] = useState('0xbae0597019221Fd8DB7069725F5b93B047D85a89')
  const [fromToken, setFromToken] = useState('0x329aaF4e8d9883c6F8610D48172DE9c6C0917ecD')
  const [toToken, setToToken] = useState('0x6245000F860feba4619622FAF8c1eB7968cc91D3')
  const [swapAmount, setSwapAmount] = useState('')
  const [estimatedOutput, setEstimatedOutput] = useState('')
  const [swapPrivateKey, setSwapPrivateKey] = useState('')
  const [swapLoading, setSwapLoading] = useState(false)
  const [swapError, setSwapError] = useState('')
  const [swapTxHash, setSwapTxHash] = useState('')
  const [showSwapModal, setShowSwapModal] = useState(false)
  const [swapBalances, setSwapBalances] = useState(null) // Store before/after balances

  // MetaMask states
  const [isMetaMaskConnected, setIsMetaMaskConnected] = useState(false)
  const [metaMaskAccount, setMetaMaskAccount] = useState('')

  const openPrivateKeyModal = (action) => {
    setCurrentAction(action)
    setShowPrivateKeyModal(true)
    setError('')
    setTxHash('')
  }

  const closePrivateKeyModal = () => {
    setShowPrivateKeyModal(false)
    setPrivateKey('')
    setModalRecipientAddress('')
    setCurrentAction(null)
  }

  const checkContractInfo = async () => {
    if (!contractAddress) {
      setContractError('Please enter a contract address')
      return
    }

    setCheckingContract(true)
    setContractError('')
    setContractInfo(null)

    try {
      const web3 = new Web3("http://x21.i247.com:8545")
      const contract = new web3.eth.Contract(ERC20_ABI, contractAddress)

      // Fetch contract information
      const [name, symbol, decimals, totalSupply, owner] = await Promise.all([
        contract.methods.name().call().catch(() => 'N/A'),
        contract.methods.symbol().call().catch(() => 'N/A'),
        contract.methods.decimals().call().catch(() => '18'),
        contract.methods.totalSupply().call().catch(() => '0'),
        contract.methods.owner().call().catch(() => 'N/A')
      ])

      // Fetch owner balance
      let ownerBalance = '0'
      if (owner !== 'N/A') {
        try {
          ownerBalance = await contract.methods.balanceOf(owner).call()
        } catch (err) {
          console.error('Error fetching owner balance:', err)
        }
      }

      // Convert total supply and balance from wei to tokens
      const totalSupplyInTokens = web3.utils.fromWei(totalSupply.toString(), 'ether')
      const ownerBalanceInTokens = web3.utils.fromWei(ownerBalance.toString(), 'ether')

      setContractInfo({
        name,
        symbol,
        decimals: decimals.toString(),
        totalSupply: totalSupplyInTokens,
        owner,
        ownerBalance: ownerBalanceInTokens
      })
    } catch (err) {
      console.error('Error fetching contract info:', err)
      setContractError('Failed to fetch contract information. Please check the address and try again.')
    } finally {
      setCheckingContract(false)
    }
  }

  // Swap functions
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

  // MetaMask connection
  const connectMetaMask = async () => {
    try {
      if (typeof window.ethereum === 'undefined') {
        setSwapError('MetaMask is not installed. Please install MetaMask extension.')
        return
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
        // Use MetaMask
        web3 = new Web3(window.ethereum)
        account = { address: metaMaskAccount }
      } else {
        // Use private key
        web3 = new Web3("http://x21.i247.com:8545")
        account = web3.eth.accounts.privateKeyToAccount(
          swapPrivateKey.startsWith('0x') ? swapPrivateKey : '0x' + swapPrivateKey
        )
        web3.eth.accounts.wallet.add(account)
        web3.eth.defaultAccount = account.address
      }

      // Get balances BEFORE swap
      const fromTokenContract = new web3.eth.Contract(ERC20_ABI, fromToken)
      const toTokenContract = new web3.eth.Contract(ERC20_ABI, toToken)

      const beforeFromBalance = await fromTokenContract.methods.balanceOf(account.address).call()
      const beforeToBalance = await toTokenContract.methods.balanceOf(account.address).call()

      // Create swap contract instance
      if (fromToken === tokenVNDX && toToken === tokenSGPX || fromToken === tokenSGPX && toToken === tokenVNDX ) {
        swapContractAddress = SWAP_SGPX_VNDX_ADDRESS
      } else if (fromToken === tokenVNDX && toToken === tokenYENX || fromToken === tokenYENX && toToken === tokenVNDX ) {
        swapContractAddress = SWAP_YENX_VNDX_ADDRESS
      }
    
      const swapContract = new web3.eth.Contract(SWAP_ABI, swapContractAddress)

      const amountInWei = web3.utils.toWei(swapAmount, 'ether')

      let txReceipt

      // Determine which swap method to call based on token pair
      if (fromToken === tokenVNDX && (toToken === tokenSGPX || toToken === tokenYENX)) {
        const tokenVNDXContract = new web3.eth.Contract(ERC20_ABI, tokenVNDX)
        const approveTx = await tokenVNDXContract.methods.approve(swapContractAddress, amountInWei).send({
          from: account.address,
          gas: 300000
        })

        if(approveTx) {
          // Swap A for B
          txReceipt = await swapContract.methods.swapBforA(amountInWei).send({
            from: account.address,
            gas: 300000
          })
        }
      } else if (fromToken === tokenSGPX && toToken === tokenVNDX) {
        // Swap B for A
        const tokenSGPXContract = new web3.eth.Contract(ERC20_ABI, tokenSGPX)
        const approveTx = await tokenSGPXContract.methods.approve(swapContractAddress, amountInWei).send({
          from: account.address,
          gas: 300000
        })
        if(approveTx) {
          // Swap A for B
          txReceipt = await swapContract.methods.swapAforB(amountInWei).send({
            from: account.address,
            gas: 300000
          })
        }
      } else if (fromToken === tokenYENX && toToken === tokenVNDX) {
        // Swap B for A
        const tokenYENXContract = new web3.eth.Contract(ERC20_ABI, tokenYENX)
        const approveTx = await tokenYENXContract.methods.approve(swapContractAddress, amountInWei).send({
          from: account.address,
          gas: 300000
        })
        if(approveTx) {
          // Swap A for B
          txReceipt = await swapContract.methods.swapAforB(amountInWei).send({
            from: account.address,
            gas: 300000
          })
        }
      }
      else {
        throw new Error('Invalid token pair for swap')
      }

      // Get balances AFTER swap
      const afterFromBalance = await fromTokenContract.methods.balanceOf(account.address).call()
      const afterToBalance = await toTokenContract.methods.balanceOf(account.address).call()

      // Store balance information
      const fromTokenName = fromToken === tokenVNDX ? 'VNDX' : fromToken === tokenSGPX ? 'SGPX' : 'YENX'
      const toTokenName = toToken === tokenVNDX ? 'VNDX' : toToken === tokenSGPX ? 'SGPX' : 'YENX'

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
      const web3 = new Web3("http://x21.i247.com:8545")
      if (fromToken === tokenVNDX && toToken === tokenSGPX || fromToken === tokenSGPX && toToken === tokenVNDX ) {
        swapContractAddress = SWAP_SGPX_VNDX_ADDRESS
      } else if (fromToken === tokenVNDX && toToken === tokenYENX || fromToken === tokenYENX && toToken === tokenVNDX ) {
        swapContractAddress = SWAP_YENX_VNDX_ADDRESS
      }
      console.log("swapContractAddress: ", swapContractAddress)
      const swapContract = new web3.eth.Contract(SWAP_ABI, swapContractAddress)
      const amountInWei = web3.utils.toWei(inputAmount, 'ether')

      let outputWei
      if (fromTokenAddress === tokenVNDX && toTokenAddress === tokenSGPX) {
        outputWei = await swapContract.methods.getAmountOutBforA(amountInWei).call()
      } else if (fromTokenAddress === tokenSGPX && toTokenAddress === tokenVNDX) {
        outputWei = await swapContract.methods.getAmountOutAforB(amountInWei).call()
      } else if (fromTokenAddress === tokenYENX && toTokenAddress === tokenVNDX) {
        outputWei = await swapContract.methods.getAmountOutAforB(amountInWei).call()
      } else if (fromTokenAddress === tokenVNDX && toTokenAddress === tokenYENX) {
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

  const executeTransaction = async () => {
    if (!privateKey || !contractAddress) {
      setError('Please fill in all required fields')
      return
    }

    setLoading(true)
    setError('')
    setTxHash('')

    try {
      // Connect to the custom RPC
      const web3 = new Web3("http://x21.i247.com:8545")

      // Add private key to wallet
      const account = web3.eth.accounts.privateKeyToAccount(
        privateKey.startsWith('0x') ? privateKey : '0x' + privateKey
      )
      web3.eth.accounts.wallet.add(account)
      web3.eth.defaultAccount = account.address

      // Create contract instance
      const contract = new web3.eth.Contract(ERC20_ABI, contractAddress)

      let txReceipt
      let response
      let result
      const amountInWei = web3.utils.toWei(amount || '0', 'ether')
      console.log("signer: ", account.address)
      console.log("contract address: ", contractAddress)
      setRecipientAddress(account.address)
      // Execute the appropriate action
      switch (currentAction) {
        case 'mint':
          if (!recipientAddress) {
            setRecipientAddress(account.address)
          }

          txReceipt = await contract.methods.mint(recipientAddress, amountInWei).send({
            from: account.address,
            gas: 300000
          })
          // console.log("txData: ", contract.methods.mint(recipientAddress, amountInWei).encodeABI())

          // Call POST http://x23.i247.com:9090/api/mint with JSON body
          // const mintData = contract.methods.mint(recipientAddress, amountInWei).encodeABI()

          // Encrypt the private key before sending
          // const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey : '0x' + privateKey
          // const encryptedPrivateKey = encryptPrivateKey(formattedPrivateKey)

          // response = await fetch('https://m1.i247.com/kokka/token/mint', {
          //   method: 'POST',
          //   headers: {
          //     'Content-Type': 'application/json',
          //   },
          //   body: JSON.stringify({
          //     encrypted_private_key: encryptedPrivateKey,
          //     contract_address: contractAddress,
          //     to: await contract.methods.owner().call() ,
          //     amount: amount
          //   })
          // })

          // if (!response.ok) {
          //   throw new Error(`API call failed: ${response.statusText}`)
          // }

          // result = await response.json()
          // txReceipt = { transactionHash: result.tx_hash }
          break

        case 'burn':
          txReceipt = await contract.methods.burn(amountInWei).send({
            from: account.address,
            gas: 300000
          })

          // response = await fetch('https://m1.i247.com/kokka/token/burn', {
          //   method: 'POST',
          //   headers: {
          //     'Content-Type': 'application/json',
          //   },
          //   body: JSON.stringify({
          //     encrypted_private_key: encryptedPrivateKey,
          //     contract_address: contractAddress,
          //     amount: amount
          //   })
          // })

          // result = await response.json()
          // txReceipt = { transactionHash: result.tx_hash }
          // console.log("Burn txData: ", contract.methods.burn(amountInWei).encodeABI())
          break

        case 'transfer':
          if (!modalRecipientAddress) {
            setError('Recipient address is required for transfer')
            setLoading(false)
            return
          }
          txReceipt = await contract.methods.transfer(modalRecipientAddress, amountInWei).send({
            from: account.address,
            gas: 300000
          })

          // console.log("transfer txData: ", contract.methods.transfer(modalRecipientAddress, amountInWei).encodeABI())

          response = await fetch('https://m1.i247.com/kokka/token/transfer', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              encrypted_private_key: encryptedPrivateKey,
              contract_address: contractAddress,
              amount: amount,
              to: modalRecipientAddress
            })
          })

          result = await response.json()
          txReceipt = { transactionHash: result.tx_hash }
          break

        default:
          setError('Invalid action')
          setLoading(false)
          return
      }
      setTxHash(txReceipt.transactionHash)
      closePrivateKeyModal()

    } catch (err) {
      console.error('Transaction error:', err)
      setError(err.message || 'Transaction failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-container">
      <h1>STABLECOIN DASHBOARD</h1>

      {/* Tab Navigation */}
      <div className="tab-navigation" style={{ display: 'flex', gap: '10px', marginBottom: '20px', justifyContent: 'center' }}>
        <button
          onClick={() => setActiveTab('stablecoin')}
          className={`tab-button ${activeTab === 'stablecoin' ? 'active' : ''}`}
          style={{
            padding: '10px 30px',
            fontSize: '16px',
            cursor: 'pointer',
            backgroundColor: activeTab === 'stablecoin' ? '#4CAF50' : '#f1f1f1',
            color: activeTab === 'stablecoin' ? 'white' : 'black',
            border: 'none',
            borderRadius: '5px',
            fontWeight: activeTab === 'stablecoin' ? 'bold' : 'normal'
          }}
        >
          Stablecoin
        </button>
        <button
          onClick={() => setActiveTab('swap')}
          className={`tab-button ${activeTab === 'swap' ? 'active' : ''}`}
          style={{
            padding: '10px 30px',
            fontSize: '16px',
            cursor: 'pointer',
            backgroundColor: activeTab === 'swap' ? '#2196F3' : '#f1f1f1',
            color: activeTab === 'swap' ? 'white' : 'black',
            border: 'none',
            borderRadius: '5px',
            fontWeight: activeTab === 'swap' ? 'bold' : 'normal'
          }}
        >
          Token Swap
        </button>
      </div>

      {/* Stablecoin Tab */}
      {activeTab === 'stablecoin' && (
      <div className="form-container">
        {/* <div className="form-group">
          <label>RPC URL:</label>
          <input
            type="text"
            value={rpcUrl}
            onChange={(e) => setRpcUrl(e.target.value)}
            placeholder="https://your-rpc-url.com"
            className="input-field"
          />
        </div> */}

        {contractError && (
          <div className="error-message">
            <p>{contractError}</p>
          </div>
        )}

        {contractInfo && (
          <div className="contract-info-card">
            {/* <h3>Contract Information</h3> */}
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">Name:</span>
                <span className="info-value">{contractInfo.name}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Symbol:</span>
                <span className="info-value">{contractInfo.symbol}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Decimals:</span>
                <span className="info-value">{contractInfo.decimals}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Total Supply:</span>
                <span className="info-value">{contractInfo.totalSupply} {contractInfo.symbol}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Owner Address:</span>
                <span className="info-value contract-address">{contractInfo.owner}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Owner Balance:</span>
                <span className="info-value contract-address">{contractInfo.ownerBalance} {contractInfo.symbol}</span>
              </div>
            </div>
          </div>
        )}

        <div className="form-group">
          <label>ERC20 Contract Address:</label>
          <div className="input-with-button">
            <input
              type="text"
              value={contractAddress}
              onChange={(e) => setContractAddress(e.target.value)}
              placeholder="0x..."
              className="input-field"
            />
            <button
              onClick={checkContractInfo}
              className="check-button"
              disabled={!contractAddress || checkingContract}
            >
              {checkingContract ? 'Checking...' : 'Check'}
            </button>
          </div>
        </div>

        <div className="form-group">
          <label>Amount (in tokens):</label>
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100"
            className="input-field"
          />
        </div>

        {/* <div className="form-group">
          <label>Recipient Address (for Mint/Transfer):</label>
          <input
            type="text"
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            placeholder="0x..."
            className="input-field"
          />
        </div> */}

        <div className="button-group">
          <button
            onClick={() => openPrivateKeyModal('mint')}
            className="action-button mint-button"
            disabled={!contractAddress || !amount}
          >
            Mint
          </button>

          <button
            onClick={() => openPrivateKeyModal('burn')}
            className="action-button burn-button"
            disabled={!contractAddress || !amount}
          >
            Burn
          </button>

          <button
            onClick={() => openPrivateKeyModal('transfer')}
            className="action-button transfer-button"
            disabled={!contractAddress || !amount}
          >
            Transfer
          </button>
        </div>

        {txHash && (
          <div className="success-message">
            <h3>Transaction Successful!</h3>
            <p>Transaction Hash:</p>
            <a
              href={`http://x23.i247.com:8888/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="tx-hash-link"
            >
              <code className="tx-hash">{txHash}</code>
            </a>
          </div>
        )}

        {error && (
          <div className="error-message">
            <p>{error}</p>
          </div>
        )}
      </div>
      )}

      {/* Swap Tab */}
      {activeTab === 'swap' && (
      <div className="form-container">
        {/* <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>Token Swap</h2> */}

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
              <option value={tokenVNDX}>VNDX</option>
              <option value={tokenSGPX}>SGPX</option>
              <option value={tokenYENX}>YENX</option>
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
              <option value={tokenVNDX}>VNDX</option>
              <option value={tokenSGPX}>SGPX</option>
              <option value={tokenYENX}>YENX</option>
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

            {/* Account Address */}
            {swapBalances && (
              <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#f0f8ff', borderRadius: '5px' }}>
                <p style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>
                  <strong>Account:</strong> {swapBalances.accountAddress.substring(0, 10)}...{swapBalances.accountAddress.substring(swapBalances.accountAddress.length - 8)}
                </p>
              </div>
            )}

            {/* Balance Information */}
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
              href={`http://x23.i247.com:8888/tx/${swapTxHash}`}
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
      )}

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
                <strong>From:</strong> {swapAmount} {fromToken === tokenVNDX ? 'VNDX' : fromToken === tokenSGPX ? 'SGPX' : 'YENX'}
              </p>
              <p style={{ fontSize: '18px', margin: 0, color: '#fff' }}>
                →
              </p>
              <p style={{ fontSize: '18px', margin: 0, color: '#fff' }}>
                <strong>To:</strong> {estimatedOutput} {toToken === tokenVNDX ? 'VNDX' : toToken === tokenSGPX ? 'SGPX' : 'YENX'}
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
                {swapLoading ? 'Processing...' : 'Confirm Swap'}
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

      {/* Private Key Modal for Stablecoin Operations */}
      {showPrivateKeyModal && (
        <div className="modal-overlay" onClick={closePrivateKeyModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Enter Private Key</h2>
            <p className="warning">
              Warning: Never share your private key with anyone!
            </p>

            <input
              type="password"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder="Enter your private key"
              className="input-field"
              autoFocus
            />

            {currentAction === 'transfer' && (
              <input
                type="text"
                value={modalRecipientAddress}
                onChange={(e) => setModalRecipientAddress(e.target.value)}
                placeholder="Enter recipient address (0x...)"
                className="input-field"
              />
            )}

            <div className="modal-buttons">
              <button
                onClick={executeTransaction}
                className="confirm-button"
                disabled={loading || !privateKey || (currentAction === 'transfer' && !modalRecipientAddress)}
              >
                {loading ? 'Processing...' : 'Sign & Send Transaction'}
              </button>

              <button
                onClick={closePrivateKeyModal}
                className="cancel-button"
                disabled={loading}
              >
                Cancel
              </button>
            </div>

            {error && (
              <div className="error-message">
                <p>{error}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
