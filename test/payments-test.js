var helper      = require("./test-helper");
var Promise     = require("bluebird");
var _           = require("lodash");

var request     = Promise.promisify(require('request'));
var assert      = require('assert');
var sinon       = require('sinon');

var StellardStubby  = require('./stellard-stubby');
var Payments        = require('../lib/payments');
var MockSigner      = require('./mock-signer');
var MockSubmitter   = require('./mock-submitter');
var Database     = require('../lib/database');

var sandbox = sinon.sandbox.create();

// The payments object we'll be testing
var payments;

describe("payments tests", function () {
    var database;
    var signer;
    var signerMock;
    var submitter;
    var submitterMock;
    var networkMock;
    var networkStubby;
    var databaseMock;
    var paymentsMock;
    beforeEach(function () {
        signer = new MockSigner();
        submitter = new MockSubmitter();
        signerMock = sandbox.mock(signer);
        submitterMock = sandbox.mock(submitter);
        networkStubby = new StellardStubby();
        database = new Database({connection: helper.db, logger: helper.logger});
        databaseMock = sandbox.mock(database);

        var config = _.assign(helper.config, {
            database: database,
            network: networkStubby,
            logger: helper.logger,
            signer: signer,
            submitter: submitter
        });

        payments = new Payments(config);
        paymentsMock = sandbox.mock(payments);
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe("processPayments()" , function () {
        var _ensureSequenceNumberExpectation;
        var calculateSigningLimitExpectation;
        var signTransactionsExpectation;
        var submitTransactionsExpectation;
        var _handleResignErrorExpectation;

        beforeEach(function () {
            _ensureSequenceNumberExpectation = paymentsMock.expects("_ensureSequenceNumber");
            calculateSigningLimitExpectation = paymentsMock.expects("calculateSigningLimit");
            signTransactionsExpectation = paymentsMock.expects("signTransactions");
            submitTransactionsExpectation = paymentsMock.expects("submitTransactions");
            _handleResignErrorExpectation = paymentsMock.expects("_handleResignError");
        });

        describe("happy path", function () {
            beforeEach(function (done) {
                _ensureSequenceNumberExpectation.once();
                calculateSigningLimitExpectation.once();
                signTransactionsExpectation.once();
                submitTransactionsExpectation.once();


                payments.processPayments()
                    .then(function () {
                        done();
                    });
            });

            it("should ensure sequence number", function (done) {
                _ensureSequenceNumberExpectation.verify();
                done();
            });

            it("should calculate signing limit", function (done) {
                calculateSigningLimitExpectation.verify();
                done();
            });

            it("should sign transactions", function (done) {
                signTransactionsExpectation.verify();
                done();
            });

            it("should submit transactions", function (done) {
                submitTransactionsExpectation.verify();
                done();
            });
        });

        describe("when we're currently signing and submitting", function () {
            beforeEach(function () {
                payments.signingAndSubmitting = true;
                signTransactionsExpectation.never();
                submitTransactionsExpectation.never();
            });

            it("should return a resolved promise", function (done) {
                payments.processPayments()
                    .then(function () {
                        done();
                    })
                    .catch(function (err) {
                        done("returned a rejected promise");
                    });
            })

            it("should not call signTransactions", function (done) {
                payments.processPayments()
                    .then(function () {
                        signTransactionsExpectation.verify();
                        done();
                    })
                    .catch(done);
            });

            it("should not call submitTransactions", function (done) {
                payments.processPayments()
                    .then(function () {
                        submitTransactionsExpectation.verify();
                        done();
                    })
                    .catch(done);
            });
        });

        describe("when there's a non-aborted fatal error", function () {
            var error;
            beforeEach(function() {
                error = new Error("test");
                error.transaction = {id: 1};
                payments.fatalError = error;
                signTransactionsExpectation.never();
                submitTransactionsExpectation.never();
                var isAbortedStub = sandbox.stub(payments.database, "isAborted");
                isAbortedStub.returns(Promise.resolve(false));
            });

            it("should reject with stored FatalError", function (done) {
                payments.processPayments()
                    .then(function () {
                        done("returned a resolved promise");
                    })
                    .catch(function (err) {
                        assert.equal(err, error);
                        done();
                    })
            });

            it("should not call signTransactions", function (done) {
                payments.processPayments()
                    .then(function () {
                        done("returned a resolved promise");
                    })
                    .catch(function () {
                        signTransactionsExpectation.verify();
                        done();
                    });
            });

            it("should not call submitTransactions", function (done) {
                payments.processPayments()
                    .then(function () {
                        done("returned a resolved promise");
                    })
                    .catch(function () {
                        submitTransactionsExpectation.verify();
                        done();
                    });
            });
        });

        describe("when there's an aborted fatal error", function () {
            beforeEach(function() {
                error = new Error("test");
                error.transaction = {id: 1};
                payments.fatalError = error;
                signTransactionsExpectation.once();
                submitTransactionsExpectation.once();
                _handleResignErrorExpectation.once();
                var isAbortedStub = sandbox.stub(payments.database, "isAborted");
                isAbortedStub.returns(Promise.resolve(true));
            });

            it("should set fatal error to null", function (done) {
                payments.processPayments()
                    .then(function () {
                        assert.equal(null, payments.fatalError)
                        done();
                    })
                    .catch(done);
            });

            it("should call signTransactions", function (done) {
                payments.processPayments()
                    .then(function () {
                        signTransactionsExpectation.verify();
                        done();
                    })
                    .catch(done);
            });

            it("should call submitTransactions", function (done) {
                payments.processPayments()
                    .then(function () {
                        submitTransactionsExpectation.verify();
                        done();
                    })
                    .catch(done);
            });

            it("should resign transactions", function (done) {
                payments.processPayments()
                    .then(function () {
                        _handleResignErrorExpectation.verify();
                        done();
                    })
                    .catch(done);
            })
        });
    });

    describe("initSequenceNumber()", function () {

        describe("with transactions in database", function () {
            it("should call setSequenceNumber the sequence number + 1", function (done) {
                var getHighestSequenceNumberFromTransactionsStub = sandbox.stub(payments.database, "getHighestSequenceNumberFromTransactions");
                getHighestSequenceNumberFromTransactionsStub.returns(1);

                var setSequenceNumberExpectation = signerMock.expects("setSequenceNumber").withExactArgs(2);
                payments.initSequenceNumber()
                    .then(function () {
                        setSequenceNumberExpectation.verify();
                        done();
                    })
                    .catch(done);
            });

            it("should call getHighestSequenceNumberFromTransactions", function (done) {
                var getHighestSequenceNumberFromTransactionsExpectation = databaseMock.expects("getHighestSequenceNumberFromTransactions");
                getHighestSequenceNumberFromTransactionsExpectation.once();
                payments.initSequenceNumber()
                    .then(function (seq) {
                        getHighestSequenceNumberFromTransactionsExpectation.verify();
                        done();
                    })
                    .catch(done);
            })
        });

        describe("with an empty database", function () {
            it("should get sequence number from network", function (done) {
                var getHighestSequenceNumberFromTransactionsStub = sandbox.stub(payments.database, "getHighestSequenceNumberFromTransactions");
                getHighestSequenceNumberFromTransactionsStub.returns(0);

                var _getLatestSequenceNumberFromNetworkExpecation = paymentsMock.expects("_getLatestSequenceNumberFromNetwork");
                _getLatestSequenceNumberFromNetworkExpecation.once();

                payments.initSequenceNumber()
                    .then(function () {
                        _getLatestSequenceNumberFromNetworkExpecation.verify();
                        done();
                    })
                    .catch(done);
            });
        });
    });
});