export const ORACLE_ABI = [
	{
		"inputs": [],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"inputs": [],
		"name": "EmptyTokenSymbol",
		"type": "error"
	},
	{
		"inputs": [],
		"name": "InvalidPrice",
		"type": "error"
	},
	{
		"inputs": [],
		"name": "NotAuthorized",
		"type": "error"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "baseToken",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "quoteToken",
				"type": "string"
			}
		],
		"name": "PriceNotFound",
		"type": "error"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "string",
				"name": "baseToken",
				"type": "string"
			},
			{
				"indexed": true,
				"internalType": "string",
				"name": "quoteToken",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "price",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "updatedAt",
				"type": "uint256"
			}
		],
		"name": "PriceUpdated",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "updater",
				"type": "address"
			},
			{
				"internalType": "bool",
				"name": "authorized",
				"type": "bool"
			}
		],
		"name": "setUpdater",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "newOwner",
				"type": "address"
			}
		],
		"name": "transferOwnership",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "baseToken",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "quoteToken",
				"type": "string"
			},
			{
				"internalType": "uint256",
				"name": "price",
				"type": "uint256"
			}
		],
		"name": "updatePrice",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string[]",
				"name": "baseTokens",
				"type": "string[]"
			},
			{
				"internalType": "string[]",
				"name": "quoteTokens",
				"type": "string[]"
			},
			{
				"internalType": "uint256[]",
				"name": "newPrices",
				"type": "uint256[]"
			}
		],
		"name": "updatePrices",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "updater",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "bool",
				"name": "authorized",
				"type": "bool"
			}
		],
		"name": "UpdaterChanged",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "baseToken",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "quoteToken",
				"type": "string"
			}
		],
		"name": "getPairLabel",
		"outputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "baseToken",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "quoteToken",
				"type": "string"
			}
		],
		"name": "getPrice",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "price",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "updatedAt",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "baseToken",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "quoteToken",
				"type": "string"
			}
		],
		"name": "hasPair",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"name": "isUpdater",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "owner",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
]