var fixtures = module.exports;
var assert = require("assert");

var STELLAR_ADDRESS = "gM3a41VDi7fBj8EZBqnBGkGPGz4idBquro";
var STELLAR_SECRET = "s3ghL92vyTCYYMW9HLNSTHnJxtzkx9eSBAiwQFnukHNNLURM3W5";

var expectationFns = loadExpectationFns();

/**
* Set of mixed transaction fixtures.
*/
fixtures.MixedTransactions = {
    processPaymentsRounds: 3,
    fixtures: [
    new TransactionFixture("a good transaction","gDcV24oNfhHti7LHNiTzp8Mvnm89u5BLMi", 1, 0, getSuccessExpectations, function (fixture) {
        return [
            // is good transaction is successfully submitted, and returns tefPAST_SEQ on the second submit, confirming it
            null,
            stubTransactionSubmitError(fixture, "tefPAST_SEQ", -199)
        ];
    }),
    new TransactionFixture("a sign error","signerroraddress", 2, 0, getSignErrorExpectations, function (fixture) {
        return [
            // this transaction errors when being signed right away, will ignore this sequence number and continue signing
            stubSignError(fixture, "temMALFORMED", -299)
        ];
    }),
    new TransactionFixture("a good transaction","gJ7fSAAdVfBszAxDu96V2RyHaJwKB9kdDr", 3, 1, getSuccessExpectations, function (fixture) {
        return [
            null,
            stubTransactionSubmitError(fixture, "tefPAST_SEQ", -199)
        ];
    }),
    new TransactionFixture("a don't resign error transaction - immediate error","gsP2BSyeCvkrGEzZrvx843vPvoAkfkXBLK", 4, 2, getSubmitErrorExpectations, function (fixture) {
        return [
            // this transaction returns an error immedaitely, but is applied and takes a seq number / fee
            stubReturnErrorForTxBlob(fixture, "tecPATH_DRY", 100)
        ];
    }),
    new TransactionFixture("a good transaction","gwpHuj75u94dP1MtngDipuHsPJcZnVCQbm", 5, 3, getSuccessExpectations, function (fixture) {
        return [
            null,
            stubTransactionSubmitError(fixture, "tefPAST_SEQ", -199)
        ];
    }),
    new TransactionFixture("a don't resign error transaction - resubmit error","gUXZZ5i5eveX6nL1yx6pvG8Zx7GPUVT63e", 6, 4, getApplyErrorExpectations, function (fixture) {
        return [
            // this transaction is successfully submitted, but when applied will return an error
            null,
            stubReturnErrorForTxBlob(fixture, "tecPATH_DRY", 100)
        ];
    }),
    new TransactionFixture("a resign error transaction","gDbq2eUwAmAY7ifMr3r8WPX9MCrWEZ9xRD", 7, 5, getSubmitErrorExpectations, function (fixture) {
        return [
            stubReturnErrorForTxBlob(fixture, "terRETRY", -99)
        ];
    }),
    new TransactionFixture("a good transaction","gp5bp4ZG9CgMX6frhuRhqvoZ9oRZyidbG3", 8, 6, getSuccessExpectations, function (fixture) {
        return [
            // it was signed but didn't submit because of error above
            null,
            // decrement the local sequence since this transaction was resigned
            function () {
                fixture.setSequence(5);
            },
            stubTransactionSubmitError(fixture, "tefPAST_SEQ", -199)
        ];
    })
    ]
};

/**
* A transaction fixture datastructure. This holds the state of the fixture and provides methods to get/change that state.
* Exposes these public methods:
* - getTitle - returns the title for this fixture (to be used in a describe block)
* - getRecord - returns the database row to be stored for this fixture
* - getStubs - returns an array of stub functions to be run before each Payments.processPayments()
* - getExpectations - returns an array of expectation functions to be run at the end of the tests.
*/
function TransactionFixture(title, address, id, sequence, getExpectations, getStubs) {
    var self = this;
    this.title = title + " (id " + id + ")";
    this.address = address;
    this.amount = 1;
    this.record = {id: id, address: address, amount: this.amount, memo: "success"};
    this.sequence = sequence;
    this.txblob = getTxBlobOrHash(this.address, this.amount, this.sequence);
    this.txhash = getTxBlobOrHash(this.address, this.amount, this.sequence);
    this.stubs = getStubs(this);

    // this function allows us to keep the txblob accurate as the seq num changes for future stub calls that use it
    this.setSequence = function (sequence) {
        self.sequence = sequence;
        self.txblob = getTxBlobOrHash(self.address, self.amount, self.sequence);
        self.txhash = getTxBlobOrHash(self.address, self.amount, self.sequence);
    };

    return {
        getTitle: function () { return self.title; },
        getRecord: function () { return self.record; },
        getStubs: function () { return self.stubs; },
        getExpectations: function () { return getExpectations(self); }
    };
}

/**
* Return the db record expecations for a successfully completed transaction.
*/
function getSuccessExpectations(fixture) {
    return [
        expectationFns.checkValue("txblob", fixture),
        expectationFns.checkValue("txhash", fixture),
        expectationFns.checkValue("sequence", fixture),
        expectationFns.checkPresence("error", false),
        expectationFns.checkPresence("signedAt", true),
        expectationFns.checkPresence("submittedAt", true),
        expectationFns.checkPresence("confirmedAt", true),
        expectationFns.checkPresence("abortedAt", false)
    ];
}

/**
* Return the db record expectations for a row that errors on submission.
*/
function getSubmitErrorExpectations(fixture) {
    return [
        expectationFns.checkValue("txblob", fixture),
        expectationFns.checkValue("txhash", fixture),
        expectationFns.checkValue("sequence", fixture),
        expectationFns.checkPresence("error", true),
        expectationFns.checkPresence("signedAt", true),
        expectationFns.checkPresence("submittedAt", false),
        expectationFns.checkPresence("confirmedAt", false),
        expectationFns.checkPresence("abortedAt", false)
    ];
}

/**
* Return the db record expectations for a row that succeeds on submission but errors during the apply.
* This error will be realized during the "receive tefPAST_SEQ, try to cofirm txhash, see it errored".
*/
function getApplyErrorExpectations(fixture) {
    return [
        expectationFns.checkValue("txblob", fixture),
        expectationFns.checkValue("txhash", fixture),
        expectationFns.checkValue("sequence", fixture),
        expectationFns.checkPresence("error", true),
        expectationFns.checkPresence("signedAt", true),
        expectationFns.checkPresence("submittedAt", true),
        expectationFns.checkPresence("confirmedAt", false),
        expectationFns.checkPresence("abortedAt", false)
    ];
}

/**
* Returns the db record expecations for a row that errors on signing.
*/
function getSignErrorExpectations(fixture) {
    return [
        expectationFns.checkPresence("txblob", false),
        expectationFns.checkPresence("txhash", false),
        expectationFns.checkPresence("sequence", false),
        expectationFns.checkPresence("error", true),
        expectationFns.checkPresence("signedAt", false),
        expectationFns.checkPresence("submittedAt", false),
        expectationFns.checkPresence("confirmedAt", false),
        expectationFns.checkPresence("abortedAt", false)
    ];
}

/**
* Generates an expecation function for a row.
* - checkValue - Asserts the given property of the fixture equals the resulting column in the db record.
* - checkPresence - Asserts the given property of the fixture is equal or not equal to null, depending on
*                   the truth value of given 'value'.
*/
function loadExpectationFns() {
    return {
        checkValue: function (property, fixture) {
            return {
                title: "should store correct " + property,
                expectation: function (result) {
                    assert.equal(result[property], fixture[property]);
                }
            };
        },
        checkPresence: function (property, value) {
            var negate = !value ? "not " : "";
            return {
                title: "should " + negate + "store " + property,
                expectation: function (result) {
                    var test = value ? assert.notEqual : assert.equal;
                    test(result[property], null);
                }
            };
        }
    };
}

/**
* Generates a stub function for a fixture that should return a "submit" error.
* NOTE: A submit error is not the same as the transaction's TransactionResult. For instance, a given transaction could be
* applied with tesSUCCESS, but if it was submitted again, it would return a tefPAST_SEQ on submit.
*/
function stubTransactionSubmitError(fixture, error, code) {
    var stubFn = function (stubby) {
        stubby.setTransactionSubmitError(fixture.txblob, error, code);
    };
    return stubFn;
}

/**
* Returns a stub function for a fixture that should have the given "error" for it's applied result.
* For example: tecPATH_DRY, terRETRY - these are errors are also the TransactionResult of the transaction.
*/
function stubReturnErrorForTxBlob(fixture, error, code) {
    var stubFn = function (stubby) {
        stubby.returnErrorForTxBlob(fixture.txblob, error, code);
    };
    return stubFn;
}

/**
* Returns a stub function for a fixture that should return an error trying to sign.
*/
function stubSignError(fixture, error, code) {
    var stubFn = function (stubby) {
        stubby.returnErrorWhileSigning(fixture.address, fixture.amount, error, code);
    };
    return stubFn;
}

function getTxBlobOrHash(destination, amount, sequence) {
    return STELLAR_ADDRESS + "-" + STELLAR_SECRET + "-" + destination + "-" + amount + "-" + sequence;
}