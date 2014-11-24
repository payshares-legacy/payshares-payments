var helper      = require("./test-helper");
var Promise     = require("bluebird");
var _           = require("lodash");
var request     = Promise.promisify(require('request'));
var assert      = require('assert');
var sinon       = require('sinon');

var Payments            = require('../lib/payments');
var StellardStubby      = require('./stellard-stubby');
var Submitter           = require('../lib/submitter');
var sqlDatabase         = require('../lib/sql-database');

var sandbox = sinon.sandbox.create();

var WIZARD_ADDRESS = "test";
var WIZARD_SECRET = "test";

// The submitter object we'll be testing
var submitter;

var transaction;

describe("submitter tests", function () {
    beforeEach(function () {
        transaction = {
            id: 1,
            address: "gUtH4rCNEGPWke3PzDnJ3E7mozcsuXJTAf",
            amount: 1
        };
    });
    afterEach(function () {
        sandbox.restore();
        transaction = null;
    });

    describe("submitTransaction()" ,function () {
        var STARTING_SEQUENCE_NUMBER = 1;
        var networkStubby;
        var networkMock;
        var databaseMock;

        beforeEach(function (done) {
            networkStubby = new StellardStubby();
            var database = new sqlDatabase({connection: helper.db, logger: helper.logger});
            networkMock = sinon.mock(networkStubby.StellardStubbyMock);
            databaseMock = sinon.mock(database);

            submitter = new Submitter(helper.config, database, networkStubby);

            done();
        });

        afterEach(function (done) {
            networkMock.restore();
            databaseMock.restore();
            done();
        });

        describe("submits a good transaction", function () {
            beforeEach(function (done) {
                var submitTransactionBlobExpectation = networkMock.expects("submitTransactionBlob");
                var markTransactionSubmittedExpectation = databaseMock.expects("markTransactionSubmitted");
                submitTransactionBlobExpectation.once();
                markTransactionSubmittedExpectation.once();

                networkStubby.signPaymentTransaction(WIZARD_ADDRESS, WIZARD_SECRET, transaction.address, transaction.amount, {Sequence: STARTING_SEQUENCE_NUMBER})
                    .then(function (tx) {
                        transaction.txblob = tx.result.tx_blob;
                        transaction.txhash = tx.result.tx_hash;
                        return networkStubby.returnErrorForTxBlob(tx.result.tx_blob, "tesSUCCESS", 0);
                    })
                    .then(function () {
                        return submitter.submitTransaction(transaction);
                    })
                    .then(done);
            });

            it("should submit the transaction", function (done) {
                networkMock.verify();
                done();
            });

            it("should mark the transaction as submitted", function (done) {
                databaseMock.verify();
                done();
            });
        });

        describe("submits a transaction that has already been applied to a ledger", function () {
            beforeEach(function (done) {
                var submitTransactionBlobExpectation = networkMock.expects("submitTransactionBlob");
                var markTransactionSubmittedExpectation = databaseMock.expects("markTransactionConfirmed");
                submitTransactionBlobExpectation.once();
                markTransactionSubmittedExpectation.once();

                // since we're going to mark the transaction to return an error on submit, we need to manually
                // make getTransaction return a tesSUCCESS when looking up the transaction's hash
                sandbox.stub(networkStubby, "getTransaction", function () {
                    return new Promise(function (resolve, reject) {
                        var result = {
                            result: {
                                meta: {
                                    TransactionResult: "tesSUCCESS"
                                },
                                inLedger: 1
                            }
                        };
                        resolve(result);
                    });
                });

                networkStubby.signPaymentTransaction(WIZARD_ADDRESS, WIZARD_SECRET, transaction.address, transaction.amount, {Sequence: STARTING_SEQUENCE_NUMBER})
                    .then(function (tx) {
                        transaction.txblob = tx.result.tx_blob;
                        transaction.txhash = tx.result.tx_hash;
                        return networkStubby.returnErrorForTxBlob(tx.result.tx_blob, "tefPAST_SEQ", 0);
                    })
                    .then(function () {
                        return submitter.submitTransaction(transaction);
                    })
                    .then(done);
            });

            it("should submit the transaction", function (done) {
                networkMock.verify();
                done();
            });

            it("should mark the transaction as confirmed", function (done) {
                databaseMock.verify();
                done();
            });
        });

        describe("submit a transaction with a previously used sequence", function () {
            beforeEach(function (done) {
                // since we're going to mark the transaction to return an error on submit, we need to manually
                // make getTransaction return a tesSUCCESS when looking up the transaction's hash
                sandbox.stub(networkStubby, "getTransaction", function () {
                    return new Promise(function (resolve, reject) {
                        var result = {
                            result: {
                                error: "txnNotFound"
                            }
                        };
                        resolve(result);
                    });
                });

                done();
            });

            it("should return a PastSequenceError", function (done) {
                networkStubby.signPaymentTransaction(WIZARD_ADDRESS, WIZARD_SECRET, transaction.address, transaction.amount, {Sequence: STARTING_SEQUENCE_NUMBER})
                    .then(function (tx) {
                        transaction.txblob = tx.result.tx_blob;
                        transaction.txhash = tx.result.tx_hash;
                        return networkStubby.returnErrorForTxBlob(tx.result.tx_blob, "tefPAST_SEQ", 0);
                    })
                    .then(function () {
                        return submitter.submitTransaction(transaction);
                    })
                    .then(function () {
                        done("fail");
                    })
                    .catch(Submitter.errors.PastSequenceError, function (err) {
                        done();
                    });
            });
        });

        describe("submit a transaction that fails but claims a fee", function () {
            beforeEach(function (done) {
                var markTransactionErrorExpectation = databaseMock.expects("markTransactionError");
                markTransactionErrorExpectation.once();

                networkStubby.signPaymentTransaction(WIZARD_ADDRESS, WIZARD_SECRET, transaction.address, transaction.amount, {Sequence: STARTING_SEQUENCE_NUMBER})
                    .then(function (tx) {
                        transaction.txblob = tx.result.tx_blob;
                        transaction.txhash = tx.result.tx_hash;
                        return networkStubby.returnErrorForTxBlob(tx.result.tx_blob, "tecPATH_PARTIAL", 100);
                    })
                    .then(function () {
                        return submitter.submitTransaction(transaction);
                    })
                    .then(done);
            });

            it("should mark the transaction as error", function (done) {
                databaseMock.verify();
                done();
            });
        });

        describe("submit a malformed transaction", function () {

            it("should return an error", function (done) {
                networkStubby.signPaymentTransaction(WIZARD_ADDRESS, WIZARD_SECRET, transaction.address, transaction.amount, {Sequence: STARTING_SEQUENCE_NUMBER})
                    .then(function (tx) {
                        transaction.txblob = tx.result.tx_blob;
                        transaction.txhash = tx.result.tx_hash;
                        return networkStubby.returnErrorForTxBlob(tx.result.tx_blob, "temMALFORMED", -299);
                    })
                    .then(function () {
                        return submitter.submitTransaction(transaction);
                    })
                    .then(function () {
                        done("fail");
                    })
                    .catch(Submitter.errors.ResignTransactionError, function (err) {
                        done();
                    });
            });
        });

        describe("submits a transaction that returns a response with no meta field", function () {

            it("should throw an error", function (done) {
                sandbox.stub(networkStubby, "getTransaction").returns({result: {}});
                networkStubby.signPaymentTransaction(WIZARD_ADDRESS, WIZARD_SECRET, transaction.address, transaction.amount, {Sequence: STARTING_SEQUENCE_NUMBER})
                    .then(function (tx) {
                        transaction.txblob = tx.result.tx_blob;
                        transaction.txhash = tx.result.tx_hash;
                        return networkStubby.returnErrorForTxBlob(tx.result.tx_blob, "tefPAST_SEQ", 0);
                    })
                    .then(function () {
                        return submitter.submitTransaction(transaction);
                    })
                    .then(function () {
                        done("should have thrown an error");
                    })
                    .catch(Submitter.errors.NoMetaTransactionError, function (err) {
                        done();
                    })
                    .catch(function (err) {
                        console.error(err.stack);
                        done("threw the wrong err: " + err);
                    });
            });
        });
    });
});