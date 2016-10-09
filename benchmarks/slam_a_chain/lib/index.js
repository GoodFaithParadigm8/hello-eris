'use strict'

const childProcess = require('mz/child_process')
const ErisDb = require('eris-db')
const erisContracts = require('eris-contracts')
const F = require('fairmont')
const fs = require('mz/fs')
const humanizeDuration = require('humanize-duration')
const I = require('./iterators')
const numeral = require('numeral')
const Promise = require('bluebird')
const R = require('ramda')
const slam = require('./slam')
const Solidity = require('solc')
const untildify = require('untildify')
const url = require('url')

const exec = R.composeP(R.trim, R.head, childProcess.exec)

const privateValidator = () =>
  fs.readFile(untildify(`~/.eris/chains/${blockchainName}/priv_validator.json`))
    .then(JSON.parse)

const blockchainUrl = () => {
  const blockchainAddress = () =>
    exec(`
      eris chains ports ${blockchainName} 46657
    `)

  return Promise.all([blockchainAddress()])
    .spread((address) => ({
      protocol: 'http:',
      slashes: true,
      address,
      pathname: '/rpc'
    })
  )
}

const blockchainIsAvailable = (erisDb) =>
  I.poll(
    () => Promise.fromCallback(
      (callback) => erisDb.blockchain().getChainId(callback)
    ),
    I.intervalAsyncIterator(100)
  ).then(F.wrap(erisDb))

const newBlockchain = (name) =>
  exec(`
    eris chains start --publish ${blockchainName} --init-dir ${blockchainName}
  `, {env: R.assoc('ERIS_PULL_APPROVE', true, process.env)}).then(() =>
    blockchainUrl().then((blockchainUrl) =>
      blockchainIsAvailable(ErisDb.createInstance(url.format(blockchainUrl)))
    )
  )

const blockchainName = 'slams'

const source = `
  contract SimpleStorage {
      uint storedData;

      function set(uint x) {
          storedData = x;
      }

      function get() constant returns (uint retVal) {
          return storedData;
      }
  }
`

const compile = source =>
  Solidity.compile(source, 1).contracts

const metric = (command, transactions, milliseconds) =>
  `${Math.round(transactions / (milliseconds / 1000))} ${command}s per second`

Promise.all([newBlockchain(), privateValidator()])
  .spread((erisDb, validator) => {
    console.log(`edb: ${JSON.stringify(erisDb)}`)
    const contractManager = erisContracts.newContractManagerDev(
      erisDb._client._URL, {
        address: validator.address,
        pubKey: validator.pub_key,
        privKey: validator.priv_key
      }
    )

    const compiled = compile(source).SimpleStorage
    const abi = JSON.parse(compiled.interface)
    const bytecode = compiled.bytecode
    const contractFactory = contractManager.newContractFactory(abi)

    Promise.fromCallback((callback) =>
      contractFactory.new({data: bytecode}, callback)
    ).then((contract) => {
      const privateKey = validator.priv_key[1]
      const destination = '0000000000000000000000000000000000000010'
      const amount = 1
      const count = 100000

      const send = () =>
        Promise.fromCallback((callback) =>
          erisDb.txs().send(privateKey, destination, amount, null, callback)
        )

      const set = () =>
        Promise.fromCallback((callback) =>
          contract.set(42, callback)
        )

      const runSlam = (command, step, description) => {
        console.log(`\nRepeating ${numeral(count).format('0,0')} times:\n${description}`)
        const start = Date.now()

        const progress = F.curry((total, value) => {
          const metricString = value > 0
            ? ` (${metric(command, value, Date.now() - start)})`
            : ``

          return `${Math.floor(100 * value / total)}%${metricString}\n`
        })

        const pipeline = F.pipe(
          slam(count),
          F.map(progress(count))
        )

        const status = I.iteratorToStream(pipeline(step))
        status.pipe(process.stdout)

        return I.streamToPromise(status).then(() => {
          const duration = Date.now() - start

          console.log(`duration: ${humanizeDuration(duration)} ` +
            `(${metric(command, count, duration)})`)
        })
      }

      return runSlam('send', send, `Send ${amount} ether
from ${validator.address}
to ${destination}.`)
        .then(() => {
          return runSlam('set', set, 'Set a value in a contract.')
        })
    })
  })
