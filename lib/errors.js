var util = require("util");

Error.subclass = function(errorName) {
    function MyError(message) {
        var tmp = Error.apply(this, [message]);
        tmp.name = this.name = errorName;

        this.stack = tmp.stack;
        this.message = message;

        return this;
    }

    var IntermediateInheritor = function() {};
    IntermediateInheritor.prototype = Error.prototype;
    MyError.prototype = new IntermediateInheritor();

    return MyError;
};

Error.prototype.setCode = function(code) {
    this.code = code;
    return this;
};

Error.prototype.setData = function(data) {
    this.data = data;
    return this;
};

var errors = module.exports;