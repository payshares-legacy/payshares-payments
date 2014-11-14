var Promise     = require("bluebird");
var _           = require("lodash");
var Knex        = require("knex");

var network     = require('./stellar-network');
var Signer      = require('./signer');
var Submitter   = require('./submitter');
var log         = require('./logger');
var errors      = require('./errors');
var sqlDb       = require('./sql-database');

// The limit of new transactions we'll sign from the db
var DEFAULT_MAX_TRANSACTIONS = 10;
// polling for new transactions to sign. in ms
var POLL_INTERVAL = 1000;
// true if we're in the middle of checking confirming/submitting
var checkingTransactions = false;

/**
* Constructs a new Payments object.
* @param {object} config Configuration variables
*   @param {int}    maxTransactionsInFlight limits amount of txns we'll sign each iteration (maxTransactionsInFlight only sign (max - (signed submitted unconfirmed txns)))
*   @param {string} stellarAddress The stellar account used for payouts.
*   @param {string} stellarSecretKey The secret key for the stellar account.
*   @param {object} db The database configuration (required if database is not provided)
*       @param {string} client The type of client adapter. Knex supports (Postgres, MySQL, MariaDB and SQLite3)
*       @param {object} connection Connection configuration params
*           @param {string} host
*           @param {string} password
*           @param {string} user
*           @param {string} database
*   @param {object} logger (OPTIONAL) The logger implementation. A standard console.log will be used in leui if none specified.
*   @param {object} network (OPTIONAL) The network implementation.
*   @param {object} database (OPTIONAL) The instantiated stellar payments database implementation.
*/
var Payments = function (config) {
    this.database   = config.database || new sqlDb(config);
    this.network    = config.network || new network(config);
    if (!this.database) {
        throw new Error("Must provide a database implementation or configuration parameters");
    }
    if (!this.network) {
        throw new Error("Must provide a network implementation or configuration parameters");
    }
    this.signer     = new Signer(config, this.database, this.network);
    this.submitter  = new Submitter(config, this.database, this.network);

    this.stellarAddress = config.stellarAddress;
    // If true, should stop all processing
    this.fatalError = false;

    if (config.logger) {
        log = config.logger;
    }
};

/**
* Process payments will:
* 1) Sign new transactions.
* 2) Submit unconfirmed transactions.
*
* @param {int} max_transactions The max transactions "in flight", we only will sign
*               (max - (signed submitted unconfirmed txns)). Default 10
*/
Payments.prototype.processPayments = function (max_transactions) {
    if (!max_transactions) {
        max_transactions = DEFAULT_MAX_TRANSACTIONS;
    }
    var self = this;
    if (self.fatalError) {
        log.error("There's been a fatal error, aborting");
        return;
    }
    if (self.signingAndSubmitting) {
        // we're still processing the previous request
        return Promise.resolve();
    }
    self.signingAndSubmitting = true;
    // check to make sure we've got an initialized sequence number
    return ensureSequenceNumber.bind(this)()
        .then(function () {
            return self.database.getSubmittedUnconfirmedTransactions()
                .then(function (result) {
                    console.log("subunconf: " + result.length);
                    console.log("max: " + Number(max_transactions - result.length));
                    return max_transactions - result.length;
                })
        })
        .then(self.signTransactions.bind(self))
        .then(self.submitTransactions.bind(self))
        .catch(function (err) {
            // uncaugt exception, fatal error
            log.error("Fatal error", err);
            self.fatalError = true;
        })
        .finally(function () {
            self.signingAndSubmitting = false;
        });
};

/**
* Will sign the latest unsigned transactions in the db.
* @param {int} limit The limit of transactions to sign
*/
Payments.prototype.signTransactions = function(limit) {
    return this.signer.signTransactions.bind(this.signer)(limit);
};

/**
* Will submit any signed and unconfirmed transactions to the network.
*/
Payments.prototype.submitTransactions = function () {
    var self = this;
    return this.submitter.submitTransactions()
        .catch(Submitter.errors.ResignTransactionError, handleResignError.bind(self));
};

// Ensure's we're initialized with the latest sequence number, either from the last signed txn in the db or the network
function ensureSequenceNumber() {
    var self = this;
    return Promise.resolve(self.signer.getSequenceNumber())
        .then(function (sequence) {
            if (!sequence) {
                return self.initSequenceNumber();
            }
        });
}

/**
* Initializes the local sequence number with the last sequence number we used to sign a transaction, by
* querying the database for the transaction with the highest seuqence number. If there's no transactions,
* we'll query the network for the last sequence number applied to the account. We'll locally keep track
* of and increment the sequence number as we sign new transactions.
*/
Payments.prototype.initSequenceNumber = function() {
    var self = this;
    return this.database.getHighestSequenceNumberFromTransactions()
        .then(function (sequence) {
            if (!sequence) {
                // this will be the "current" sequence number, so no need to increment
                return getLatestSequenceNumberFromNetwork.bind(self)();
            } else {
                // this is the seq from the last transaction we've signed, so need to increment
                return sequence + 1;
            }
        })
        .then(function (sequence) {
            self.signer.setSequenceNumber(sequence);
        });
};

function getLatestSequenceNumberFromNetwork() {
    return this.network.getAccountInfo(this.stellarAddress)
        .then(function (result) {
            var sequence = result.result.account_data.Sequence;
            return sequence;
        });
}

/**
* If we get a resign error from the signer, any previously signed transaction with a sequence number greater than the
* errored transaction is now out of sequence and should be resigned. Here, we'll clear the txblobs/txhashes of those
* transactions and reset the seq number so they will be signed with the correct sequence number after the next call
* to processPayments.
*/
function handleResignError(err) {
    var transaction = err.message;
    var self = this;
    return this.database.clearTransactionsFromId(transaction.id + 1)
        .then(getLatestSequenceNumberFromNetwork.bind(self))
        .then(function (sequence) {
            self.signer.setSequenceNumber(transaction.sequence);
        });
}

module.exports = Payments;
