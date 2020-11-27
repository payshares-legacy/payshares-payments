var Promise     = require("bluebird");
var errors      = require('./errors');
var PaysharesLib  = require("payshares-lib");

/**
* The Signer checks for new payment jobs in the transaction table and sign the transactions.
* It keeps track of the sequence number locally and uses this when signing the transactions.
* It creates and signs each new transaction, and stores each transaction blob and hash into the row.
*
* @param {object} config
* @param {string} config.paysharesAddress The signing account's address.
* @param {string} config.paysharesSecretKey The signing account's secret.
* @param {object} config.database The payments database layer implementation
* @param {object} config.network The paysharesd network.
*/
var Signer = function (config, database, network) {
    if (config.paysharesAddress == null) {
        throw new Error("paysharesAddress required");
    }
    if (config.paysharesSecretKey == null) {
        throw new Error("paysharesSecretKey required");
    }
    this.maxTransactionsInFlight    = config.maxTransactionsInFlight;
    this.paysharesAddress             = config.paysharesAddress;
    this.paysharesSecretKey           = config.paysharesSecretKey;
    this.database                   = database;
    this.network                    = network;

    this.log = config.logger || require('./logger');
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
    if (limit <= 0) {
        return;
    }
    var self = this;
    return Promise.bind(this)
        .then(function () {
            return this.database.getUnsignedTransactions(limit);
        })
        .each(this.signTransaction);
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
    var address     = this.paysharesAddress;
    var secret      = this.paysharesSecretKey;
    var destination = transaction.address;
    var value       = transaction.amount;
    var currency    = transaction.currency;
    var issuer      = transaction.issuer;
    var amount      = createAmountObject(value, currency, issuer, this.paysharesAddress);
    return Promise.bind(this)
        .then(function () {
            return this.signPaymentTransaction(address, secret, destination, amount, this.getSequenceNumber());
        })
        .then(function (result) {
            return this._processSignTransactionResponse(transaction, result);
        })
        .then(function () {
            return this.incrementSequenceNumber();
        })
        .catch(Signer.errors.SigningError, function (err) {
            // TODO: remove comments when signing errors are no longer fatal
            //this.log.error("signing error", err, transaction);
            //return this.database.markTransactionError(transaction, err.message)
            return Promise.reject(err);
        })
        .catch(function (err) {
            this.log.error("unhandled signing error", err, transaction);
            return Promise.reject(err);
        });
};

/**
* Locally signs the given transaction.
*/
Signer.prototype.signPaymentTransaction = function (address, secret, destination, amount, sequence) {
    var tx = new PaysharesLib.Transaction();
    tx.remote = null;
    tx.tx_json = {
        Account: address,
        Amount: amount,
        TransactionType: 'Payment',
        Destination: destination,
        Sequence: sequence,
        Fee: 10
    };
    tx._secret = secret;
    tx.complete();

    try {
        tx.sign();
    } catch (e) {
        return Promise.reject(new Signer.errors.SigningError(e));
    }

    var blob = tx.serialize().to_hex();
    var hash = tx.hash();
    return Promise.resolve({
        blob: blob,
        hash: hash
    });
};

/**
* Process the response from a signPaymentTransaction call to paysharesd. If there's an error, return a
* rejected promise. Otherwise, store the signed transaction.
*/
Signer.prototype._processSignTransactionResponse = function (transaction, result) {
    transaction.txhash = result.hash;
    transaction.txblob = result.blob;
    transaction.sequence = this.getSequenceNumber();
    return this.database.storeSignedTransaction(transaction);
};

// return number for paysharess or amount obj for IOUs. sendingAddress for IOUs with no issuer specified.
function createAmountObject(value, currency, issuer, sendingAddress) {
    if (!currency) {
        // payshares payment, multiply to get into stroops
        return "" + value * 1000000;
    }
    if (!issuer) {
        issuer = sendingAddress;
    }
    return {
        value: "" + value,
        currency: currency,
        issuer: issuer
    };
}

module.exports = Signer;
