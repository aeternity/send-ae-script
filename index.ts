import * as sdk from "@aeternity/aepp-sdk";
const {
  AeSdkWallet,
  getHdWalletAccountFromSeed,
  MemoryAccount,
  Node,
  WALLET_TYPE,
  Tag,
  unpackTx,
  AeSdk,
} = sdk;
// const WebSocketClient = require("websocket").client;
import { client as WebSocketClient } from "websocket";
import { z } from "zod";
import { Logger } from "tslog";

export const AccountPubKey = z.custom<`ak_${string}`>(
  (v) => typeof v === "string" && v.startsWith("ak_")
);
export type AccountPubKey = z.infer<typeof AccountPubKey>;

const SELECTED_NETWORK = process.argv[2];
const SENDER_SEED_PHRASE = process.argv[3];
const RECIPIENT_ADDRESS = AccountPubKey.parse(process.argv[4]);

const bip39 = require("bip39");
const fs = require("fs");
const JSONbig = require("json-bigint");

const JSONbigConfigured = JSONbig({
  useNativeBigInt: true,
  storeAsString: false,
  alwaysParseAsBig: true,
});
const startTime = new Date().toISOString();

const logger = new Logger();
logger.attachTransport((logObj) => {
  const logsDir = "ae-sender-logs";
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, "0777");
  }
  const logFile = `${logsDir}/${startTime.slice(0, 10)}.txt`;
  fs.appendFileSync(
    logFile,
    JSONbigConfigured.stringify(logObj, null, 2) + "\n"
  );
});

const WS_URL = `wss://${SELECTED_NETWORK}.aeternity.io/mdw/websocket`;

function accountFromMnemonic(mnemonic: string) {
  const secret = bip39.mnemonicToSeedSync(mnemonic);
  const acc = getHdWalletAccountFromSeed(secret, 0);
  return {
    mnemonic,
    privKey: acc.secretKey,
    addr: AccountPubKey.parse(acc.publicKey),
  };
}

function makeSdk() {
  const aeSdk = new AeSdkWallet({
    compilerUrl: "https://compiler.aepps.com",
    nodes: [
      {
        name: SELECTED_NETWORK,
        instance: new Node(`https://${SELECTED_NETWORK}.aeternity.io`),
      },
    ],
    id: "node",
    type: WALLET_TYPE.extension,
    name: "Wallet Node",
    // Hook for sdk registration
    onConnection(aeppId, params) {
      logger.info("onConnection ::", aeppId, params);
    },
    onDisconnect(msg, client) {
      logger.info("onDisconnect ::", msg, client);
    },
    onSubscription(aeppId) {
      logger.info("onSubscription ::", aeppId);
    },
    async onSign(aeppId, params) {
      logger.info("onSign ::", aeppId, params);
      return params;
    },
    onAskAccounts(aeppId) {
      logger.info("onAskAccounts ::", aeppId);
    },
    async onMessageSign(aeppId, params) {
      logger.info("onMessageSign ::", aeppId, params);
    },
  });
  return aeSdk;
}

async function connectWallet(aeSdk: sdk.AeSdk): Promise<`ak_${string}`> {
  const acc = accountFromMnemonic(SENDER_SEED_PHRASE);
  const account = new MemoryAccount({
    keypair: { publicKey: acc.addr, secretKey: acc.privKey },
  });
  await aeSdk.addAccount(account, { select: true });
  const senderAddr = await account.address();
  // logger.info("connected wallet ::", senderAddr);
  return senderAddr;
}

async function checkAccState(aeSdk: sdk.AeSdk, address: AccountPubKey) {
  const pending = await aeSdk.api.getPendingAccountTransactionsByPubkey(
    address
  );
  const balance = await aeSdk.getBalance(address);
  return { balance, pending };
}

async function sendCoins(aeSdk: sdk.AeSdk, sender: AccountPubKey, receiver: AccountPubKey) {
  const state = await checkAccState(aeSdk, sender);
  const balance = BigInt(state.balance);
  if (balance === 0n) {
    return;
  }
  if (state.pending.transactions.length > 0) {
    logger.info("Pending transactions, waiting for them to finish");
    logger.info("pending", state.pending);
    const nonces = state.pending.transactions.map((t) => t.tx.nonce);
    logger.info("pending nonces", nonces);
    return;
  }
  logger.info("RECIPIENT_ADDRESS ::", RECIPIENT_ADDRESS);
  logger.info("sender", sender, "receiver", receiver, "amount", balance);
  const spendTx = await aeSdk.buildTx(Tag.SpendTx, {
    senderId: sender,
    recipientId: receiver,
    amount: balance.toString(),
  });

  const unpackedTx = unpackTx(spendTx, Tag.SpendTx);
  const fee = BigInt(unpackedTx.tx.fee.toString());
  const finalAmount = balance - fee;

  if (finalAmount > 0) {
    const tx = await aeSdk.spend(finalAmount.toString(), RECIPIENT_ADDRESS);
    logger.info("final sent amount ::", finalAmount);
    logger.info("Transaction mined ::", tx);
  } else {
    logger.info("no enough balance ::", finalAmount);
  }
  logger.info("Success!");
}

async function init() {
  while (true) {
    const sdk = makeSdk();
    const senderAddr = await connectWallet(sdk);
    const res = await sendCoins(sdk, senderAddr, RECIPIENT_ADDRESS);
  }
}

init();
// keep script alive
(function keepProcessRunning() {
  setTimeout(keepProcessRunning, 1 << 30);
})();
