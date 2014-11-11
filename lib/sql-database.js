var _       = require("lodash");
var Promise = require("bluebird");
var Knex    = require("knex");

/**
* Constructs a mysql db implementation of the stellar payments interface.
* @param {object} config The mysql configuration parameters
*   @param {string} client The type of client adapter. Knex supports (Postgres, MySQL, MariaDB and SQLite3)
*   @param {object} connection Connection configuration params
*       @param {string} host
*       @param {string} password
*       @param {string} user
*       @param {string} database
*/
function database (connection) {
    this.db = connection;
}

/**
* Return transactions that have not been signed yet.
* @param {integer} limit The max amount of transactions to be returned.
*/
database.prototype.getUnsignedTransactions = function (limit) {
    var self = this;
    return new Promise(function (resolve, reject) {
        var dbPromise = self.db('Transactions')
            .where({txblob: null, submittedAt: null, abortedAt: null, error: null})
            .limit(limit)
            .select();
        resolve(dbPromise);
    });
};

/**
* Marks the given transaction as errored with the given error message.
*/
database.prototype.markTransactionError = function (transaction, error) {
    return this.db('Transactions')
        .where({id: transaction.id})
        .update({error: error});
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
    return this.db('Transactions').insert(params);
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
    return this.db('Transactions')
        .where({id: transaction.id})
        .update(params);
};

/**
* Returns submitted transactions that have not been confirmed yet.
*/
database.prototype.getSubmittedUnconfirmedTransactions = function () {
    var self = this;
    return new Promise(function (resolve, reject) {
        var dbPromise = self.db('Transactions')
            .whereNotNull('txblob')
            .whereNotNull('submittedAt')
            .whereNull('confirmedAt')
            .whereNull('abortedAt')
            .whereNull('error')
            .orderBy('sequence')
            .select();
        resolve(dbPromise);
    });
};

/**
* Returns signed transactions that have not been confirmed yet.
*/
database.prototype.getSignedUnconfirmedTransactions = function () {
    var self = this;
    return new Promise(function (resolve, reject) {
        var dbPromise = self.db('Transactions')
            .whereNotNull('txblob')
            .whereNull('confirmedAt')
            .whereNull('abortedAt')
            .whereNull('error')
            .orderBy('sequence')
            .select();
        resolve(dbPromise);
    });
};

/**
* Returns all of the unsubmitted transactions.
*/
database.prototype.getUnsubmittedTransactions = function (limit) {
    return this.db('Transactions')
        .whereNotNull('txblob')
        .whereNull('submittedAt')
        .whereNull('abortedAt')
        .whereNull('error')
        .orderBy('sequence')
        .limit(limit)
        .select();
};

/**
* Sets the submittedAt timestamp for the record with the given id.
*/
database.prototype.markTransactionSubmitted = function (id) {
    return this.db('Transactions')
        .where({id: id})
        .update({submittedAt: new Date()});
};

/**
* Sets the confirmedAt timestamp for the record with the given id.
*/
database.prototype.markTransactionConfirmed = function (transaction) {
    return this.db('Transactions')
        .where({id: transaction.id})
        .update({confirmedAt: new Date()});
};

/**
* Returns the highest sequence number that we've signed a tranaction with.
*/
database.prototype.getHighestSequenceNumberFromTransactions = function () {
    return this.db('Transactions')
        .orderBy('sequence', 'desc')
        .limit(1)
        .whereNotNull("sequence")
        .select()
        .then(_.first)
        .then(function (result) {
            return result && result.sequence;
        });
};

/**
* Clears the txblob, txhash, sequence, and signedAt timestamp from the transaction.
*/
database.prototype.clearTransactionsFromId = function (id) {
    return this.db('Transactions')
        .where('id', '>=', id)
        .update({txblob: null, txhash: null, sequence: null, signedAt: null});
};

module.exports = database;