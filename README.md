## Send AE Balance on each new Block Generation


Installation

`` sudo npm install forever -g ``
`` npm install ``

Run
for testnet

`` forever start -v -a -l forever.log -o out.log -e err.log -c ./node_modules/.bin/ts-node ./index.ts testnet "seed phrase" "recipient_address"``

for mainnet

`` forever start -v -a -l forever.log -o out.log -e err.log -c ./node_modules/.bin/ts-node ./index.ts mainnet "seed phrase" "recipient_address"``
