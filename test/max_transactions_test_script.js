#!/usr/bin/env node
// processes payments using various values for txns/second and max_transactions_in_flight

var StellarPayments = require("../lib/payments");
var StellarClient   = require("../lib/client");
var config = require("../config");
var Knex = require("knex");

var db = Knex.initialize(config.db);
config.connection = db;
var payments = new StellarPayments(config);
var client = new StellarClient(config);

var SEND_ADDRESS = "gK6vSi1cdydpacA6e1ztSxk7XHyfAvjac";
var SEND_AMOUNT = 25000000;
var ITERATION_TIME = 1000 * 60 * 3 // 30 seconds

// adjust these to test different combinations of txns/second max_txns
var START_MAX_TRANSACTIONS = 1000;
var END_MAX_TRANSACTIONS = 1000;
var START_TXNS_SECOND = 1;
var END_TXNS_SECOND = 1;

// rate at which we call process payments
var pollInterval = 100;

/**
*
[
    {
        txns_second: int // how many txns_second for this result
        max_transactions: int // how many max_transactions for this result
        result: int // how many unsubmitted txns we had at the end
    }
]
*/
var data = [];

clearDb().then(function () {
    console.log("Starting iteration max=" + START_MAX_TRANSACTIONS + " txns=" + START_TXNS_SECOND);
    runIteration(START_MAX_TRANSACTIONS, START_TXNS_SECOND);
})

function runIteration(max_transactions, txns_second) {
    startProcessingPayments(max_transactions);
    startSendingTransactions(txns_second);
    setTimeout(function () {
        stopSendingTransactions();
        stopProcessingPayments();
        getUnsubmittedTransactions()
            .then(function (result) {
                data.push({
                    txns_second: txns_second,
                    max_transactions: max_transactions,
                    result: result
                });
            })
            .then(clearDb)
            .then(function () {
                if (max_transactions + 1 > END_MAX_TRANSACTIONS) {
                    if (txns_second + 1 <= END_TXNS_SECOND) {
                        max_transactions = 1;
                        txns_second += 1;
                    } else {
                        saveResults();
                        process.exit();
                    }
                } else {
                    max_transactions += 1;
                }
                console.log("Starting iteration max=" + max_transactions + " txns=" + txns_second);
                runIteration(max_transactions, txns_second);
            })
    }, ITERATION_TIME);
}

function saveResults() {
    console.log(data);
}

function clearDb() {
    return db.raw("TRUNCATE TABLE Transactions");
}

function startProcessingPayments(max_transactions) {
    killProcessing = false;
    processPayments(max_transactions);
}

var processingIntervalId;
function processPayments(max_transactions) {
    processingIntervalId = setInterval(function () {
        payments.processPayments(max_transactions);
    }, pollInterval);
}

function stopProcessingPayments() {
    clearInterval(processingIntervalId);
}

// txns - transactions per second to add
function startSendingTransactions(txns) {
    killTransactions = false;
    sendTransactions(txns);
}

var transactionIntervalId;
function sendTransactions(txns) {
    transactionIntervalId = setInterval(function () {
        for (var i = 0; i < txns; i++) {
            client.createNewPayment(SEND_ADDRESS, SEND_AMOUNT);
        }
    }, 1000);
}

function stopSendingTransactions() {
    clearInterval(transactionIntervalId);
}

function getUnsubmittedTransactions() {
    return db("Transactions")
        .whereNull("submittedAt")
        .select()
        .then(function (result) {
            console.log(result);
            return result.length;
        })
}