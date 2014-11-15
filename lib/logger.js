var Logger = {};

Logger.error = function () {
    console.error(arguments);
};

Logger.info = function () {
    console.info(arguments);
};

Logger.warn = function () {
    console.info(arguments);
};

Logger.debug = function () {
    console.info(arguments);
};

module.exports = Logger;