import { useState, useEffect, useRef } from 'react'
import Web3 from 'web3'
import { Connection, PublicKey, Transaction } from '@solana/web3.js'
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token'
import { ERC20_ABI } from '../../erc20_abi'

const isSolanaAddress = (addr) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)

// Discovers injected EVM wallet extensions (MetaMask, Coinbase Wallet, etc.)
// via EIP-6963, so multiple extensions installed at once don't fight over
// `window.ethereum`.
const useInjectedEvmProviders = () => {
  const [providers, setProviders] = useState({}) // rdns -> { info, provider }
  useEffect(() => {
    const onAnnounce = (event) => {
      const { info, provider } = event.detail || {}
      if (!info?.rdns || !provider) return
      setProviders((prev) => ({ ...prev, [info.rdns]: { info, provider } }))
    }
    window.addEventListener('eip6963:announceProvider', onAnnounce)
    window.dispatchEvent(new Event('eip6963:requestProvider'))
    return () => window.removeEventListener('eip6963:announceProvider', onAnnounce)
  }, [])
  
  return providers
}

const EVM_WALLETS = {
  metamask: { label: 'MetaMask', icon: '🦊', rdns: 'io.metamask' },
  coinbase: { label: 'Coinbase Wallet', icon: '🔵', rdns: 'com.coinbase.wallet' },
}

// Resolves the actual EIP-1193 provider object for a given wallet, preferring
// EIP-6963 discovery and falling back to the legacy `window.ethereum`
// (or `window.ethereum.providers`) multi-injection pattern.
const getEvmProvider = (eip6963Providers, walletKey) => {
  const { rdns } = EVM_WALLETS[walletKey]
  if (eip6963Providers[rdns]) return eip6963Providers[rdns].provider

  const list = window.ethereum?.providers?.length
    ? window.ethereum.providers
    : window.ethereum ? [window.ethereum] : []

  if (walletKey === 'metamask') {
    return list.find((p) => p.isMetaMask && !p.isCoinbaseWallet) || null
  }
  return list.find((p) => p.isCoinbaseWallet) || null
}

const CHAINS = [
  {
    name: 'Base Sepolia', icon: '🔵', color: '#0052ff', nativeSymbol: 'ETH',
    chainId: '0x14A34', chainName: 'Base Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpc: 'https://sepolia.base.org',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    explorer: 'https://sepolia.basescan.org',
  },
  {
    name: 'Base Mainnet', icon: '🔵', color: '#0052ff', nativeSymbol: 'ETH',
    chainId: '0x2105', chainName: 'Base',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpc: 'https://mainnet.base.org',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    explorer: 'https://basescan.org',
  },
  {
    name: 'Polygon', icon: '🟣', color: '#8247e5', nativeSymbol: 'POL',
    chainId: '0x89', chainName: 'Polygon Mainnet',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    rpc: 'https://polygon.drpc.org',
    usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    explorer: 'https://polygonscan.com',
    minPriorityFeeGwei: 25,
  },
  {
    name: 'Polygon Amoy', icon: '🟣', color: '#8247e5', nativeSymbol: 'POL',
    chainId: '0x13882', chainName: 'Polygon Amoy',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    rpc: 'https://rpc-amoy.polygon.technology',
    usdc: '0x8B0180f2101c8260d49339abfEe87927412494B4',
    explorer: 'https://amoy.polygonscan.com',
    minPriorityFeeGwei: 25,
  },
  {
    name: 'Solana Devnet', icon: '🟢', color: '#00ff7f', nativeSymbol: 'SOL',
    isSolana: true,
    rpc: 'https://api.devnet.solana.com',
    // Circle-issued devnet USDC mint
    usdc: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    explorer: 'https://explorer.solana.com',
    clusterParam: '?cluster=devnet',
  },
]

const BaseCoinTab = () => {
  // Send section
  const [account, setAccount] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [walletType, setWalletType] = useState(null) // 'metamask' | 'coinbase' | 'phantom'
  const [connectedEvmProvider, setConnectedEvmProvider] = useState(null) // active EIP-1193 provider
  const [sendNetwork, setSendNetwork] = useState(null)
  const [usdcBalance, setUsdcBalance] = useState(null)
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [connectingWallet, setConnectingWallet] = useState(null) // 'metamask' | 'coinbase' | 'phantom' | null
  const connecting = connectingWallet !== null
  const [txHash, setTxHash] = useState('')
  const [error, setError] = useState('')
  const [gasInfo, setGasInfo] = useState(null)
  const [isEstimating, setIsEstimating] = useState(false)

  // Balance checker section
  const [checkAddress, setCheckAddress] = useState('')
  const [checkLoading, setCheckLoading] = useState(false)
  const [checkResults, setCheckResults] = useState(null)
  const [checkError, setCheckError] = useState('')

  const sendNetworkRef = useRef(sendNetwork)
  const walletTypeRef = useRef(walletType)
  useEffect(() => { sendNetworkRef.current = sendNetwork }, [sendNetwork])
  useEffect(() => { walletTypeRef.current = walletType }, [walletType])

  const evmProviders = useInjectedEvmProviders()

  // accountsChanged listener for whichever EVM provider (MetaMask /
  // Coinbase Wallet) is currently connected
  useEffect(() => {
    if (!connectedEvmProvider) return
    const onAccountsChanged = (newAccounts) => {
      if (newAccounts.length === 0) {
        setAccount(''); setIsConnected(false); setSendNetwork(null)
        setUsdcBalance(null); setGasInfo(null); setWalletType(null)
        setConnectedEvmProvider(null)
      } else {
        const current = newAccounts[0]
        setAccount(current)
        setGasInfo(null)
        if (sendNetworkRef.current) fetchBalance(current, sendNetworkRef.current)
      }
    }
    connectedEvmProvider.on('accountsChanged', onAccountsChanged)
    return () => connectedEvmProvider.removeListener('accountsChanged', onAccountsChanged)
  }, [connectedEvmProvider])

  // Phantom accountChanged listener
  useEffect(() => {
    if (!window.solana) return
    const onAccountChanged = (publicKey) => {
      if (walletTypeRef.current !== 'phantom') return
      if (!publicKey) {
        setAccount(''); setIsConnected(false); setSendNetwork(null)
        setUsdcBalance(null); setWalletType(null)
      } else {
        const pubkey = publicKey.toString()
        setAccount(pubkey)
        if (sendNetworkRef.current) fetchBalance(pubkey, sendNetworkRef.current)
      }
    }
    window.solana.on('accountChanged', onAccountChanged)
    return () => window.solana.off('accountChanged', onAccountChanged)
  }, [])

  const selectSendNetwork = (chain) => {
    // Reset connection when switching between EVM and Solana wallet types
    const isEvmWallet = walletType === 'metamask' || walletType === 'coinbase'
    if (walletType === 'phantom' && !chain.isSolana) {
      window.solana?.disconnect().catch(() => {})
      setIsConnected(false); setAccount(''); setWalletType(null)
    } else if (isEvmWallet && chain.isSolana) {
      setIsConnected(false); setAccount(''); setWalletType(null); setConnectedEvmProvider(null)
    }
    setSendNetwork(chain)
    setUsdcBalance(null)
    setTxHash('')
    setError('')
    setGasInfo(null)
  }

  // walletKey: 'metamask' | 'coinbase'
  const connectEvm = async (walletKey) => {
    const provider = getEvmProvider(evmProviders, walletKey)
    if (!provider) {
      setError(`${EVM_WALLETS[walletKey].label} not found. Please install it.`)
      return
    }
    setConnectingWallet(walletKey)
    setError('')
    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' })
      if (!accounts?.length) { setError('No accounts found.'); return }

      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: sendNetwork.chainId }],
        })
      } catch (switchError) {
        if (switchError.code === 4902) {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: sendNetwork.chainId,
              chainName: sendNetwork.chainName,
              nativeCurrency: sendNetwork.nativeCurrency,
              rpcUrls: [sendNetwork.rpc],
              blockExplorerUrls: [sendNetwork.explorer],
            }],
          })
        } else {
          throw switchError
        }
      }

      const addr = provider.selectedAddress || accounts[0]
      // console.log('Connected account:', addr)
      // console.log('Provider selectedAddress:', provider.selectedAddress)
      // console.log('Provider accounts[0]:', accounts[0])
      setAccount(addr)
      setIsConnected(true)
      setWalletType(walletKey)
      setConnectedEvmProvider(provider)
      await fetchBalance(addr, sendNetwork)
    } catch (err) {
      setError('Connection failed: ' + err.message)
    } finally {
      setConnectingWallet(null)
    }
  }

  const connectPhantom = async () => {
    if (!window.solana?.isPhantom) {
      setError('Phantom wallet not found. Please install Phantom.')
      return
    }
    setConnectingWallet('phantom')
    setError('')
    try {
      const resp = await window.solana.connect()
      const pubkey = resp.publicKey.toString()
      setAccount(pubkey)
      setIsConnected(true)
      setWalletType('phantom')
      await fetchBalance(pubkey, sendNetwork)
    } catch (err) {
      setError('Phantom connection failed: ' + err.message)
    } finally {
      setConnectingWallet(null)
    }
  }

  const disconnect = () => {
    if (walletType === 'phantom') window.solana?.disconnect().catch(() => {})
    setAccount('')
    setIsConnected(false)
    setWalletType(null)
    setConnectedEvmProvider(null)
    setSendNetwork(null)
    setUsdcBalance(null)
    setTxHash('')
    setError('')
    setGasInfo(null)
  }

  const fetchBalance = async (addr, chain) => {
    try {
      if (chain.isSolana) {
        const resp = await fetch(chain.rpc, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1, method: 'getTokenAccountsByOwner',
            params: [addr, { mint: chain.usdc }, { encoding: 'jsonParsed' }],
          }),
        })
        const data = await resp.json()
        const accs = data.result?.value || []
        const bal = accs.length > 0 ? accs[0].account.data.parsed.info.tokenAmount.uiAmount : 0
        setUsdcBalance(Number(bal).toFixed(6))
      } else {
        const web3 = new Web3(chain.rpc)
        const usdc = new web3.eth.Contract(ERC20_ABI, chain.usdc)
        const raw = await usdc.methods.balanceOf(addr).call()
        setUsdcBalance((Number(raw) / 1e6).toFixed(6))
      }
    } catch {
      setUsdcBalance(null)
    }
  }

  const estimateGas = async (toAddress, amt, acct) => {
    if (!sendNetwork || sendNetwork.isSolana) return
    const parsed = parseFloat(amt)
    if (!toAddress || !Web3.utils.isAddress(toAddress) || !amt || isNaN(parsed) || parsed <= 0) {
      setGasInfo(null)
      return
    }
    setIsEstimating(true)
    setGasInfo(null)
    try {
      const web3 = new Web3(sendNetwork.rpc)
      const usdc = new web3.eth.Contract(ERC20_ABI, sendNetwork.usdc)
      const rawAmount = BigInt(Math.round(parsed * 1e6))
      const [gasUnits, gasPriceWei] = await Promise.all([
        usdc.methods.transfer(toAddress, rawAmount.toString()).estimateGas({ from: acct }),
        web3.eth.getGasPrice(),
      ])
      const minFeeWei = sendNetwork.minPriorityFeeGwei
        ? BigInt(sendNetwork.minPriorityFeeGwei) * 1_000_000_000n
        : 0n
      const gasPriceBig = BigInt(gasPriceWei)
      const effectiveGasPrice = gasPriceBig > minFeeWei ? gasPriceBig : minFeeWei
      // Divide in Gwei first to stay within Number's safe integer range (< 2^53)
      const feeGwei = Number(BigInt(gasUnits) * effectiveGasPrice / 1_000_000_000n)
      setGasInfo({
        gasUnits: Number(gasUnits),
        gasPriceGwei: (Number(effectiveGasPrice) / 1e9).toFixed(4),
        feeEth: (feeGwei / 1e9).toFixed(8),
        symbol: sendNetwork.nativeSymbol,
      })
    } catch {
      setGasInfo(null)
    } finally {
      setIsEstimating(false)
    }
  }

  const sendEvmUsdc = async () => {
    if (!connectedEvmProvider) throw new Error('Wallet not connected')
    const web3 = new Web3(sendNetwork.rpc)
    const usdc = new web3.eth.Contract(ERC20_ABI, sendNetwork.usdc)
    const rawAmount = BigInt(Math.round(parseFloat(amount) * 1e6))
    const data = usdc.methods.transfer(recipient, rawAmount.toString()).encodeABI()
    const gasLimit = gasInfo ? Math.ceil(gasInfo.gasUnits * 1.2) : 100000
    const txParams = { from: account, to: sendNetwork.usdc, data, gas: Web3.utils.toHex(gasLimit) }

    if (sendNetwork.minPriorityFeeGwei) {
      const minWei = BigInt(sendNetwork.minPriorityFeeGwei) * 1_000_000_000n
      const networkGasPrice = BigInt(await web3.eth.getGasPrice())
      const tip = networkGasPrice > minWei ? networkGasPrice : minWei
      const tipWithBuffer = tip * 12n / 10n          // +20% buffer
      const maxFee = tipWithBuffer * 2n              // headroom for base fee fluctuation
      txParams.maxPriorityFeePerGas = '0x' + tipWithBuffer.toString(16)
      txParams.maxFeePerGas = '0x' + maxFee.toString(16)
    }

    return await connectedEvmProvider.request({
      method: 'eth_sendTransaction',
      params: [txParams],
    })
  }

  const sendSolanaUsdc = async () => {
    if (!window.solana) throw new Error('Phantom not available')
    const connection = new Connection(sendNetwork.rpc, 'confirmed')
    const senderPubkey = new PublicKey(account)
    const recipientPubkey = new PublicKey(recipient)
    const mintPubkey = new PublicKey(sendNetwork.usdc)

    const [senderATA, recipientATA] = await Promise.all([
      getAssociatedTokenAddress(mintPubkey, senderPubkey),
      getAssociatedTokenAddress(mintPubkey, recipientPubkey),
    ])

    const rawAmount = BigInt(Math.round(parseFloat(amount) * 1e6))
    const tx = new Transaction()

    // Create recipient's ATA if it doesn't exist yet (payer: sender)
    const recipientAtaInfo = await connection.getAccountInfo(recipientATA)
    if (!recipientAtaInfo) {
      tx.add(createAssociatedTokenAccountInstruction(
        senderPubkey, recipientATA, recipientPubkey, mintPubkey,
      ))
    }

    tx.add(createTransferInstruction(senderATA, recipientATA, senderPubkey, rawAmount))
    const { blockhash } = await connection.getLatestBlockhash()
    tx.recentBlockhash = blockhash
    tx.feePayer = senderPubkey

    const { signature } = await window.solana.signAndSendTransaction(tx)
    return signature
  }

  const sendUsdc = async () => {
    setError('')
    setTxHash('')
    if (!sendNetwork) { setError('Please select a network first.'); return }

    if (sendNetwork.isSolana) {
      if (!recipient || !isSolanaAddress(recipient)) {
        setError('Enter a valid Solana address.')
        return
      }
    } else {
      if (!recipient || !Web3.utils.isAddress(recipient)) {
        setError('Enter a valid recipient address.')
        return
      }
    }

    const parsed = parseFloat(amount)
    if (!amount || isNaN(parsed) || parsed <= 0) { setError('Enter a valid amount.'); return }

    setLoading(true)
    try {
      const hash = sendNetwork.isSolana ? await sendSolanaUsdc() : await sendEvmUsdc()
      setTxHash(hash)
      setAmount('')
      setRecipient('')
      setGasInfo(null)
      await fetchBalance(account, sendNetwork)
    } catch (err) {
      setError(err.message || 'Transaction failed.')
    } finally {
      setLoading(false)
    }
  }

  const fetchAllChainBalances = async () => {
    const trimmed = checkAddress.trim()
    const isEvmAddr = Web3.utils.isAddress(trimmed)
    const isSolAddr = isSolanaAddress(trimmed)

    if (!trimmed || (!isEvmAddr && !isSolAddr)) {
      setCheckError('Enter a valid EVM (0x...) or Solana address.')
      setCheckResults(null)
      return
    }
    setCheckLoading(true)
    setCheckResults(null)
    setCheckError('')

    const settled = await Promise.allSettled(
      CHAINS.map(async (chain) => {
        if (chain.isSolana) {
          if (!isSolAddr) throw new Error('Not a Solana address')
          const [solResp, tokenResp] = await Promise.all([
            fetch(chain.rpc, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [trimmed] }),
            }),
            fetch(chain.rpc, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0', id: 2, method: 'getTokenAccountsByOwner',
                params: [trimmed, { mint: chain.usdc }, { encoding: 'jsonParsed' }],
              }),
            }),
          ])
          const solData = await solResp.json()
          const tokenData = await tokenResp.json()
          const native = ((solData.result?.value ?? 0) / 1e9).toFixed(6)
          const accs = tokenData.result?.value || []
          const usdc = accs.length > 0
            ? Number(accs[0].account.data.parsed.info.tokenAmount.uiAmount).toFixed(6)
            : '0.000000'
          return { chain, native, usdc }
        } else {
          if (!isEvmAddr) throw new Error('Not an EVM address')
          const web3 = new Web3(chain.rpc)
          const usdc = new web3.eth.Contract(ERC20_ABI, chain.usdc)
          const [nativeRaw, usdcRaw] = await Promise.all([
            web3.eth.getBalance(trimmed),
            usdc.methods.balanceOf(trimmed).call(),
          ])
          return {
            chain,
            native: (Number(nativeRaw) / 1e18).toFixed(6),
            usdc: (Number(usdcRaw) / 1e6).toFixed(6),
          }
        }
      })
    )

    setCheckResults(settled.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : { chain: CHAINS[i], error: r.reason?.message || 'Failed to fetch' }
    ))
    setCheckLoading(false)
  }

  const explorerTxUrl = (chain, hash) =>
    chain.isSolana
      ? `${chain.explorer}/tx/${hash}${chain.clusterParam || ''}`
      : `${chain.explorer}/tx/${hash}`

  const explorerAddrUrl = (chain, addr) =>
    chain.isSolana
      ? `${chain.explorer}/address/${addr}${chain.clusterParam || ''}`
      : `${chain.explorer}/address/${addr}`

  return (
    <div className="form-container">
      <h2 style={{ color: '#fff', marginBottom: '4px' }}>Send USDC</h2>
      <p style={{ color: '#aaa', fontSize: '13px', marginBottom: '20px' }}>
        Select a network, connect your wallet, then send USDC.
      </p>

      {/* Step 1 — Network selection */}
      <div style={{ marginBottom: '20px' }}>
        <p style={{ color: '#ccc', fontSize: '13px', fontWeight: '600', marginBottom: '10px' }}>
          Step 1 — Select Network
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {CHAINS.map((chain) => {
            const isActive = sendNetwork?.name === chain.name
            return (
              <button
                key={chain.name}
                onClick={() => selectSendNetwork(chain)}
                style={{
                  padding: '12px 10px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: isActive ? '#000' : chain.color,
                  backgroundColor: isActive ? chain.color : 'transparent',
                  border: `2px solid ${chain.color}`,
                  borderRadius: '10px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <span>{chain.icon}</span>
                <span>{chain.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Step 2 — Connect wallet (shown after network selected, before connected) */}
      {sendNetwork && !isConnected && (
        <div style={{ marginBottom: '20px' }}>
          <p style={{ color: '#ccc', fontSize: '13px', fontWeight: '600', marginBottom: '10px' }}>
            Step 2 — Connect Wallet
          </p>
          {sendNetwork.isSolana ? (
            <button
              onClick={connectPhantom}
              disabled={connecting}
              style={{
                width: '100%',
                padding: '14px',
                fontSize: '16px',
                fontWeight: '600',
                color: '#000',
                backgroundColor: connecting ? '#555' : sendNetwork.color,
                border: 'none',
                borderRadius: '10px',
                cursor: connecting ? 'not-allowed' : 'pointer',
              }}
            >
              {connectingWallet === 'phantom' ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <span style={{
                    width: '14px', height: '14px',
                    border: '2px solid #888',
                    borderTop: '2px solid #fff',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                  Connecting...
                </span>
              ) : '👻 Connect Phantom'}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '10px' }}>
              {Object.entries(EVM_WALLETS).map(([walletKey, wallet]) => (
                <button
                  key={walletKey}
                  onClick={() => connectEvm(walletKey)}
                  disabled={connecting}
                  style={{
                    flex: 1,
                    padding: '14px',
                    fontSize: '15px',
                    fontWeight: '600',
                    color: '#000',
                    backgroundColor: connecting ? '#555' : sendNetwork.color,
                    border: 'none',
                    borderRadius: '10px',
                    cursor: connecting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {connectingWallet === walletKey ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <span style={{
                        width: '14px', height: '14px',
                        border: '2px solid #888',
                        borderTop: '2px solid #fff',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                      }} />
                      Connecting...
                    </span>
                  ) : `${wallet.icon} ${wallet.label}`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Connected status */}
      {isConnected && (
        <div style={{
          padding: '14px',
          backgroundColor: '#e8f5e9',
          borderRadius: '10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
        }}>
          <div>
            <span style={{ fontSize: '14px', color: '#2e7d32', fontWeight: '600' }}>
              ✓ Connected to {walletType === 'phantom' ? 'Phantom' : EVM_WALLETS[walletType]?.label}
              {' — '}{sendNetwork?.icon} {sendNetwork?.name}
            </span>
            <p style={{ fontSize: '12px', color: '#555', margin: '4px 0 0' }}>
              {account.slice(0, 10)}...{account.slice(-8)}
            </p>
            {usdcBalance !== null && (
              <p style={{ fontSize: '13px', color: '#0052ff', margin: '4px 0 0', fontWeight: '600' }}>
                Balance: {usdcBalance} USDC
              </p>
            )}
          </div>
          <button
            onClick={disconnect}
            style={{
              padding: '6px 14px', fontSize: '13px', color: '#555',
              backgroundColor: '#fff', border: '1px solid #ccc',
              borderRadius: '6px', cursor: 'pointer',
            }}
          >
            Disconnect
          </button>
        </div>
      )}

      {/* Step 3 — Transfer form */}
      {sendNetwork && isConnected && (
        <>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label style={{ color: '#ccc', fontSize: '14px', display: 'block', marginBottom: '6px' }}>
              Recipient Address
            </label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => {
                setRecipient(e.target.value)
                if (!sendNetwork.isSolana) estimateGas(e.target.value, amount, account)
              }}
              placeholder={sendNetwork.isSolana ? 'Solana address...' : '0x...'}
              className="input-field"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label style={{ color: '#ccc', fontSize: '14px', display: 'block', marginBottom: '6px' }}>
              Amount (USDC)
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                if (!sendNetwork.isSolana) estimateGas(recipient, e.target.value, account)
              }}
              placeholder="0.00"
              className="input-field"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          {/* Fee panel */}
          <div style={{
            marginBottom: '16px',
            padding: '12px 14px',
            borderRadius: '10px',
            backgroundColor: '#1a1a2e',
            border: '1px solid #2a2a4a',
            minHeight: '44px',
            display: 'flex',
            alignItems: 'center',
          }}>
            {sendNetwork.isSolana ? (
              <span style={{ fontSize: '13px', color: '#aaa' }}>
                🟢 Solana network fee: ~0.000005 SOL per transaction
              </span>
            ) : isEstimating ? (
              <span style={{ fontSize: '13px', color: '#888', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  width: '12px', height: '12px',
                  border: '2px solid #555', borderTop: '2px solid #aaa',
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0,
                }} />
                Estimating gas fee...
              </span>
            ) : gasInfo ? (
              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#aaa' }}>Estimated gas fee</span>
                  <span style={{ fontSize: '14px', color: '#fff', fontWeight: '600' }}>
                    {gasInfo.feeEth} {gasInfo.symbol}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                  <span style={{ fontSize: '12px', color: '#666' }}>Gas units</span>
                  <span style={{ fontSize: '12px', color: '#888' }}>{gasInfo.gasUnits.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                  <span style={{ fontSize: '12px', color: '#666' }}>Gas price</span>
                  <span style={{ fontSize: '12px', color: '#888' }}>{gasInfo.gasPriceGwei} Gwei</span>
                </div>
              </div>
            ) : (
              <span style={{ fontSize: '13px', color: '#555' }}>
                Gas fee will appear once recipient and amount are filled
              </span>
            )}
          </div>

          <button
            onClick={sendUsdc}
            disabled={loading}
            style={{
              width: '100%',
              padding: '16px',
              fontSize: '17px',
              fontWeight: '600',
              color: '#000',
              backgroundColor: loading ? '#999' : sendNetwork.color,
              border: 'none',
              borderRadius: '12px',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s',
            }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <span style={{
                  width: '16px', height: '16px',
                  border: '2px solid #fff', borderTop: '2px solid transparent',
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                }} />
                Sending...
              </span>
            ) : `Send USDC on ${sendNetwork.name}`}
          </button>

          {txHash && (
            <div className="success-message" style={{ marginTop: '20px' }}>
              <h3>Transfer Successful!</h3>
              <p>Transaction Hash:</p>
              <a
                href={explorerTxUrl(sendNetwork, txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="tx-hash-link"
              >
                <code className="tx-hash">{txHash}</code>
              </a>
            </div>
          )}
        </>
      )}

      {error && (
        <div className="error-message" style={{ marginTop: '16px' }}>
          <p>{error}</p>
        </div>
      )}

      {/* ── Balance Checker ── */}
      <div style={{ marginTop: '36px', borderTop: '1px solid #2a2a4a', paddingTop: '28px' }}>
        <h3 style={{ color: '#fff', marginBottom: '4px', fontSize: '18px' }}>Check Balance</h3>
        <p style={{ color: '#aaa', fontSize: '13px', marginBottom: '18px' }}>
          Enter an EVM or Solana address — fetches all networks at once. No wallet needed.
        </p>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label style={{ color: '#ccc', fontSize: '14px', display: 'block', marginBottom: '6px' }}>
              Address
            </label>
            <input
              type="text"
              value={checkAddress}
              onChange={(e) => {
                setCheckAddress(e.target.value)
                setCheckResults(null)
                setCheckError('')
              }}
              onKeyDown={(e) => e.key === 'Enter' && fetchAllChainBalances()}
              placeholder="0x... or Solana address"
              className="input-field"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <button
            onClick={fetchAllChainBalances}
            disabled={checkLoading}
            style={{
              padding: '12px 20px',
              fontSize: '14px',
              fontWeight: '600',
              color: '#fff',
              backgroundColor: checkLoading ? '#555' : '#0052ff',
              border: 'none',
              borderRadius: '10px',
              cursor: checkLoading ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {checkLoading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                  width: '12px', height: '12px',
                  border: '2px solid #aaa', borderTop: '2px solid #fff',
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                }} />
                Fetching...
              </span>
            ) : 'Check All Networks'}
          </button>
        </div>

        {checkError && (
          <div className="error-message" style={{ marginBottom: '12px' }}>
            <p>{checkError}</p>
          </div>
        )}

        {checkResults && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {checkResults.map((result) => (
              <div
                key={result.chain.name}
                style={{
                  padding: '14px 16px',
                  backgroundColor: '#0f1117',
                  borderRadius: '12px',
                  border: `1px solid ${result.chain.color}44`,
                }}
              >
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  marginBottom: result.error ? 0 : '12px',
                }}>
                  <span style={{ fontSize: '16px' }}>{result.chain.icon}</span>
                  <span style={{ color: result.chain.color, fontWeight: '700', fontSize: '14px' }}>
                    {result.chain.name}
                  </span>
                  {!result.error && (
                    <a
                      href={explorerAddrUrl(result.chain, checkAddress.trim())}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ marginLeft: 'auto', fontSize: '12px', color: '#888', textDecoration: 'underline' }}
                    >
                      Explorer
                    </a>
                  )}
                </div>

                {result.error ? (
                  <p style={{ color: '#e57373', fontSize: '12px', margin: 0 }}>{result.error}</p>
                ) : (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{
                      flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 12px', backgroundColor: '#1a1a2e', borderRadius: '8px',
                    }}>
                      <span style={{ color: '#aaa', fontSize: '12px' }}>{result.chain.nativeSymbol}</span>
                      <span style={{ color: '#fff', fontWeight: '600', fontSize: '13px' }}>{result.native}</span>
                    </div>
                    <div style={{
                      flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 12px', backgroundColor: '#1a1a2e', borderRadius: '8px',
                    }}>
                      <span style={{ color: '#aaa', fontSize: '12px' }}>USDC</span>
                      <span style={{ color: '#2775ca', fontWeight: '600', fontSize: '13px' }}>{result.usdc}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default BaseCoinTab
