
var fs = require('fs');
var EventEmitter = require('events');
var util = require('util');
var async = require('async');

var logger = require(__libs+'/eris-logger');
var eris = require(__libs+'/eris-wrapper');

(function() {

    var log = logger.getLogger('eris.hello.chain');

    var events = {NEW_MESSAGE: "newMessage"};

    // Set up event emitter
    function ChainEventEmitter() {
        EventEmitter.call(this);
    }
    util.inherits(ChainEventEmitter, EventEmitter);
    var chainEvents = new ChainEventEmitter();

    // ##############
    // The following part depends on local files that are generated during contract deployment via EPM
    // ##############
    var epmData = require(__contracts+'/jobs_output.json');
    var messageFactoryAbi = JSON.parse(fs.readFileSync(__contracts+'/abi/DealManager'));
    var messageAbi = JSON.parse(fs.readFileSync(__contracts+'/abi/Deal'));

    // Instantiate connection
    var erisWrapper = new eris.NewWrapper( (__settings.eris.chain.host || 'localhost'), (__settings.eris.chain.port || '32770') );
    // Create contract objects
    var dealManager = erisWrapper.createContract(messageFactoryAbi, epmData['DealManager']);
    var dealContract = erisWrapper.createContract(messageAbi, epmData['Deal']);

    // Event Registration
    dealManager.NewDeal(
        function (error, eventSub) {
            if(error) { throw error; }
            //eventSubNew = eventSub; // ignoring this for now
        },
        function (error, event) {
            if(event) {
                chainEvents.emit(events.NEW_DEAL, event.args.contractAddress, eris.hex2str(event.args.id),
                    eris.hex2str(event.args.buyer), eris.hex2str(event.args.seller), event.args.amount);
            }
        });

    /**
     * The init function can be used to perform further configuration on contracts
     * @param callback
     */
    var init = function(callback) {
        // nothing to do here
        callback(null);
    }

    /**
     * Adds a single deal to the chain
     * @param deal
     * @param callback
     */
    var addDeal = function(deal, callback) {
        dealManager.addDeal(eris.str2hex(deal.id), eris.str2hex(deal.buyer),
                        eris.str2hex(deal.seller), deal.amount, function(error, result) {
            log.debug('Created new deal id: '+deal.id+'buyer:'+deal.buyer+', seller: '+deal.seller+', amount: '+deal.amount);
            callback(error);
        });
    };

    /**
     * Retrieves all registered deals from the DealManager contract.
     * This function is very expensive and might not perform well for large numbers of deals
     * @param callback
     */
    var getDeals = function(callback) {

        var idx = 0;
        var addresses = [];
        function collectDealAddresses () {
            dealManager.valueAtIndexHasNext(idx, function(error, result) {
                if (error) { throw error; }
                if(result[0] != 0) {
                    addresses.push(result[0]);
                }
                idx = result[1];
                // keep reading ...
                if(idx > 0) { collectDealAddresses(); }
                // ... or hand over to start collecting data
                else {
                    log.info('Found '+addresses.length+' deal addresses.');
                    createDealObjects(addresses)
                }
            });
        }
        collectDealAddresses();

        function createDealObjects(addresses) {
            var deals = [];
            async.each(addresses, function iterator(addr, callback) {
                log.debug('Retrieving deal data for address: ' + addr);
                dealContract.at(addr, function(error, contract) {
                    if (error) {
                        // ignoring error for now in order to continue with other contracts
                        log.error('Failure to access contract at address '+addr+': '+error);
                    }
                    else {
                        createDealFromContract(contract, function (err, deal) {
                            if (err) {
                                callback(err);
                            }
                            else {
                                deals.push(deal);
                                callback();
                            }
                        });
                    }
                });
            }, function(err) {
                if(err) {
                    log.error('Reading of deal data aborted due to unexpected error: '+err);
                }
                else {
                    callback(err, deals);
                }
            });
        }
    };

    /**
     * Returns a deal object to the callback initialized with the data from the contract at the given address
     * @param address
     * @param callback
     */
    var getDealAtAddress = function(address, callback) {
        dealContract.at(address, function(error, contract) {
            if (error) { throw error; }
            createDealFromContract(contract, callback);
        });
    }

    /**
     * Initializes a deal object from the given contract
     * @param contract
     * @param callback
     */
    function createDealFromContract(contract, callback) {
        var deal = {};
        async.parallel({
            id: function(callback){
                    contract.id( eris.convertibleCallback(callback, eris.hex2str) );
                },
            buyer: function(callback){
                contract.buyer( eris.convertibleCallback(callback, eris.hex2str) );
            },
            seller: function(callback){
                contract.seller( eris.convertibleCallback(callback, eris.hex2str) );
            },
            amount: function(callback){
                contract.amount( function(err, res) {
                    callback(err, res['c'][0]); // no fucking idea why it comes back in this structure!
                });
            }
        },
        function(err, results) {
            if(err) { callback(err, deal) }
            deal = results;
            deal.contractAddress = contract.address;
            callback(null, deal);
        });
    }

    module.exports = {
        'init': init,
        'events': events,
        'listen': chainEvents,
        'addDeal': addDeal,
        'getDeals': getDeals,
        'getDealAtAddress': getDealAtAddress
    }

}());