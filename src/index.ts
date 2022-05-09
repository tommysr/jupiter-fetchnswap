import { Connection, PublicKey, Keypair, AccountInfo } from '@solana/web3.js'
import { Jupiter, RouteInfo } from '@jup-ag/core'
import bs58 from 'bs58'
import { AccountLayout, Token, TOKEN_PROGRAM_ID, u64 } from '@solana/spl-token'
import NodeWallet from '@project-serum/anchor/dist/cjs/nodewallet'

type AddressWithMint = {
  address: PublicKey
  mint: PublicKey
}

const INPUT_TOKEN = [
  new PublicKey('4dmKkXNHdgYsXqBHCuMikNQWwVomZURhYvkkX5c4pQ7y'),
  new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')]
const OUTPUT_TOKEN = new PublicKey('83LGLCm7QKpYZbX8q4W2kYWbtt8NJBwbVwEepzkVnJ9y')

const NETWORK = "https://solana-api.projectserum.com"
const connection = new Connection(NETWORK, "singleGossip")
const privateKey = process.env.PRIV_KEY || ''
const decodedPrivateKey = bs58.decode(privateKey)
const userKeypair = Keypair.fromSecretKey(decodedPrivateKey)

const wallet = new NodeWallet(userKeypair)

const executeSwap = async (jup: Jupiter, bestRoute: RouteInfo, amount: number) => {
  const { execute } = await jup.exchange({
    routeInfo: bestRoute
  })

  const txResult: any = await execute()

  if (txResult.error) {
    console.log(txResult.error)
  } else {
    console.log(`swapped ${amount} of token units`)
    console.log(`https://explorer.solana.com/tx/${txResult.txid}`)
  }
}

const getBestRoute = async (jup: Jupiter, amount: number, mint: PublicKey) => {
  const routes = await jup.computeRoutes({
    inputMint: mint,
    outputMint: OUTPUT_TOKEN,
    inputAmount: amount,
    slippage: 1
  })

  if (routes.routesInfos.length === 0)
    return null

  return routes.routesInfos[0]
}

const subscibeToAccount = async (pubkey: PublicKey, fn: (amount: u64) => void) => {
  const data = await connection.getAccountInfo(pubkey)

  if (!data) throw new Error('Account doesnt exist')

  connection.onAccountChange(pubkey, (accountInfo) => {
    const decoded = AccountLayout.decode(accountInfo.data)
    const amount = u64.fromBuffer(decoded.amount)

    fn(amount)
  })
}

const checkAndSwap = async (jup: Jupiter, amount: u64, mint: PublicKey) => {
  if (amount.eqn(0)) {
    console.log('zero amount')
    return
  }

  const route = await getBestRoute(jup, amount.toNumber(), mint)

  if (route)
    await executeSwap(jup, route, amount.toNumber())
  else
    console.log(`no routes found, skipped.`)
}



const main = async () => {
  console.log(`Connected wallet ${wallet.publicKey.toString()}`)
  console.log(`Mint of token ${INPUT_TOKEN.toString()}`)
  console.log(`checking if account on token exists or creating new one...`)

  const accountsFetched: AddressWithMint[] = []


  for (let el of INPUT_TOKEN) {
    const tokenToSwap = new Token(connection, el, TOKEN_PROGRAM_ID, wallet.payer)
    const account = await tokenToSwap.getOrCreateAssociatedAccountInfo(wallet.publicKey)
    console.log(`address of an acccount: ${account.address.toString()}`)

    accountsFetched.push({ address: account.address, mint: account.mint })
  }

  if (!accountsFetched.length)
    throw new Error('accounts on token fetching/creation failed')



  const jupiter = await Jupiter.load({
    connection,
    cluster: 'mainnet-beta',
    user: userKeypair
  })

  for (let el of accountsFetched)
    await subscibeToAccount(el.address, (amount: u64) => checkAndSwap(jupiter, amount, el.mint))
}

main()