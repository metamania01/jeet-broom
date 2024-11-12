//@ts-nocheck
import { Connection, PublicKey, Keypair, VersionedTransaction, LAMPORTS_PER_SOL, Transaction, SystemProgram, sendAndConfirmTransaction, SendTransactionError } from '@solana/web3.js';
import fetch from 'cross-fetch';
import bs58 from 'bs58';
import JSBI from 'jsbi';

// Constants
const SOLANA_RPC_ENDPOINT = ; // Replace with your own RPC endpoint
const connection = new Connection(SOLANA_RPC_ENDPOINT);
const ENV = "mainnet-beta";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const TOKEN_LIST_URL = `https://token.jup.ag/strict`;
const NUMBER_OF_TIMES_TO_SUBMIT = 10;

// Wallet setup (replace with your own private key)
const SEEDING_PRIVATE_KEY = '' // Replace with a wallet that has SOL;
const SEEDING_WALLET = Keypair.fromSecretKey(bs58.decode(SEEDING_PRIVATE_KEY));
// List of your private keys
const WALLET_PRIVATE_KEY = [
  
]

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkTransactionStatus(signature) {
  // Connect to the Solana network (use 'mainnet-beta' for mainnet)

  try {
    // Get the transaction status
    const status = await connection.getSignatureStatus(signature, {
      searchTransactionHistory: true
    });

    if (status.value !== null) {
      // Check the confirmationStatus
      const confirmationStatus = status.value.confirmationStatus;

      console.log(`Transaction status: ${confirmationStatus}`);

      // 'finalized' means the transaction is confirmed
      if (confirmationStatus === 'finalized' || confirmationStatus === 'confirmed') {
        console.log("Transaction is confirmed!");
        return true;
      } else {
        console.log("Transaction is not yet finalized.");
        return false;
      }
    } else {
      console.log("Transaction not found. It may have been too long ago.");
      return false;
    }
  } catch (error) {
    console.error("Error checking transaction status:", error);
    return false;
  }
}

async function checkAndSendSol(publicKey, senderKeypair) {
  try {
    const pubKey = new PublicKey(publicKey);
    const balance = await connection.getBalance(pubKey);
    const solBalance = balance

    console.log(`Current balance for ${publicKey}: ${solBalance} SOL`);

    if (solBalance < 10000000) {
      const amountToSend = 10000000 - solBalance;
      await sendSol(publicKey, amountToSend, senderKeypair);
      console.log(`Sent ${amountToSend} SOL to ${publicKey}`);
    } else {
      console.log('Balance is sufficient, no transfer needed');
    }
  } catch (error) {
    console.error('Error in checkAndSendSol:', error);
  }
}

async function sendAllBalance(senderKeypair, destinationPubkey) {
  while (true) {
    try {
      const senderPubkey = senderKeypair.publicKey.toString();
      const balance = await connection.getBalance(senderKeypair.publicKey);
      const solBalance = balance;

      if (solBalance > 1000000) { // Leave a small amount for transaction fees
        const amountToSend = solBalance - 1000000;
        await sendSol(destinationPubkey, amountToSend, senderKeypair);
        console.log(`Sent all balance (${amountToSend} SOL) from ${senderPubkey} to ${destinationPubkey}`);
      }
      break;
    } catch (error) {
      console.error('Error in sendAllBalance:', error);
    }
  }
}

async function sendSol(recipientPubkey, amount, senderKeypair) {
  while (true) {
    try {
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: senderKeypair.publicKey,
          toPubkey: new PublicKey(recipientPubkey),
          lamports: amount
        })
      );

      let signature = ''
      for (let i = 0; i < NUMBER_OF_TIMES_TO_SUBMIT; i++) {
        signature = await connection.sendTransaction(
          transaction,
          [senderKeypair],
          { skipPreflight: true }
        );
      }

      console.log('Transaction sent:', signature);
      break;
    } catch (error) {
      console.error('Error in sendSol:', error);
    }
  }
}

// Placeholder function to get non-zero token balances
async function getNonZeroTokenBalances(connection, walletPublicKey) {
  try {
    // Fetch all token accounts owned by the wallet
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      walletPublicKey,
      { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
    );

    // Filter accounts with a non-zero balance and map to include mint and amount
    const nonZeroBalanceTokens = tokenAccounts.value
      .filter(({ account }) => {
        const amount = account.data.parsed.info.tokenAmount.amount;
        return amount > 0;
      })
      .map(({ account }) => ({
        mint: account.data.parsed.info.mint,
        amount: account.data.parsed.info.tokenAmount.amount
      }));

    return nonZeroBalanceTokens;
  } catch (error) {
    console.error('Error fetching non-zero balance tokens:', error);
    return [];
  }
}

async function getTokenList() {
  const response = await fetch(TOKEN_LIST_URL);
  return await response.json();
}

async function getRoutes(inputMint, outputMint, amount, slippageBps) {
  const response = await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`);
  return await response.json();
}

async function getSwapTransaction(routes, userPublicKey) {
  const response = await fetch('https://quote-api.jup.ag/v6/swap', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({

      quoteResponse: routes,
      userPublicKey: userPublicKey,
      wrapUnwrapSOL: true
    })
  });
  return await response.json();
}

async function swapTokenToSol(connection: Connection, wallet, inputTokenAddress, amount) {
  try {
    const tokens = await getTokenList();
    const inputToken = tokens.find(t => t.address === inputTokenAddress);

    if (!inputToken) {
      console.log(inputTokenAddress, 'not found in token list');
      return;
    }

    const inputAmount = JSBI.BigInt(amount);

    console.log(`Swapping ${amount} ${inputToken.symbol} to SOL`);

    const routes = await getRoutes(inputTokenAddress, SOL_MINT, inputAmount.toString(), 50);


    if (!routes) {
      throw new Error("No routes found for the swap");
    }

    let txid = ""
    let signature = ""
    while (true) {

      if ( txid != "" && checkTransactionStatus(txid)) {
        break
      }

      const { swapTransaction } = await getSwapTransaction(routes, wallet.publicKey.toString());
      const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
      var transaction = VersionedTransaction.deserialize(swapTransactionBuf);
      console.log(transaction);

      // Sign the transaction
      transaction.sign([wallet]);
      // Send the transaction
      // const rawTransaction = transaction.serialize();

      try {
        await checkAndSendSol(wallet.publicKey.toString(), SEEDING_WALLET);
        for (let i = 0; i < NUMBER_OF_TIMES_TO_SUBMIT; i++) {
          txid = await connection.sendTransaction(
            transaction,
            { skipPreflight: true }
          );
        }
        if (checkTransactionStatus(txid)) {
          console.log('Transaction confirmed successfully:', txid);
          break;
        }
      } catch (error) {
        console.error("Error during swap:", error);
        await sleep(10000);
      }
    }
  } catch (error) {
    console.log("sth is terribly wrong.");
    
  }
}

async function main() {

  for (let i = 0; i < WALLET_PRIVATE_KEY.length; i++) {
    let private_key = WALLET_PRIVATE_KEY[i]
    const USER_KEYPAIR = Keypair.fromSecretKey(bs58.decode(private_key));


    // Get non-zero token balances
    const tokenBalances = await getNonZeroTokenBalances(connection, USER_KEYPAIR.publicKey);

    for (const tokenAddress of tokenBalances) {
      // For demonstration, we're using a fixed amount. In a real scenario, you'd use the actual balance.
      await swapTokenToSol(connection, USER_KEYPAIR, tokenAddress.mint, tokenAddress.amount);
    }

    console.log('all tokens have been swapped to SOL for', USER_KEYPAIR.publicKey.toBase58(), 'wallet');

    await sleep(10000);
    // Send all remaining balance to the seeding wallet
    let solBalance = await connection.getBalance(USER_KEYPAIR.publicKey);
    if (solBalance > 0.01 ** LAMPORTS_PER_SOL) {
      await sendAllBalance(USER_KEYPAIR, SEEDING_WALLET.publicKey.toString());
    }

    console.log('all remaining balance has been sent to seeding wallet for', USER_KEYPAIR.publicKey.toBase58(), 'wallet');


  }
}

main().then(() => console.log("All swaps completed!")
).catch(error => {
  console.error(error);
  process.exit(1);
})