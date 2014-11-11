var helper      = require("./test-helper");
var Promise     = require("bluebird");
var _           = require("lodash");

var request     = Promise.promisify(require('request'));
var assert      = require('assert');
var sinon       = require('sinon');

var StellardStubby  = require('./stellard-stubby');
var PaymentsSigner  = require('../lib/signer');
var sqlDatabase     = require('../lib/sql-database');

var sandbox = sinon.sandbox.create();

// The signer object we'll be testing
var signer;

describe("signer tests", function () {
    afterEach(function () {
        sandbox.restore();
    });
    describe("signTransaction()" ,function () {
        var STARTING_SEQUENCE_NUMBER = 1;

        var networkStubby;
        var networkMock;
        var databaseMock;
        var signPaymentTransactionExpectation;
        var storeSignedTransactionExpectation;
        var markTransactionErrorExpectation;

        beforeEach(function (done) {
            networkStubby = new StellardStubby();
            var config = _.assign(helper.config, {
                network: networkStubby,
                logger: helper.logger
            });
            var database = new sqlDatabase(helper.config.db);
            networkMock = sinon.mock(networkStubby.StellardStubbyMock);
            databaseMock = sinon.mock(database);
            signPaymentTransactionExpectation = networkMock.expects("signPaymentTransaction");
            storeSignedTransactionExpectation = databaseMock.expects("storeSignedTransaction");

            signer = new PaymentsSigner(helper.config, database, networkStubby);
            signer.setSequenceNumber(STARTING_SEQUENCE_NUMBER);

            done();
        });

        afterEach(function (done) {
            networkMock.restore();
            databaseMock.restore();
            done();
        });

        describe("signs a good transaction", function () {
            beforeEach(function (done) {
                var goodTx = {
                    id: 1,
                    address: "gUtH4rCNEGPWke3PzDnJ3E7mozcsuXJTAf",
                    amount: 1
                };
                signPaymentTransactionExpectation.once();
                storeSignedTransactionExpectation.once();

                signer.signTransaction(goodTx)
                    .then(done);
            });

            it("should sign the transaction", function (done) {
                networkMock.verify();
                done();
            });

            it("should store the transaction", function (done) {
                databaseMock.verify();
                done();
            });

            it("should increment the sequence number", function (done) {
                assert.equal(signer.sequenceNumber, STARTING_SEQUENCE_NUMBER + 1);
                done();
            });
        });

        describe("signs a bad transaction", function () {
            beforeEach(function (done) {
                var badTx = {
                    id: 1,
                    address: "xxxx",
                    amount: 1
                };
                markTransactionErrorExpectation = databaseMock.expects("markTransactionError");
                networkStubby.returnErrorWhileSigning(badTx.address, badTx.amount, "invalidParams", "Invalid field \'tx_json.Destination\', not object.");
                markTransactionErrorExpectation.once();

                signer.signTransaction(badTx)
                    .then(done);
            });

            it("should store the transaction error", function (done) {
                markTransactionErrorExpectation.verify();
                done();
            });

            it("should not increment the sequence number", function (done) {
                assert.equal(signer.sequenceNumber, STARTING_SEQUENCE_NUMBER);
                done();
            });
        });
    });
});