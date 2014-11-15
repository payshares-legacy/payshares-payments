var _ = require("lodash");

module.exports = function() {
  var pluginLoader  = require('gulp-load-plugins');
  var devPlugins    = pluginLoader({config: __dirname + "/package.json", lazy:false});
  var localPlugins  = pluginLoader({lazy:false});

  return _.merge({}, devPlugins, localPlugins);
};