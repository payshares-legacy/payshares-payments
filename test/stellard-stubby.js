var Promise = require("bluebird");
var _       = require("lodash");

var DEFAULT_LIMIT = 500;

function StellardStubby() {
    // we hold all transactions ('signed and unsubmitted' and 'submitted') in this array
    this.transactions = [];
    // this is the default sequence we'll use.
    this.sequence = 0;
    // holds address+amount => {error, error_message} we'll check when signing a transaction
    this.signingErrors = {};
    // holds errors for transactions we haven't seen yet
    this.futureBlobErrors = {};

    this.StellardStubbyMock = new StellardStubbyMock();
}

function StellardStubbyMock() {}

// API

StellardStubby.prototype.setSequenceNumber = function (sequence) {
    this.sequence = sequence;
};

/**
* Returns the given signing error when signing a transaction with the given contactanted address+amount.
*/
StellardStubby.prototype.returnErrorWhileSigning = function (address, amount, error, error_message) {
    this.signingErrors[address+amount] = {error: error, error_message: error_message};
};

/**
* Sets the error we'll return when this transaction is submitted.
*/
StellardStubby.prototype.setTransactionSubmitError = function (tx_blob, error, code) {
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
StellardStubby.prototype.returnErrorForTxBlob = function (tx_blob, error, code) {
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

StellardStubby.prototype.addSignedTransaction = function (address, secret, destination, amount, sequence) {
    var tx = createSignPaymentTransactionResponse(address, secret, destination, amount, sequence);
    this.storeSignedTransaction(tx.result.tx_blob, tx.result.tx_json);
};

// Conveinence method to sign and "validate" a transaction
StellardStubby.prototype.sendPaymentTransaction = function (address, secret, destination, amount, options) {
    var self = this;
    return this.signPaymentTransaction(address, secret, destination, amount, options)
        .then(function (result) {
            return self.submitTransactionBlob(result.result.tx_blob);
        });
};

// STUB METHODS

StellardStubby.prototype.getAccountTransactions = function (stellarAddress, options) {
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
            account: stellarAddress,
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

StellardStubby.prototype.signPaymentTransaction = function(address, secret, destination, amount, options) {
    var self = this;
    this.StellardStubbyMock.signPaymentTransaction(address, secret, destination, amount, options);

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
            var sequence = options.Sequence;
            var tx = createSignPaymentTransactionResponse(address, secret, destination, amount, sequence);
            self.storeSignedTransaction(tx.result.tx_blob, tx.result.tx_json);
            resolve(tx);
        }
    });
};
StellardStubbyMock.prototype.signPaymentTransaction = function (address, secret, destination, amount, options) {};

StellardStubby.prototype.getTransaction = function (hash) {
    var self = this;
    this.StellardStubbyMock.getTransaction(hash);

    return new Promise(function (resolve, reject) {
        var transaction = _.find(self.transactions, {tx_hash: hash});
        resolve(createGetTransactionResponse(transaction));
    });
};
StellardStubbyMock.prototype.getTransaction = function (hash) {};

StellardStubby.prototype.submitTransactionBlob = function (tx_blob) {
    var self = this;
    this.StellardStubbyMock.submitTransactionBlob(tx_blob);

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
StellardStubbyMock.prototype.submitTransactionBlob = function (tx_blob) {};

// TODO: they only care about the sequence number right now
StellardStubby.prototype.getAccountInfo = function (address) {
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

StellardStubby.prototype.storeSignedTransaction = function (tx_blob, tx) {
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

function createSignPaymentTransactionResponse(address, secret, destination, amount, sequence) {
    return {
        "result": {
            "status": "success",
            "tx_blob": address + "-" + secret + "-" + destination + "-" + amount + "-" + sequence,
            "tx_json": {
                "Account": address,
                "Amount": amount,
                "Destination": destination,
                "Fee": 10,
                "Flags": 0,
                "Sequence": sequence,
                "SigningPubKey": 0,
                "TransactionType": "Payment",
                "TxnSignature": "",
                "hash": address + "-" + secret + "-" + destination + "-" + amount + "-" + sequence
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

module.exports = StellardStubby;