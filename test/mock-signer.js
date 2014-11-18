var MockSigner = function () {}
MockSigner.prototype.signTransactions = function () {};
MockSigner.prototype.getSequenceNumber = function () {};
MockSigner.prototype.setSequenceNumber = function () {};
module.exports = MockSigner;