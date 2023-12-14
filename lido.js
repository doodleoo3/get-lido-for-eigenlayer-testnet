const { ethers } = require('ethers');
require('dotenv').config();

const privateKey = process.env.PRIVATE_KEY;
const alchemyKey = process.env.ALCHEMY_KEY;
const contractAddress = process.env.CONTRACT_ADDRESS.toLowerCase();
const ethToSend = process.env.ETH_TO_SEND;

const provider = new ethers.providers.WebSocketProvider(`wss://eth-goerli.g.alchemy.com/v2/${alchemyKey}`);
const signer = new ethers.Wallet(privateKey, provider);

let accountWithHigherGasInLastBlock = null

async function getAccountWithHigherGasInLastBlock() {
    try {
        const latestBlockNumber = await provider.getBlockNumber();
        const latestBlock = await provider.getBlockWithTransactions(latestBlockNumber);
        let maxGasSpendTx = { totalGasSpend: ethers.BigNumber.from(0) };
        for (const tx of latestBlock.transactions) {
            const totalGasSpend = tx.gasPrice.mul(tx.gasLimit);
            if (totalGasSpend.gt(maxGasSpendTx.totalGasSpend) && tx.from.toLowerCase() !== signer.address.toLowerCase()) {
                maxGasSpendTx = { ...tx, totalGasSpend };
            }
        }
        if (maxGasSpendTx.from) {
            accountWithHigherGasInLastBlock = maxGasSpendTx.from;
            console.log(`Higher gas in last block: ${maxGasSpendTx.gasPrice}`);
            console.log(`Target address updated to: ${accountWithHigherGasInLastBlock}`);
        }
    } catch (error) {
        console.error(`getAccountWithHigherGasInLastBlock error: ${error}`);
    }
}

async function sendTransaction(gasPrice) {
    const tx = {
        to: contractAddress,
        value: ethers.utils.parseEther(ethToSend),
        gasPrice: gasPrice,
        gasLimit: ethers.BigNumber.from('200000')
    };
    try {
        const txResponse = await signer.sendTransaction(tx);
        console.log(`The transaction has been sent: ${txResponse.hash}`);
    } catch (error) {
        console.error(`sendTransaction error: ${error}`);
    }
}

async function watchTransactions() {
    console.log('Watching all pending transactions...');
    provider.on('pending', async (txHash) => {
        setTimeout(async () => {
            try {
                let transaction = await provider.getTransaction(txHash);
                if (transaction && transaction.to && contractAddress === transaction.to.toLowerCase()) {
                    if (transaction.from === accountWithHigherGasInLastBlock) {
                        const increasedGasPrice = transaction.gasPrice.add(ethers.utils.parseUnits("200", "gwei"));
                        sendTransaction(increasedGasPrice)
                    }
                    // console.log({
                    //     address: transaction.from,
                    //     value: ethers.utils.formatEther(transaction.value),
                    //     gasPrice: transaction.gasPrice.toString(),
                    //     gas: transaction.gasLimit.toString(),
                    //     input: transaction.data,
                    //     timestamp: new Date()
                    // });
                }
            } catch (error) {
                console.error(`watchTransactions error: ${error}`);
            }
        }, 1000);
    });
}

provider.on('block', () => {
    getAccountWithHigherGasInLastBlock();
});

watchTransactions();