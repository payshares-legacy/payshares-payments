var _       = require("lodash");
var Promise = require("bluebird");
var Knex    = require("knex");

/**
* Constructs a mysql db implementation of the stellar payments interface.
* @param {object} config The mysql configuration parameters
*   @param {object} config.db The connection parameters
*   @param {string} config.db.client The type of client adapter. Knex supports (Postgres, MySQL, MariaDB and SQLite3)
*   @param {object} config.db.connection Connection configuration params
*   @param {string} config.db.connection.host
*   @param {string} config.db.connection.password
*   @param {string} config.db.connection.user
*   @param {string} config.db.connection.database
*   @param {object} [config.connection] The connection object
*   @param {object} [config.logger] The logger instance to use
*/
function database (config) {
    this.db = config.connection || Knex.initialize(config.db);

    this.log = config.logger || require("./logger");
    var self = this;
    this.db.on("query", function (query) {
        self.log.info({
            type: "query",
            sql: query.sql
        });
    });
}

//knex doesn't return bluebird promises, so we normalize db results so we are always using
//bluebird promises
var toBluebird = Promise.resolve;

/**
* Return transactions that have not been signed yet.
* @param {integer} limit The max amount of transactions to be returned.
*/
database.prototype.getUnsignedTransactions = function (limit) {
    var dbPromise = this.db('Transactions')
        .where({txblob: null, submittedAt: null, abortedAt: null, error: null})
        .limit(limit)
        .select();
    return toBluebird(dbPromise);
};

/**
* Marks the given transaction as errored with the given error message.
*/
database.prototype.markTransactionError = function (transaction, error) {
    var dbPromise = this.db('Transactions')
        .where({id: transaction.id})
        .update({error: error});
    return toBluebird(dbPromise);
};

/**
 * Insert a new payment transaction.
 * @param {string} address The address to send to.
 * @param {int} amount The quantity of STR to send in Stroops.
 * @param {string} memo An optional memo to attach to the transaction.
 */
database.prototype.insertNewTransaction = function (address, amount, memo) {
    var params = {
        address: address,
        memo: memo
    };
    if (typeof(amount) === "object") {
        _.extend(params, {
            amount: amount.value,
            currency: amount.currency,
            issuer: amount.issuer
        });
    } else {
        _.extend(params, {
            amount: amount
        });
    }
    var dbPromise = this.db('Transactions').insert(params);
    return toBluebird(dbPromise);
};

/**
* Update a transaction with the signed txblob, txhash, and sequene number.
* Sets the signedAt timestamp.
*/
database.prototype.storeSignedTransaction = function (transaction) {
    var params = {
        txblob: transaction.txblob,
        txhash: transaction.txhash,
        sequence: transaction.sequence,
        signedAt: new Date()
    };
    var dbPromise = this.db('Transactions')
        .where({id: transaction.id})
        .update(params);
    return toBluebird(dbPromise);
};

/**
* Returns submitted transactions that have not been confirmed yet.
*/
database.prototype.getSubmittedUnconfirmedTransactions = function () {
    var dbPromise = this.db('Transactions')
        .whereNotNull('txblob')
        .whereNotNull('submittedAt')
        .whereNull('confirmedAt')
        .whereNull('abortedAt')
        .whereNull('error')
        .orderBy('sequence')
        .select();
    return toBluebird(dbPromise);
};

/**
* Returns signed transactions that have not been confirmed yet.
*/
database.prototype.getSignedUnconfirmedTransactions = function () {
    var dbPromise = this.db('Transactions')
        .whereNotNull('txblob')
        .whereNull('confirmedAt')
        .whereNull('abortedAt')
        .whereNull('error')
        .orderBy('sequence')
        .select();
    return toBluebird(dbPromise);
};

/**
* Returns all of the unsubmitted transactions.
*/
database.prototype.getUnsubmittedTransactions = function (limit) {
    var dbPromise = this.db('Transactions')
        .whereNotNull('txblob')
        .whereNull('submittedAt')
        .whereNull('abortedAt')
        .whereNull('error')
        .orderBy('sequence')
        .limit(limit)
        .select();
    return toBluebird(dbPromise);
};

/**
* Sets the submittedAt timestamp for the record with the given id.
*/
database.prototype.markTransactionSubmitted = function (transaction) {
    var dbPromise = this.db('Transactions')
        .where({id: transaction.id})
        .update({submittedAt: new Date()});
    return toBluebird(dbPromise);
};

/**
* Sets the confirmedAt timestamp for the record with the given id.
*/
database.prototype.markTransactionConfirmed = function (transaction) {
    var dbPromise = this.db('Transactions')
        .where({id: transaction.id})
        .update({confirmedAt: new Date()});
    return toBluebird(dbPromise);
};

/**
* Returns the highest sequence number that we've signed a tranaction with.
*/
database.prototype.getHighestSequenceNumberFromTransactions = function () {
    var dbPromise = this.db('Transactions')
        .orderBy('sequence', 'desc')
        .limit(1)
        .whereNotNull("sequence")
        .select()
        .then(_.first)
        .then(function (result) {
            return result && result.sequence;
        });
    return toBluebird(dbPromise);
};

/**
* Clears the txblob, txhash, sequence, and signedAt timestamp from the transaction.
* We do this when a signed transaction is not included in a ledger for some reason, so its sequence
* number is not used, meaning all other transactions that were signed with a sequence number after it
* need to be resigned with different sequence numbers.
*/
database.prototype.clearSignedTransactionsFromId = function (id) {
    var dbPromise = this.db('Transactions')
        .where('id', '>=', id)
        .update({txblob: null, txhash: null, sequence: null, signedAt: null});
    return toBluebird(dbPromise);
};

/**
* Checks if a given transaction ID has abortedAt set.
*/
database.prototype.isAborted = function (transaction) {
    var dbPromise = this.db("Transactions")
        .where({id: transaction.id})
        .select()
        .then(_.first)
        .then(function (result) {
            return result && result.abortedAt;
        });
    return toBluebird(dbPromise);
};

module.exports = database;