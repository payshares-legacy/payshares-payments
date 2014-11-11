var Promise = require("bluebird");
var errors  = require('./errors');
var log     = require("./logger");
/**
* The Signer checks for new payment jobs in the transaction table and sign the transactions.
* It keeps track of the sequence number locally and uses this when signing the transactions.
* It creates and signs each new transaction, and stores each transaction blob and hash into the row.
*
* @param {object} config
*   - @param {int}    maxTransactionsInFlight only sign (max - (signed submitted unconfirmed txns))
*   - @param {string} stellarAddress The signing account's address.
*   - @param {string} stellarSecretKey The signing account's secret.
* @param {object} database The payments database layer implementation
* @param {object} network The stellard network.
*/
var Signer = function (config, database, network) {
    if (config.stellarAddress == null) {
        throw new Error("stellarAddress required");
    }
    if (config.stellarSecretKey == null) {
        throw new Error("stellarSecretKey required");
    }
    this.maxTransactionsInFlight    = config.maxTransactionsInFlight;
    this.stellarAddress             = config.stellarAddress;
    this.stellarSecretKey           = config.stellarSecretKey;
    this.database                   = database;
    this.network                    = network;

    if (config.logger) {
        log = config.logger;
    }
};

Signer.errors = {};
Signer.errors.SigningError = Error.subclass("Signer.errors.SigningError");

/**
* Set the current sequence number.
*/
Signer.prototype.setSequenceNumber = function (sequence) {
    this.sequenceNumber = sequence;
};

/**
* Returns the current sequence number.
*/
Signer.prototype.getSequenceNumber = function () {
    return this.sequenceNumber || 0;
};

/**
* Increment the current sequence number by 1.
*/
Signer.prototype.incrementSequenceNumber = function () {
    this.sequenceNumber += 1;
};

/**
* Pulls unsigned transactions (up to the limit) from the database and signs them in turn.
* Each successful transaction that is signed is commited back to the database.
* If signing any transaction results in an error, the error will be logged and the transaction will
* be marked as errored in the db, and the signer will continue signing.
*
* @param {int} limit The limit of transactions to sign.
* @returns {Promise} A promise that will be resolved when all transactions have been successfully signed.
*/
Signer.prototype.signTransactions = function (limit) {
    var self = this;
    return this.database.getUnsignedTransactions(10)
        .each(self.signTransaction.bind(self));
};

/**
* Signs a transaction with the current sequence number and then increments the sequence number if successful.
* If there's a error signing the transaction, the error will be logged and the transaction will be marked
* as errored in the db, and the sequence number will not be incremented.
*
* @param {object} transaction The transaction object
* @throws {Signer.errors.SigningError} Thrown if there is an error signing a transaction.
*/
Signer.prototype.signTransaction = function(transaction) {
    var self = this;

    var address     = this.stellarAddress;
    var secret      = this.stellarSecretKey;
    var destination = transaction.address;
    var amount      = transaction.amount;
    var options = {
        Sequence: this.getSequenceNumber()
    };
    return this.network.signPaymentTransaction(address, secret, destination, amount, options)
        .then(function (result) {
            return processSignTransactionResponse.bind(self)(transaction, result);
        })
        .then(function () {
            return self.incrementSequenceNumber();
        })
        .catch(Signer.errors.SigningError, function (err) {
            log.error(err);
            return self.database.markTransactionError(transaction, err.message);
        });
};

/**
* Process the response from a signPaymentTransaction call to stellard. If there's an error, return a
* rejected promise. Otherwise, store the signed transaction.
*/
function processSignTransactionResponse(transaction, result) {
    if (result.result.error) {
        return Promise.reject(new Signer.errors.SigningError("Error signing transaction. " +
            "Destination: " + transaction.address + " Amount: " + transaction.amount + " " +
            "Error: " + result.result.error + " " + result.result.error_message));
    }
    transaction.txhash = result.result.tx_json.hash;
    transaction.txblob = result.result.tx_blob;
    transaction.sequence = this.getSequenceNumber();
    return this.database.storeSignedTransaction(transaction);
}

module.exports = Signer;