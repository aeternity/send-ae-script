const {
  AeSdkWallet,
  getHdWalletAccountFromSeed,
  MemoryAccount,
  Node,
  WALLET_TYPE,
  Tag,
  unpackTx,
} = require("@aeternity/aepp-sdk");
const WebSocketClient = require("websocket").client;

const SELECTED_NETWORK = process.argv[2];
const SENDER_SEED_PHRASE = process.argv[3];
const RECIPIENT_ADDRESS = process.argv[4];
let SENDER_ADDRESS = null;

const { mnemonicToSeed } = require("@aeternity/bip39");
const { Logger } = require("tslog");
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
    fs.mkdirSync(logsDir, 0777);
  }
  const logFile = `${logsDir}/${startTime}.txt`;
  fs.appendFileSync(
    logFile,
    JSONbigConfigured.stringify(logObj, null, 2) + "\n"
  );
});

const WS_URL = `wss://${SELECTED_NETWORK}.aeternity.io/mdw/websocket`;

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
    logger.info("========================");
    logger.info("onConnection ::", aeppId, params);
    logger.info("========================");
  },
  onDisconnect(msg, client) {
    logger.info("========================");
    logger.info("onDisconnect ::", msg, client);
    logger.info("========================");
  },
  onSubscription(aeppId) {
    logger.info("========================");
    logger.info("onSubscription ::", aeppId);
    logger.info("========================");
  },
  onSign(aeppId, params) {
    logger.info("========================");
    logger.info("onSign ::", aeppId, params);
    logger.info("========================");
  },
  onAskAccounts(aeppId) {
    logger.info("========================");
    logger.info("onAskAccounts ::", aeppId);
    logger.info("========================");
  },
  onMessageSign(aeppId, params) {
    logger.info("========================");
    logger.info("onMessageSign ::", aeppId, params);
    logger.info("========================");
  },
});

async function connectWallet() {
  const { publicKey, secretKey } = getHdWalletAccountFromSeed(
    mnemonicToSeed(SENDER_SEED_PHRASE),
    0
  );

  const account = new MemoryAccount({
    keypair: { publicKey: publicKey, secretKey },
  });
  await aeSdk.addAccount(account, { select: true });
  SENDER_ADDRESS = await account.address();
  logger.info("========================");
  logger.info("connected wallet ::", SENDER_ADDRESS);
  logger.info("========================");
}

async function checkAddressBalance(_address) {
  const balance = await aeSdk.getBalance(_address);
  logger.log(`Balance of ${_address}: ${balance} aettos`);
  return balance;
}

async function sendCoins() {
  const balance = await checkAddressBalance(SENDER_ADDRESS);
  logger.log("RECIPIENT_ADDRESS ::", RECIPIENT_ADDRESS);
  if (balance > 0) {
    const spendTx = await aeSdk.buildTx(Tag.SpendTx, {
      senderId: SENDER_ADDRESS,
      recipientId: RECIPIENT_ADDRESS,
      amount: balance,
    });

    const {
      tx: { fee },
    } = unpackTx(spendTx, Tag.SpendTx);

    const finalAmount = balance - fee;

    if (finalAmount > 0) {
      const tx = await aeSdk.spend(finalAmount, RECIPIENT_ADDRESS);
      logger.info("========================");
      logger.info("final sent amount ::", finalAmount);
      logger.info("Transaction mined ::", tx);
      logger.info("========================");
    } else {
      logger.info("========================");
      logger.info("no enough balance ::", finalAmount);
      logger.info("========================");
    }
  } else {
    logger.info("========================");
    logger.info("no balance ::", balance);
    logger.info("========================");
  }

  await checkAddressBalance(RECIPIENT_ADDRESS);
}

// listen for new block generation
async function listenForNewBlocGeneration() {
  const wsClient = new WebSocketClient();

  wsClient.on("connectFailed", function (error) {
    logger.log("Connect Error: " + error.toString());
  });

  wsClient.on("connect", function (connection) {
    logger.log("WebSocket Client Connected");
    connection.on("error", function (error) {
      logger.log("Connection Error: " + error.toString());
    });
    connection.on("close", function () {
      logger.log("echo-protocol Connection Closed");
    });
    connection.on("message", function (message) {
      if (message.type === "utf8") {
        logger.info("========================");
        logger.info("New KeyBlocks Send sendCoins() ::");
        logger.info("========================");

        sendCoins();
      }
    });

    connection.sendUTF('{"op":"Subscribe", "payload": "KeyBlocks"}');
  });

  wsClient.connect(WS_URL);
}
async function init() {
  await connectWallet();
  await listenForNewBlocGeneration();
}

init();
// keep script alive
(function keepProcessRunning() {
  setTimeout(keepProcessRunning, 1 << 30);
})();
