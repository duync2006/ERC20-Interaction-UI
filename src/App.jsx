import { useState } from 'react'
import './App.css'
import StablecoinTab from './components/StablecoinTab'
import SwapTab from './components/SwapTab'
import GenerateQRTab from './components/GenerateQRTab'
import StakingTab from './components/StakingTab'
import OrderBookTab from './components/OrderBookTab'

function App() {
  const [activeTab, setActiveTab] = useState('stablecoin')

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

        <button
          onClick={() => setActiveTab('generateQR')}
          className={`tab-button ${activeTab === 'generateQR' ? 'active' : ''}`}
          style={{
            padding: '10px 30px',
            fontSize: '16px',
            cursor: 'pointer',
            backgroundColor: activeTab === 'generateQR' ? '#f321ec' : '#f1f1f1',
            color: activeTab === 'generateQR' ? 'white' : 'black',
            border: 'none',
            borderRadius: '5px',
            fontWeight: activeTab === 'generateQR' ? 'bold' : 'normal'
          }}
        >
          Generate QR
        </button>

        <button
          onClick={() => setActiveTab('staking')}
          className={`tab-button ${activeTab === 'staking' ? 'active' : ''}`}
          style={{
            padding: '10px 30px',
            fontSize: '16px',
            cursor: 'pointer',
            backgroundColor: activeTab === 'staking' ? '#ff9800' : '#f1f1f1',
            color: activeTab === 'staking' ? 'white' : 'black',
            border: 'none',
            borderRadius: '5px',
            fontWeight: activeTab === 'staking' ? 'bold' : 'normal'
          }}
        >
          Staking
        </button>

        <button
          onClick={() => setActiveTab('orderbook')}
          className={`tab-button ${activeTab === 'orderbook' ? 'active' : ''}`}
          style={{
            padding: '10px 30px',
            fontSize: '16px',
            cursor: 'pointer',
            backgroundColor: activeTab === 'orderbook' ? '#9c27b0' : '#f1f1f1',
            color: activeTab === 'orderbook' ? 'white' : 'black',
            border: 'none',
            borderRadius: '5px',
            fontWeight: activeTab === 'orderbook' ? 'bold' : 'normal'
          }}
        >
          Order Book
        </button>

      </div>

      {/* Tab Content */}
      {activeTab === 'stablecoin' && <StablecoinTab />}
      {activeTab === 'swap' && <SwapTab />}
      {activeTab === 'generateQR' && <GenerateQRTab />}
      {activeTab === 'staking' && <StakingTab />}
      {activeTab === 'orderbook' && <OrderBookTab />}
    </div>
  )
}

export default App
