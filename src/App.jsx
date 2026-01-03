import { useState } from 'react'
import './App.css'
import Web3 from 'web3'
import {ERC20_ABI} from '../erc20_abi'


function App() {
  const [contractAddress, setContractAddress] = useState('')
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
          break

        case 'burn':
          txReceipt = await contract.methods.burn(amountInWei).send({
            from: account.address,
            gas: 300000
          })
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

        <div className="form-group">
          <label>ERC20 Contract Address:</label>
          <input
            type="text"
            value={contractAddress}
            onChange={(e) => setContractAddress(e.target.value)}
            placeholder="0x..."
            className="input-field"
          />
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
