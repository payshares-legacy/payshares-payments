var Promise     = require("bluebird");
var _           = require("lodash");
var Knex        = require("knex");

var Network     = require('./stellar-network');
var Signer      = require('./signer');
var Submitter   = require('./submitter');
var errors      = require('./errors');
var SqlDb       = require('./sql-database');

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
* @param {string} config.stellarAddress The stellar account used for payouts.
* @param {string} config.stellarSecretKey The secret key for the stellar account.
* @param {object} config.db The database configuration (required if database is not provided)
* @param {string} config.db.client The type of client adapter. Knex supports (Postgres, MySQL, MariaDB and SQLite3)
* @param {object} config.db.connection Connection configuration params
* @param {string} config.db.connection.host
* @param {string} config.db.connection.password
* @param {string} config.db.connection.user
* @param {string} config.db.connection.database
* @param {object} [config.logger] The logger implementation. A standard console.log will be used in leui if none specified.
* @param {object} [config.network] The network implementation.
* @param {object} [config.database] The instantiated stellar payments database implementation.
*/
var Payments = function (config) {
    this.database   = config.database || new SqlDb(config);
    this.network    = config.network || new Network(config);
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

    this.log = config.logger || require("./logger");
};

/**
* Process payments will:
* 1) Sign new transactions.
* 2) Submit unconfirmed transactions.
*/
Payments.prototype.processPayments = function () {
    var self = this;
    if (self.fatalError) {
        this.log.error("There's been a fatal error, aborting");
        return;
    }
    if (self.signingAndSubmitting) {
        // we're still processing the previous request
        return;
    }
    self.signingAndSubmitting = true;
    // check to make sure we've got an initialized sequence number
    return Promise.bind(this)
        .then(this._ensureSequenceNumber)
        .then(this.signTransactions)
        .then(this.submitTransactions)
        .catch(function (err) {
            // uncaugt exception, fatal error
            this.log.error("Fatal error", err);
            this.fatalError = true;
        })
        .finally(function () {
            this.signingAndSubmitting = false;
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
    return Promise.bind(this)
        .then(function () {
            return this.submitter.submitTransactions();
        })
        .catch(Submitter.errors.ResignTransactionError, this._handleResignError);
};

/**
* Initializes the local sequence number with the last sequence number we used to sign a transaction, by
* querying the database for the transaction with the highest seuqence number. If there's no transactions,
* we'll query the network for the last sequence number applied to the account. We'll locally keep track
* of and increment the sequence number as we sign new transactions.
*/
Payments.prototype.initSequenceNumber = function() {
    var self = this;
    return Promise.bind(this)
        .then(function () {
            return this.database.getHighestSequenceNumberFromTransactions()
        })
        .then(function (sequence) {
            if (!sequence) {
                // this will be the "current" sequence number, so no need to increment
                return self._getLatestSequenceNumberFromNetwork();
            } else {
                // this is the seq from the last transaction we've signed, so need to increment
                return sequence + 1;
            }
        })
        .then(function (sequence) {
            self.signer.setSequenceNumber(sequence);
        });
};

// Ensure's we're initialized with the latest sequence number, either from the last signed txn in the db or the network
Payments.prototype._ensureSequenceNumber = function () {
    var self = this;
    return Promise.resolve(self.signer.getSequenceNumber())
        .then(function (sequence) {
            if (!sequence) {
                return self.initSequenceNumber();
            }
        });
}

Payments.prototype._getLatestSequenceNumberFromNetwork = function() {
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
Payments.prototype._handleResignError = function (err) {
    var transaction = err.message;
    var self = this;
    return Promise.bind(this)
        .then(function () {
            this.database.clearSignedTransactionsFromId(transaction.id + 1)
        })
        .then(this._getLatestSequenceNumberFromNetwork)
        .then(function (sequence) {
            this.signer.setSequenceNumber(transaction.sequence);
        });
}

module.exports = Payments;
