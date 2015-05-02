var Promise = require("bluebird");
var _       = require("lodash");
var PaysharesLib = require("payshares-lib");

var DEFAULT_LIMIT = 500;

function PaysharesdStubby() {
    // we hold all transactions ('signed and unsubmitted' and 'submitted') in this array
    this.transactions = [];
    // this is the default sequence we'll use.
    this.sequence = 0;
    // holds address+amount => {error, error_message} we'll check when signing a transaction
    this.signingErrors = {};
    // holds errors for transactions we haven't seen yet
    this.futureBlobErrors = {};

    this.PaysharesdStubbyMock = new PaysharesdStubbyMock();
}

function PaysharesdStubbyMock() {}

// API

PaysharesdStubby.prototype.setSequenceNumber = function (sequence) {
    this.sequence = sequence;
};

/**
* Returns the given signing error when signing a transaction with the given contactanted address+amount.
*/
PaysharesdStubby.prototype.returnErrorWhileSigning = function (address, amount, error, error_message) {
    this.signingErrors[address+amount] = {error: error, error_message: error_message};
};

/**
* Sets the error we'll return when this transaction is submitted.
*/
PaysharesdStubby.prototype.setTransactionSubmitError = function (tx_blob, error, code) {
    var transaction = _.find(this.transactions, {'tx_blob': tx_blob});
    if (!transaction) {
        this.futureBlobErrors.tx_blob = {
            result: error,
            result_code: code
        };
    } else {
        transaction.submit_result = error;
        transaction.submit_result_code = code;
    }
};

/**
* Sets the error this transaction will have in the applied ledger.
*/
PaysharesdStubby.prototype.returnErrorForTxBlob = function (tx_blob, error, code) {
    var transaction = _.find(this.transactions, {'tx_blob': tx_blob});
    if (!transaction) {
        this.futureBlobErrors[tx_blob] = {
            result: error,
            result_code: code
        };
    } else {
        transaction.result = error;
        transaction.result_code = code;
    }
};

PaysharesdStubby.prototype.addSignedTransaction = function (account, secret, destination, amount, sequence, txblob, txhash) {
    var tx = createSignPaymentTransactionResponse(account, secret, destination, amount, sequence, txblob, txhash);
    this.storeSignedTransaction(tx.result.tx_blob, tx.result.tx_json);
};

// Conveinence method to sign and "validate" a transaction
PaysharesdStubby.prototype.sendPaymentTransaction = function (address, secret, destination, amount, options) {
    var self = this;
    return this.signPaymentTransaction(address, secret, destination, amount, options)
        .then(function (result) {
            return self.submitTransactionBlob(result.result.tx_blob);
        });
};

// STUB METHODS

PaysharesdStubby.prototype.getAccountTransactions = function (paysharesAddress, options) {
    var self = this;

    return new Promise(function (resolve, reject) {
        var sorted = sortBySequence(self.transactions);
        var limit = options && options.limit ? options.limit : DEFAULT_LIMIT;
        var transactions = [];
        for (var i = 0; i < sorted.length && i < limit; i++) {
            var transaction = sorted[i];
            var transObj = {
                meta: transaction.tx.meta,
                tx: transaction.tx,
                validated: true
            };
            transactions.unshift(sorted[i]);
        }
        var data = {
            account: paysharesAddress,
            ledger_index_max: 0,
            ledger_index_min: 0,
            limit: limit,
            marker: null,
            status: "success",
            transactions: transactions
        };
        resolve({result: data});
    });
};

PaysharesdStubby.prototype.signPaymentTransaction = function(address, secret, destination, amount, sequence) {
    var self = this;
    this.PaysharesdStubbyMock.signPaymentTransaction(address, secret, destination, amount, sequence);

    return new Promise(function (resolve, reject) {
        if (self.signingErrors[destination+amount]) {
            var errorObj = self.signingErrors[destination+amount];
            var tx = {};
            tx.result = {
                error: errorObj.error,
                error_message: errorObj.error_message
            };
            resolve(tx);
        } else {
            var tx = createSignPaymentTransactionResponse(address, secret, destination, amount, sequence);
            self.storeSignedTransaction(tx.result.tx_blob, tx.result.tx_json);
            resolve(tx);
        }
    });
};
PaysharesdStubbyMock.prototype.signPaymentTransaction = function (address, secret, destination, amount, options) {};


PaysharesdStubby.prototype.getTransaction = function (hash) {
    var self = this;
    this.PaysharesdStubbyMock.getTransaction(hash);

    return new Promise(function (resolve, reject) {
        var transaction = _.find(self.transactions, {tx_hash: hash});
        resolve(createGetTransactionResponse(transaction));
    });
};
PaysharesdStubbyMock.prototype.getTransaction = function (hash) {};

PaysharesdStubby.prototype.submitTransactionBlob = function (tx_blob) {
    var self = this;
    this.PaysharesdStubbyMock.submitTransactionBlob(tx_blob);

    return new Promise(function (resolve, reject) {
        var transaction = _.find(self.transactions, {tx_blob: tx_blob});
        // if we've previously registered a submit error for this txblob, apply it now
        if (self.futureBlobErrors[transaction.tx_blob]) {
            transaction.result = self.futureBlobErrors[transaction.tx_blob].result;
            transaction.result_code = self.futureBlobErrors[transaction.tx_blob].result_code;
            delete self.futureBlobErrors[transaction.tx_blob];
        }
        var response = createSubmitTransactionBlobResponse.bind(self)(transaction);
        // add the additional information to tx_record and add to transactions
        transaction.submittedAt = new Date();
        transaction.tx.inLedger = 1;
        transaction.tx.ledger_index = 1;
        transaction.tx.meta = {
            "TransactionResult": transaction.result
        };
        self.transactions.push(transaction);
        // increment the local sequence number if success and this is not a resubmission
        if ((transaction.result === "tesSUCCESS" || transaction.result === "tecPATH_DRY") && !transaction.submit_result) {
            self.sequence += 1;
        }
        resolve(response);
    });
};
PaysharesdStubbyMock.prototype.submitTransactionBlob = function (tx_blob) {};

// TODO: they only care about the sequence number right now
PaysharesdStubby.prototype.getAccountInfo = function (address) {
    var self = this;

    return new Promise(function (resolve, reject) {
        var result = {
            result: {
                account_data: {
                    Account: address,
                    Sequence: self.sequence
                }
            }
        };
        resolve(result);
    });
};

// HELPERS

PaysharesdStubby.prototype.storeSignedTransaction = function (tx_blob, tx) {
    var data = {
        tx_blob: tx_blob,
        tx_hash: tx.hash,
        tx: tx,
        "result": "tesSUCCESS"
    };
    this.transactions.push(data);
};

function sortBySequence(transactions) {
    return _.sortBy(transactions, function (transaction) {
        return transaction.tx.Sequence;
    });
}

function createSignPaymentTransactionResponse(account, secret, destination, amount, sequence, txblob, txhash) {
    if (!txblob) {
        var obj = getTxBlobAndHash(account, secret, destination, amount, sequence);
        txblob = obj.blob;
        txhash = obj.hash;
    }
    return {
        "result": {
            "status": "success",
            "tx_blob": txblob,
            "tx_json": {
                "Account": account,
                "Amount": amount,
                "Destination": destination,
                "Fee": 10,
                "Flags": 0,
                "Sequence": sequence,
                "SigningPubKey": 0,
                "TransactionType": "Payment",
                "TxnSignature": "",
                "hash": txhash
            }
        }
    };
}

function createGetTransactionResponse(tx_record) {
    var result = _.assign(tx_record.tx,
        {
            "status": "success",
            "validated": "true"
        }
    );
    result.meta.TransactionResult = tx_record.result;
    return {
        "result": result
    };
}

function createSubmitTransactionBlobResponse(tx_record) {
    var engine_result = tx_record.submit_result ? tx_record.submit_result : tx_record.result;
    var engine_result_code = tx_record.submit_result ? Number(tx_record.submit_result) : Number(tx_record.result_code);

    return {
        "result": {
            "engine_result": engine_result,
            "engine_result_code": engine_result_code,
            "status": "success",
            "tx_blob": tx_record.tx_blob,
            "tx_json": tx_record.tx
        }
    };
}

function getTxBlobAndHash(account, secret, destination, amount, sequence) {
    var tx = new PaysharesLib.Transaction();
    tx.remote = null;
    tx.tx_json = {
        Account: account,
        Amount: amount,
        TransactionType: 'Payment',
        Destination: destination,
        Sequence: sequence,
        Fee: 10
    };
    tx._secret = secret;
    tx.complete();

    try {
        tx.sign()
    } catch (e) {
        return Promise.reject(e);
    }

    var blob = tx.serialize().to_hex();
    var hash = tx.hash();
    return {
        blob: blob,
        hash: hash
    }
}

module.exports = PaysharesdStubby;