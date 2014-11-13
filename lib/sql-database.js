var _       = require("lodash");
var Promise = require("bluebird");
var Knex    = require("knex");

var log  = require("./logger");

/**
* Constructs a mysql db implementation of the stellar payments interface.
* @param {object} config The mysql configuration parameters
*   @param {object} db The connection parameters
*       @param {string} client The type of client adapter. Knex supports (Postgres, MySQL, MariaDB and SQLite3)
*       @param {object} connection Connection configuration params
*           @param {string} host
*           @param {string} password
*           @param {string} user
*           @param {string} database
*   @param {object} connection The connection object (OPTIONAL)
*   @param {object} logger The logger instance to use OPTIONAL
*/
function database (config) {
    this.db = config.connection || Knex.initialize(config.db);
    this.db.on("query", function (query) {
        log.info({
            type: "query",
            sql: query.sql
        });
    })
    if (config.logger) {
        log = config.logger;
    }
}

/**
* Return transactions that have not been signed yet.
* @param {integer} limit The max amount of transactions to be returned.
*/
database.prototype.getUnsignedTransactions = function (limit) {
    var dbPromise = this.db('Transactions')
        .where({txblob: null, submittedAt: null, abortedAt: null, error: null})
        .limit(limit)
        .select();
    return Promise.resolve(dbPromise);
};

/**
* Marks the given transaction as errored with the given error message.
*/
database.prototype.markTransactionError = function (transaction, error) {
    var dbPromise = this.db('Transactions')
        .where({id: transaction.id})
        .update({error: error});
    return Promise.resolve(dbPromise);
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
        amount: amount,
        memo: memo
    };
    var dbPromise = this.db('Transactions').insert(params);
    return Promise.resolve(dbPromise);
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
    return Promise.resolve(dbPromise);
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
    return Promise.resolve(dbPromise);
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
    return Promise.resolve(dbPromise);
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
    return Promise.resolve(dbPromise);
};

/**
* Sets the submittedAt timestamp for the record with the given id.
*/
database.prototype.markTransactionSubmitted = function (id) {
    var dbPromise = this.db('Transactions')
        .where({id: id})
        .update({submittedAt: new Date()});
    return Promise.resolve(dbPromise);
};

/**
* Sets the confirmedAt timestamp for the record with the given id.
*/
database.prototype.markTransactionConfirmed = function (transaction) {
    var dbPromise = this.db('Transactions')
        .where({id: transaction.id})
        .update({confirmedAt: new Date()});
    return Promise.resolve(dbPromise);
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
    return Promise.resolve(dbPromise);
};

/**
* Clears the txblob, txhash, sequence, and signedAt timestamp from the transaction.
*/
database.prototype.clearTransactionsFromId = function (id) {
    var dbPromise = this.db('Transactions')
        .where('id', '>=', id)
        .update({txblob: null, txhash: null, sequence: null, signedAt: null});
    return Promise.resolve(dbPromise);
};

module.exports = database;