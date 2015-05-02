var Promise     = require("bluebird");
var _           = require("lodash");
var unirest     = require('unirest');

var errors      = require('./errors');

function PaysharesNetwork(config) {
    this.paysharesdIp = config.paysharesdIp;
    this.paysharesdRpcPort = config.paysharesdRpcPort;
    this.paysharesdWebsocketPort = config.paysharesdWebsocketPort;
}

PaysharesNetwork.errors = {};
PaysharesNetwork.errors.Transaction   = Error.subclass('TransactionError');
PaysharesNetwork.errors.NetworkError  = Error.subclass('NetworkError');

/**
* Submits the signed tx_blob to the paysharesd server.
* @param {string} tx_blob the signed transaction blob
*/
PaysharesNetwork.prototype.submitTransactionBlob = function (tx_blob) {
    var opts = {
        tx_blob: tx_blob
    };
    return this.sendRequest("submit", opts).get("body");
};

/**
* Fetches the transaction with the given hash from paysharesd.
*/
PaysharesNetwork.prototype.getTransaction = function(hash) {
    var opts = {
        transaction: hash
    };
    return this.sendRequest("tx", opts).get("body");
};

PaysharesNetwork.prototype.getAccountInfo = function (address) {
    var opts = {
        account: address
    };
    return this.sendRequest("account_info", opts).get("body");
};

PaysharesNetwork.prototype.sendRequest = function(method, opts) {
    var self = this;
    return new Promise(function(resolve, reject) {
        var uri = 'http://' + self.paysharesdIp + ':' + self.paysharesdRpcPort;
        var request = {
            method: method,
            params: [opts]
        };

        unirest.post(uri)
            .headers({ 'Accept': 'application/json' })
            .type("json")
            .send(request)
            .end(function (result) {
                if (result.error) {
                    reject(new PaysharesNetwork.errors.NetworkError(result));
                } else {
                    var error = result["body"].result.error;
                    if (error && isNetworkError(error)) {
                        reject(new PaysharesNetwork.errors.NetworkError(error));
                    } else {
                        resolve(result);
                    }
                }
            });
    });
};

function isNetworkError(error) {
    switch (error) {
        case "noNetwork":
        case "noCurrent":
            return true;
        default:
            return false;
    }
}

/**
* Builds the tx_json field for the transaction.
*/
function constructPaymentTransactionJson(account, destination, amount, options) {
    var txJson = {
        TransactionType: "Payment",
        Account: account,
        Destination: destination,
        Amount: amount
    };
    _.assign(txJson, options);
    return txJson;
}

function callListeners(listeners, message) {
    if (!listeners) { return; }

    _.forEach(listeners, function (listener) {
        listener(message);
    });
}

module.exports = PaysharesNetwork;
