# Hello Eris Demo Application

## Setup

### Project
```
npm install
```
### Test Chain
```
eris chains start hello-chain --init-dir test/chain-config -p
```

### Contract Deployment
In Bash Shell:
```
cd contracts
account=$(jq -r '.["hello-chain_full_000"].address' ../test/chain-config/accounts.json)
eris pkgs do -c hello-chain -a $account
```
Note: If you do not have `jq` available on the commandline, you can also simply manually copy the account's address from `accounts.json` to use as parameter for the `eris pkgs` command.

### Application
- Run the test/hello-test.js mocha/chai test script to invoke some basic JS functions
- Use a REST client / browser with the following URLs:
 - POST http://localhost:3080/deals Body: `{"id": "234232", "buyer": "Mike", "seller": "Laura", "amount": 23984}`
 - GET http://localhost:3080/deals
 - GET http://localhost:3080/deal/234232

**NOTE**: the application currently does not support conversion of decimal input, so only full integer amounts can be stored.
