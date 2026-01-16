import { useState } from 'react'
import QRCode from 'react-qr-code'
import { CHAIN_ID, TOKEN_VNDX, TOKEN_YENX } from './constants'

const GenerateQRTab = () => {
  const [selectedToken, setSelectedToken] = useState('vndx')
  const [amount, setAmount] = useState('')
  const [recipientAddress, setRecipientAddress] = useState('0x7cB61D4117AE31a12E393a1Cfa3BaC666481D02E')
  const [qrGenerated, setQrGenerated] = useState(false)

  const tokens = {
    kokka: { name: 'Kokka', address: null, decimals: 18 },
    vndx: { name: 'VNDX', address: TOKEN_VNDX, decimals: 18 },
    sgpx: { name: 'SGPX', address: TOKEN_VNDX, decimals: 18 },
    yenx: { name: 'YENX', address: TOKEN_YENX, decimals: 18 }
  }

  const generateQRData = () => {
    if (!amount || !recipientAddress) return ''

    const token = tokens[selectedToken]
    const amountInWei = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, token.decimals))).toString()

    if (selectedToken === 'kokka') {
      console.log('Generating QR for native token:', `ethereum:${recipientAddress}@${CHAIN_ID}?value=${amountInWei}`)
      return `ethereum:${recipientAddress}@${CHAIN_ID}?value=${amountInWei}`
    } else {
      console.log('Generating QR for token:', `ethereum:${token.address}@${CHAIN_ID}/transfer?address=${recipientAddress}&uint256=${amountInWei}`)
      return `ethereum:${token.address}@${CHAIN_ID}/transfer?address=${recipientAddress}&uint256=${amountInWei}`
    }
  }

  const handleGenerate = () => {
    if (amount && recipientAddress) {
      setQrGenerated(true)
    }
  }

  const handleReset = () => {
    setQrGenerated(false)
    setAmount('')
    setRecipientAddress('')
  }

  const qrData = generateQRData()

  return (
    <div style={{
      maxWidth: '500px',
      margin: '0 auto',
      padding: '30px',
      backgroundColor: '#fff',
      borderRadius: '12px',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
    }}>
      <h2 style={{ textAlign: 'center', marginBottom: '24px', color: '#333' }}>
        Generate Payment QR Code
      </h2>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#555' }}>
          Select Token:
        </label>
        <select
          value={selectedToken}
          onChange={(e) => { setSelectedToken(e.target.value); setQrGenerated(false); }}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '16px',
            borderRadius: '8px',
            border: '1px solid #ddd',
            backgroundColor: '#f9f9f9',
            cursor: 'pointer'
          }}
        >
          <option value="kokka">Kokka (Native)</option>
          <option value="vndx">VNDX</option>
          <option value="sgpx">SGPX</option>
          <option value="yenx">YENX</option>
        </select>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#555' }}>
          Amount:
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => { setAmount(e.target.value); setQrGenerated(false); }}
          placeholder="Enter amount"
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '16px',
            borderRadius: '8px',
            border: '1px solid #ddd',
            boxSizing: 'border-box'
          }}
        />
      </div>

      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#555' }}>
          Recipient Address:
        </label>
        <input
          type="text"
          value={recipientAddress}
          onChange={(e) => { setRecipientAddress(e.target.value); setQrGenerated(false); }}
          placeholder="0x7cB61D4117AE31a12E393a1Cfa3BaC666481D02E"
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '16px',
            borderRadius: '8px',
            border: '1px solid #ddd',
            boxSizing: 'border-box'
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        <button
          onClick={handleGenerate}
          disabled={!amount || !recipientAddress}
          style={{
            flex: 1,
            padding: '14px',
            fontSize: '16px',
            fontWeight: 'bold',
            color: 'white',
            backgroundColor: (!amount || !recipientAddress) ? '#ccc' : '#f321ec',
            border: 'none',
            borderRadius: '8px',
            cursor: (!amount || !recipientAddress) ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.3s'
          }}
        >
          Generate QR Code
        </button>
        {qrGenerated && (
          <button
            onClick={handleReset}
            style={{
              padding: '14px 20px',
              fontSize: '16px',
              fontWeight: 'bold',
              color: '#666',
              backgroundColor: '#f1f1f1',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Reset
          </button>
        )}
      </div>

      {qrGenerated && qrData && (
        <div style={{ textAlign: 'center' }}>
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            display: 'inline-block',
            borderRadius: '12px',
            border: '2px solid #f321ec'
          }}>
            <QRCode value={qrData} size={250} />
            {console.log('QR Data:', qrData)}  
          </div>
          <p style={{ marginTop: '16px', color: '#666', fontSize: '14px' }}>
            Scan with MetaMask Mobile
          </p>
          <p style={{ marginTop: '8px', color: '#888', fontSize: '12px' }}>
            Pay {amount} {tokens[selectedToken].name} to {recipientAddress.slice(0, 6)}...{recipientAddress.slice(-4)}
          </p>
        </div>
      )}
    </div>
  )
}

export default GenerateQRTab
