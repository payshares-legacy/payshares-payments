var Promise = require("bluebird");
var errors  = require('./errors');

/**
* The submitter submits signed, unconfirmed transactions to the network.
* If the transaction has already been confirmed into a ledger, the submitter will mark the transaction as confirmed.
* @param {object} config
* @param {string} config.stellarAddress The signing account's address.
* @param {string} config.stellarSecretKey The signing account's secret.
* @param {object} database The payments database layer implementation
* @param {object} network The stellard network.
*/
var Submitter = function (config, database, network) {
    if (config.stellarAddress == null) {
        throw new Error("stellarAddress required");
    }
    if (config.stellarSecretKey == null) {
        throw new Error("stellarSecretKey required");
    }

    this.stellarAddress             = config.stellarAddress;
    this.stellarSecretKey           = config.stellarSecretKey;
    this.database                   = database;
    this.network                    = network;

    this.log = config.logger || require('./logger');
};

Submitter.errors = {};
// We received a tefPAST_SEQ error, but it's because we tried to submit the same tx twice.
Submitter.errors.ApplyingTransaction         = Error.subclass("ApplyingTransaction");
// We received a tefPAST_SEQ error, and it's a different transaction.
Submitter.errors.PastSequenceError           = Error.subclass("PastSequenceError");
// We're trying to submit a transaction with a higher seq number than the current seq number
// more than likely a previously submitted transaction didn't get into the ledger.
Submitter.errors.PreSequenceError            = Error.subclass("PreSequenceError");
// The account we're sending from is unfunded.
Submitter.errors.UnfundedError               = Error.subclass("UnfundedError");
// We received an unknown error while trying to submit a transaction.
Submitter.errors.UnknownSubmitError          = Error.subclass("UnknownSubmitError");
// Transaction is malformed and cannot suceed in a ledger
Submitter.errors.MalformedTransactionError   = Error.subclass("MalformedTransactionError");
// The account we're sending to doesn't have enough funds to receive our payment.
Submitter.errors.DestinationUnfundedError    = Error.subclass("DestinationUnfundedError");
// The destination account needs a destinationTag. Mark as error and ignore
Submitter.errors.DestinationTagNeeded        = Error.subclass("DestinationTagNeeded");
// We should stop all processing and alert
Submitter.errors.FatalError                  = Error.subclass("FatalError");
// A submission error that still claims a fee (and uses a sequence number)
Submitter.errors.ClaimFeeSubmissionError     = Error.subclass("ClaimFeeSubmissionError");
// The transaction was not found in the ledger
Submitter.errors.TransactionNotFoundError    = Error.subclass("TransactionNotFoundError");
// Local stellard error
Submitter.errors.LocalTransactionError       = Error.subclass("LocalTransactionError");
// A Retry transaction error
Submitter.errors.RetryTransactionError       = Error.subclass("RetryTransactionError");
// A Fail transaction error
Submitter.errors.FailTransactionError        = Error.subclass("FailTransactionError");
// An error that requires a resign transaction
Submitter.errors.ResignTransactionError      = Error.subclass("ResignTransactionError");
// We throw this when a call to tx <hash> returns no meta tag...we don't know if to confirm or error
Submitter.errors.NoMetaTransactionError      = Error.subclass("NoMetaTransactionError");

/**
* Submits all signed unconfirmed transactions to the network.
*/
Submitter.prototype.submitTransactions = function () {
    return Promise.bind(this)
        .then(function () {
            return this.database.getSignedUnconfirmedTransactions();
        })
        .each(function (transaction) {
            return this.submitTransaction(transaction);
        })
        // TODO: remove when tx rpc call is fixed to always include a meta tag
        .catch(Submitter.errors.NoMetaTransactionError, function () {})
};

/**
* Submit the given transaction to the network and update the result in the db.
*/
Submitter.prototype.submitTransaction = function(transaction) {
    return Promise.bind(this)
        .then(function () {
            return this.network.submitTransactionBlob(transaction.txblob);
        })
        .then(function (response) {
            return this._processSubmitResponse(response);
        })
        .then(function () {
            return this.database.markTransactionSubmitted(transaction);
        })
        .catch(function (err) {
            return this._handleSubmitError(err, transaction);
        });
};

// We'll handle errors that do not require a resign here, and propogate others up a level
Submitter.prototype._handleSubmitError = function (err, transaction) {
    switch (err.name) {
        case "ApplyingTransaction":
            // stellard has already seen this transaction and it will be included shortly
            return;
        case "PastSequenceError":
            return this._confirmTransaction(transaction);
        case "ClaimFeeSubmissionError":
            return this.database.markTransactionError(transaction, err.message);
        case "LocalTransactionError":
        case "MalformedTransactionError":
        case "FailTransactionError":
        case "RetryTransactionError":
            return this.database.markTransactionError(transaction, err.message)
                .then(function () {
                    return Promise.reject(new Submitter.errors.ResignTransactionError(transaction));
                });
        default:
            this.log.error("unhandled error type", err);
            err.transaction = transaction;
            return Promise.reject(err);
    }
};

/**
* If the transaction has made it into a closed ledger, we'll mark the transaction as confirmed.
* @throws PastSequenceError If the transaction has not been included in a ledger.
* @throws ClaimFeeSubmissionError If the status of the transaction is not tesSUCCESS.
*/
Submitter.prototype._confirmTransaction = function (transaction) {
    // check if this transaction has made it into the ledger
    return Promise.bind(this)
        .then(function () {
            return this._isTransactionInLedger(transaction.txhash);
        })
        .then(function (inLedger) {
            if (inLedger) {
                return this.database.markTransactionConfirmed(transaction);
            } else {
                return Promise.reject(new Submitter.errors.PastSequenceError());
            }
        })
        // a transaction reported tefPAST_SEQ, but was not found in the network.
        .catch(Submitter.errors.TransactionNotFoundError, function (err) {
            return Promise.reject(new Submitter.errors.PastSequenceError());
        })
        // a transaction claimed a fee and the seq number was used, but could not be applied.
        // mark an error and continue.
        .catch(Submitter.errors.ClaimFeeSubmissionError, function (err) {
            return this._markTransactionError(transaction, err.message);
        });
};

/**
* Marks a transaction as submitted and errored. This transaction will be ignored from future processing.
*/
Submitter.prototype._markTransactionError = function (transaction, error) {
    return Promise.bind(this)
        .then(function () {
            return this.database.markTransactionSubmitted(transaction);
        })
        .then(function () {
            return this.database.markTransactionError(transaction, error);
        });
};

/**
* Returns true if this transaction has made it into a closed ledger successfully.
* @returns true if the transaction is a tesSUCCESS and inLedger, false otherwise.
* @throws TransactionNotFoundError If the request returns the 'txNotFound' error.
* @throws ClaimFeeSubmissionError if the TransactionResult for the transaction is not testSUCCESS.
* @throws FatalError If the request returns an error we don't handle.
*/
Submitter.prototype._isTransactionInLedger = function(hash) {
    return Promise.bind(this)
        .then(function () {
            return this.network.getTransaction(hash);
        })
        .then(function (response) {
            if (response.result.error) {
                if (response.result.error === "txnNotFound") {
                    return Promise.reject(new Submitter.errors.TransactionNotFoundError(response.result.error_message));
                } else {
                    this.log.error("getTransaction returned unknown error", response);
                    return Promise.reject(new Submitter.errors.FatalError("Error getting transaction hash " + hash +
                        "from network. Error message: " + response.result.error_message));
                }
            }
            if (!response.result.meta) {
                throw new Submitter.errors.NoMetaTransactionError(response);
            }
            var result = response.result.meta.TransactionResult;
            if (result !== "tesSUCCESS") {
                return Promise.reject(new Submitter.errors.ClaimFeeSubmissionError(result));
            }
            return !!response.result.inLedger;
        });
};

/**
* Some particular errors we handle explicitly. Otherwise, we'll classify the error based on its error code
* and handle it accordingly.
*/
Submitter.prototype._processSubmitResponse = function (response) {
    switch (response.result.engine_result) {
        case "tefALREADY":
            return Promise.reject(new Submitter.errors.ApplyingTransaction());
        case "tefPAST_SEQ":
            return Promise.reject(new Submitter.errors.PastSequenceError());
        case "terPRE_SEQ":
            return Promise.reject(new Submitter.errors.PreSequenceError());
        case "tecUNFUNDED_PAYMENT":
            return Promise.reject(new Submitter.errors.UnfundedError());
        case "tefDST_TAG_NEEDED":
            return Promise.reject(new Submitter.errors.DestinationTagNeeded());
        case "tesSUCCESS":
            return Promise.resolve();
    }
    var Error = getErrorFromCode(response.result.engine_result_code);
    return Promise.reject(new Error(response.result.engine_result + " " + response.result.engine_result_message));
};

function getErrorFromCode(code) {
    if (code <= -300 && code >= -399) {
        return Submitter.errors.LocalTransactionError;
    } else if (code <= -200 && code >= -299) {
        return Submitter.errors.MalformedTransactionError;
    } else if (code <= -100 && code >= -199) {
        return Submitter.errors.FailTransactionError;
    } else if (code <= -1 && code >= -99) {
        return Submitter.errors.RetryTransactionError;
    } else if (code >= 100 && code <= 159) {
        return Submitter.errors.ClaimFeeSubmissionError;
    } else {
        return Submitter.errors.UnknownSubmitError;
    }
}
module.exports = Submitter;