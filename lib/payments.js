var Promise     = require("bluebird");
var _           = require("lodash");
var knex        = require("knex");

var network    = require('./stellar-network');
var Signer      = require('./signer');
var Submitter   = require('./submitter');
var log         = require('./logger');
var errors      = require('./errors');

// The limit of new transactions we'll sign from the db
var TRANSACTION_SIGN_LIMIT = 1000;
// The limit of new transactions we'll submit to the network at one time.
var TRANSACTION_SUBMIT_LIMIT = 10;
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
*   @param {object} logger The logger implementation. A standard console.log will be used in leui if none specified.
*   @param {object} network The network implementation.
*   @param {object} database The database implementation.
*   @param {object} database The instantiated stellar payments database implementation.
*/
var Payments = function (config) {
    this.database   = config.database || Knex.initialize(config.db);
    if (!this.database) {
        throw new Error("Must provide a database implementation or configuration parameters");
    }
    if (config.network) {
        network = config.network;
    }
    this.signer     = new Signer(config, database, network);
    this.submitter  = new Submitter(config, database, network);

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
*/
Payments.prototype.processPayments = function () {
    var self = this;
    if (self.fatalError) {
        log.error("There's been a fatal error, aborting");
        return;
    }
    if (self.signingAndSubmitting) {
        // we're still processing the previous request
        return;
    }
    self.signingAndSubmitting = true;
    // check to make sure we've got an initialized sequence number
    return ensureSequenceNumber.bind(this)()
        .then(self.signTransactions.bind(self))
        .then(self.submitTransactions.bind(self))
        .catch(function (err) {
            // uncaugt exception, fatal error
            log.error(err, "Fatal error");
            self.fatalError = true;
        })
        .finally(function () {
            self.signingAndSubmitting = false;
        });
};

/**
* Will sign the latest unsigned transactions in the db (quanity limited to TRANSACTION_SIGN_LIMIT).
*/
Payments.prototype.signTransactions = function() {
    return this.signer.signTransactions.bind(this.signer)(TRANSACTION_SIGN_LIMIT);
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
    return network.getAccountInfo(this.stellarAddress)
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
    log.error(err, "got a resign error");
    var transaction = err.message;
    var self = this;
    return this.database.clearTransactionsFromId(transaction.id + 1)
        .then(getLatestSequenceNumberFromNetwork)
        .then(function (sequence) {
            self.signer.setSequenceNumber(sequence);
        });
}

module.exports = Payments;
