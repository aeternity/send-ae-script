## Send AE Balance on each new Block Generation


Installation

`` npm install ``

Run
for testnet

``npx forever -v -c ts-node ./index.ts testnet "seed phrase" "recipient_address"``

for mainnet

``npx forever -v -c ts-node ./index.ts mainnet "seed phrase" "recipient_address"``
